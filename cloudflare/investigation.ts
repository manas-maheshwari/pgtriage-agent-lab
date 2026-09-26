import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import { AuditEvidenceSchema, RemediationPlanSchema, AuditRequestSchema, type AuditRequest } from "../src/domain/index.js";
import { RetrievedChunkSchema } from "../src/domain/retrieval.js";
import { AgentOrchestrator } from "../src/runtime/orchestrator.js";
import { PolicyEngine } from "../src/runtime/policy.js";
import { FixtureToolClient } from "../src/adapters/tools/fixture-tool-client.js";
import { stableHash } from "../src/util/hash.js";
import type { ModelProvider } from "../src/ports/model-provider.js";
import { bundledRetriever } from "./corpus.js";
import { modelFor, validateGroundedPlan, PROMPT_VERSION } from "./model.js";
import { DurableWorkflowStore } from "./store.js";
import type { Env } from "./worker.js";
import { SHARED_QUOTA } from "./quota.js";
import { SYNTHETIC_EVIDENCE } from "./evidence.js";

export const TurnInput = z.object({ requestId: z.uuid(), question: z.string().trim().min(1).max(2000)
  .refine((value) => new TextEncoder().encode(value).length <= 2000) }).strict();
export const SessionSchema = z.object({
  version: z.literal(1), synthetic: z.literal(true), incident: z.enum(["orders-scan-v1", "orders-observations-v2"]),
  modelMode: z.string(), promptVersion: z.string(),
  inferenceEnabled: z.boolean().optional(),
  evidence: z.object({ audit: AuditEvidenceSchema, chunks: z.array(RetrievedChunkSchema), hash: z.string() }).optional(),
  turns: z.array(z.object({
    requestId: z.string(), question: z.string(), status: z.enum(["pending", "completed", "error"]),
    createdAt: z.string(), answer: RemediationPlanSchema.optional(), error: z.string().optional(),
    usedEvidenceHash: z.string().optional(), modelCalls: z.number(), promptVersion: z.string().optional(),
  })),
});
export type Session = z.infer<typeof SessionSchema>;

export class Investigation extends DurableObject<Env> {
  private running = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A runtime restart is not permission to replay an ambiguous operation.
    // Leave durable evidence intact; a new turn can use it without rerunning tools.
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<Session>("session");
      if (!saved) return;
      let changed = false;
      for (const turn of saved.turns) {
        if (turn.status === "pending") {
          turn.status = "error";
          turn.error = "Investigation interrupted. Send a new question to continue from any saved evidence.";
          changed = true;
        }
      }
      if (changed) await ctx.storage.put("session", saved);
    });
  }

  async snapshot(): Promise<Session> {
    const saved = await this.ctx.storage.get("session");
    const session: Session = saved === undefined ? {
      version: 1, synthetic: true, incident: "orders-observations-v2", modelMode: this.env.MODEL_MODE,
      promptVersion: PROMPT_VERSION, turns: [],
    } : SessionSchema.parse(saved);
    if (this.env.LOCAL_ONLY === "false") {
      session.inferenceEnabled = this.env.QUOTA ? (await this.env.QUOTA.get(this.env.QUOTA.idFromName(SHARED_QUOTA)).status()).enabled : false;
    }
    return session;
  }

  override async fetch(request: Request): Promise<Response> {
    const owner = request.headers.get("X-Investigation-Owner") ?? (this.env.LOCAL_ONLY === "true" ? "local-review" : "");
    if (!owner) return Response.json({ error: "Access denied" }, { status: 403 });
    const owns = await this.ctx.storage.transaction(async (tx) => {
      const existing = await tx.get<string>("owner");
      if (existing && existing !== owner) return false;
      if (!existing) await tx.put("owner", owner);
      return true;
    });
    if (!owns) return Response.json({ error: "Access denied" }, { status: 403 });
    if (request.method === "GET") return Response.json(await this.snapshot());
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (this.running) return Response.json({ error: "An investigation turn is already running." }, { status: 409 });
    this.running = true; // Set before any await: DO requests can interleave at awaits.
    try {
      const input = TurnInput.safeParse(await request.json());
      if (!input.success) return Response.json({ error: "Invalid question or request ID." }, { status: 400 });
      const session = await this.snapshot();
      const existing = session.turns.find((turn) => turn.requestId === input.data.requestId);
      if (existing) {
        if (existing.question !== input.data.question) return Response.json({ error: "Request ID reused with a different question." }, { status: 409 });
        return Response.json(session);
      }
      if (session.turns.length >= 8) return Response.json({ error: "This investigation has reached its 8-turn limit. Start a new one." }, { status: 429 });
      const turn: Session["turns"][number] = { ...input.data, status: "pending", createdAt: new Date().toISOString(), modelCalls: 0, promptVersion: PROMPT_VERSION };
      session.turns.push(turn);
      await this.ctx.storage.put("session", session);
      try {
        const auditRequest = AuditRequestSchema.parse({ prompt: turn.question, idempotencyKey: turn.requestId,
          environment: "fixture", executeChanges: false,
          caller: { tenantId: "synthetic", userId: "session-owner", roles: ["engineer"] } });
        new PolicyEngine().validateRequest(auditRequest);
        const provider = modelFor(this.env);
        const model = this.boundedModel(provider, session, turn);
        if (session.evidence) {
          // Deliberately read the saved snapshot from storage, not the transcript or a new fixture.
          const saved = SessionSchema.parse(await this.ctx.storage.get("session")).evidence!;
          if (stableHash(saved.audit) !== saved.hash) throw new Error("Evidence integrity check failed");
          turn.usedEvidenceHash = saved.hash;
          const result = await model.synthesize(auditRequest, saved.audit, saved.chunks);
          turn.answer = result.value;
        } else {
          const workflow = await new AgentOrchestrator({
            model, tools: new FixtureToolClient({ evidence: SYNTHETIC_EVIDENCE }), store: new DurableWorkflowStore(this.ctx.storage),
            retriever: bundledRetriever(),
            traces: { record: async (event) => { console.info(JSON.stringify({
              workflowId: event.workflowId, kind: event.kind, name: event.name,
              status: event.status, durationMs: event.durationMs,
            })); } },
            budget: { maxModelCalls: 2, maxToolCalls: 1, maxRetriesPerOperation: 0, maxElapsedMs: 60_000, toolTimeoutMs: 1000 },
          }).run(auditRequest);
          if (workflow.state !== "COMPLETED" || !workflow.result) throw new Error("Investigation failed");
          turn.answer = workflow.result;
        }
        turn.status = "completed";
      } catch {
        // Store a bounded public error, never raw model/tool/provider errors.
        turn.status = "error";
        turn.error = "Unable to produce a validated advisory answer. No changes were executed. You can ask again using saved evidence.";
      }
      await this.ctx.storage.put("session", session);
      return Response.json(session);
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    } finally { this.running = false; }
  }

  private boundedModel(provider: ModelProvider, session: Session, turn: Session["turns"][number]): ModelProvider {
    const deadline = Date.now() + 60_000;
    const limit = session.evidence ? 1 : 2;
    const consume = async () => {
      if (Date.now() > deadline || turn.modelCalls >= limit) throw new Error("Turn budget exceeded");
      turn.modelCalls += 1;
      await this.ctx.storage.put("session", session); // Budget reserved before inference.
    };
    return {
      proposePlan: async (request: AuditRequest) => {
        await consume();
        return provider.proposePlan(request);
      },
      synthesize: async (request, evidence, chunks) => {
        if (!session.evidence) {
          session.evidence = { audit: evidence, chunks: [...chunks], hash: stableHash(evidence) };
        }
        turn.usedEvidenceHash = session.evidence.hash;
        await consume(); // Also checkpoints evidence before synthesis.
        const result = await provider.synthesize(request, evidence, chunks);
        const plan = RemediationPlanSchema.parse(result.value);
        validateGroundedPlan(plan, evidence, chunks);
        return { ...result, value: plan };
      },
    };
  }
}
