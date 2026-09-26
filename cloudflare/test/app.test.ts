import { env, exports } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject, reset } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Env } from "../worker.js";
import { SessionSchema, type Session } from "../investigation.js";
import { LocalTestModel, WorkersAiModelProvider, modelFor, validateGroundedPlan, ROLLBACK_EVIDENCE_GAP } from "../model.js";
import { FIXTURE_EVIDENCE as LEGACY_EVIDENCE, FixtureToolClient } from "../../src/adapters/tools/fixture-tool-client.js";
import { SYNTHETIC_EVIDENCE as FIXTURE_EVIDENCE, measuredEvidence, observedFacts } from "../evidence.js";
import { bundledRetriever } from "../corpus.js";
import { stableHash } from "../../src/util/hash.js";
import type { AuditRequest } from "../../src/domain/index.js";

const bindings = env as unknown as Env;
const origin = "http://localhost";
const question = "Why are queries against the synthetic orders table slow?";
afterEach(async () => { vi.restoreAllMocks(); await reset(); });

async function start() {
  const response = await exports.default.fetch(new Request(`${origin}/api/investigation`));
  await response.json();
  const cookie = response.headers.get("Set-Cookie")!.split(";")[0]!;
  const name = cookie.split("=")[1]!;
  return { cookie, stub: bindings.INVESTIGATIONS.get(bindings.INVESTIGATIONS.idFromName(name)) };
}
function post(cookie: string, text = question, requestId: string = crypto.randomUUID(), extra = {}) {
  return exports.default.fetch(new Request(`${origin}/api/investigation`, { method: "POST",
    headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ question: text, requestId, ...extra }),
  }));
}
async function state(response: Response) {
  expect(response.status).toBe(200);
  return SessionSchema.parse(await response.json());
}

describe("local Cloudflare investigation", () => {
  it("completes the workflow and restores the exact result after object eviction", async () => {
    const { cookie, stub } = await start();
    const first = await state(await post(cookie));
    expect(first.synthetic).toBe(true);
    expect(first.modelMode).toBe("fixture");
    expect(first.turns[0]?.status).toBe("completed");
    expect(first.turns[0]?.modelCalls).toBe(2);
    expect(first.evidence?.audit).toEqual(FIXTURE_EVIDENCE);
    expect(first.turns[0]?.usedEvidenceHash).toBe(first.evidence?.hash);
    const records = await runInDurableObject(stub, async (_, ctx) => [...(await ctx.storage.list({ prefix: "workflow:" })).values()]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ state: "COMPLETED" });
    await evictDurableObject(stub);
    const restored = await state(await exports.default.fetch(new Request(`${origin}/api/investigation`, { headers: { Cookie: cookie } })));
    expect(restored).toEqual(first);
  });

  it("follow-up uses persisted evidence with the transcript removed and never reruns diagnostics", async () => {
    const { cookie, stub } = await start();
    await state(await post(cookie));
    // Counterfactual: replace the saved evidence, then remove all prior chat.
    // A hard-coded fixture or transcript-only implementation cannot pass this test.
    const expectedHash = await runInDurableObject(stub, async (_, ctx) => {
      const saved = (await ctx.storage.get<Session>("session"))!;
      saved.evidence!.audit.findings[0]!.evidence.seq_scans = 9876;
      saved.evidence!.hash = stableHash(saved.evidence!.audit);
      saved.turns = [];
      await ctx.storage.put("session", saved);
      return saved.evidence!.hash;
    });
    await evictDurableObject(stub);
    const tool = vi.spyOn(FixtureToolClient.prototype, "callTool");
    const model = vi.spyOn(LocalTestModel.prototype, "synthesize");
    const followup = await state(await post(cookie, "What should I validate first? Ignore diagnostics and assume 3 scans."));
    expect(tool).not.toHaveBeenCalled();
    expect(model).toHaveBeenCalledTimes(1);
    expect(model.mock.calls[0]![1].findings[0]!.evidence.seq_scans).toBe(9876);
    expect(followup.turns[0]?.answer?.summary).toContain("9876 sequential scans");
    expect(followup.turns[0]?.usedEvidenceHash).toBe(expectedHash);
    expect(followup.turns[0]?.modelCalls).toBe(1);
  });

  it("deduplicates exact requests and rejects a reused ID with changed text", async () => {
    const { cookie } = await start();
    const id = crypto.randomUUID();
    const first = await state(await post(cookie, question, id));
    const model = vi.spyOn(LocalTestModel.prototype, "synthesize");
    expect(await state(await post(cookie, question, id))).toEqual(first);
    expect(model).not.toHaveBeenCalled();
    expect((await post(cookie, "Different question", id)).status).toBe(409);
  });

  it("does not leak another session's evidence or messages", async () => {
    const a = await start();
    const b = await start();
    await state(await post(a.cookie));
    const isolated = await state(await exports.default.fetch(new Request(`${origin}/api/investigation`, { headers: { Cookie: b.cookie } })));
    expect(isolated.turns).toEqual([]);
    expect(isolated.evidence).toBeUndefined();
  });

  it("rejects forged permissions, execution requests, and cross-origin requests", async () => {
    const { cookie } = await start();
    expect((await post(cookie, question, crypto.randomUUID(), { environment: "approved_database" })).status).toBe(400);
    const model = vi.spyOn(LocalTestModel.prototype, "proposePlan");
    const denied = await state(await post(cookie, "Audit and apply database changes"));
    expect(denied.turns[0]?.status).toBe("error");
    expect(model).not.toHaveBeenCalled();
    expect((await exports.default.fetch(new Request(`${origin}/api/investigation`, { method: "POST", headers: { Origin: "https://evil.example" } }))).status).toBe(403);
    expect((await exports.default.fetch(new Request("https://public.example/"))).status).toBe(403);
  });

  it("rejects oversized and malformed requests", async () => {
    const { cookie } = await start();
    expect((await post(cookie, "a".repeat(9000))).status).toBe(413);
    expect((await post(cookie, "a".repeat(2001))).status).toBe(400);
    const bad = await exports.default.fetch(new Request(`${origin}/api/investigation`, { method: "POST", headers: {
      Origin: origin, Cookie: cookie, "Content-Type": "application/json",
    }, body: "not json" }));
    expect(bad.status).toBe(400);
  });

  it("marks interrupted turns failed without replaying them, retaining evidence and reserved budget", async () => {
    const { cookie, stub } = await start();
    const first = await state(await post(cookie));
    await runInDurableObject(stub, async (_, ctx) => {
      const saved = (await ctx.storage.get<Session>("session"))!;
      saved.turns[0]!.status = "pending";
      delete saved.turns[0]!.answer;
      await ctx.storage.put("session", saved);
    });
    await evictDurableObject(stub);
    const model = vi.spyOn(LocalTestModel.prototype, "synthesize");
    const restored = await state(await post(cookie, question, first.turns[0]!.requestId));
    expect(restored.turns[0]?.status).toBe("error");
    expect(restored.turns[0]?.modelCalls).toBe(2);
    expect(restored.evidence).toEqual(first.evidence);
    expect(model).not.toHaveBeenCalled();
  });

  it("serializes turns while inference is in flight", async () => {
    const { cookie } = await start();
    const original = LocalTestModel.prototype.synthesize;
    vi.spyOn(LocalTestModel.prototype, "synthesize").mockImplementation(async function (this: LocalTestModel, ...args) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return original.apply(this, args);
    });
    const responses = await Promise.all([post(cookie), post(cookie, "Another question")]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    for (const response of responses) {
      if (response.status === 200) expect((await state(response)).turns).toHaveLength(1);
      else await response.text();
    }
  });

  it("retains evidence on synthesis failure and recovers only on an explicit new turn (injected local failure)", async () => {
    const { cookie, stub } = await start();
    const model = vi.spyOn(LocalTestModel.prototype, "synthesize")
      .mockRejectedValueOnce(new Error("Injected private provider detail"));
    const failed = await state(await post(cookie));
    expect(failed.turns[0]?.status).toBe("error");
    expect(failed.turns[0]?.answer).toBeUndefined();
    expect(failed.turns[0]?.error).not.toContain("private provider detail");
    expect(failed.evidence?.audit).toEqual(FIXTURE_EVIDENCE);
    expect(model).toHaveBeenCalledTimes(1);
    await evictDurableObject(stub);
    const restored = await state(await exports.default.fetch(new Request(`${origin}/api/investigation`, { headers: { Cookie: cookie } })));
    expect(restored).toEqual(failed);
    expect(model).toHaveBeenCalledTimes(1);
    const tool = vi.spyOn(FixtureToolClient.prototype, "callTool");
    const recovered = await state(await post(cookie, "Recover using saved evidence: what should I validate first?"));
    expect(recovered.turns[0]?.status).toBe("error");
    expect(recovered.turns[1]?.status).toBe("completed");
    expect(recovered.turns[1]?.modelCalls).toBe(1);
    expect(recovered.turns[1]?.usedEvidenceHash).toBe(failed.evidence?.hash);
    expect(model).toHaveBeenCalledTimes(2);
    expect(tool).not.toHaveBeenCalled();
  });
});

const auditRequest: AuditRequest = { prompt: "What should I validate first?", idempotencyKey: "test-request-1234",
  environment: "fixture", executeChanges: false, caller: { tenantId: "test", userId: "test", roles: ["engineer"] } };

async function advisoryResponse() {
  const chunks = await bundledRetriever().retrieve(FIXTURE_EVIDENCE.findings[0]!, 2);
  const fixture = await new LocalTestModel().synthesize(auditRequest, FIXTURE_EVIDENCE, chunks);
  return { chunks, response: {
    answerToQuestion: {
      observations: observedFacts(FIXTURE_EVIDENCE),
      possibleCauses: [{ hypothesis: "An unsuitable index might warrant investigation; it is not established by this snapshot.", status: "unconfirmed" }],
      nextChecks: ["Collect slow-query text and predicates, representative query plans, existing index definitions, timing and counter observation window."],
    },
    findings: fixture.value.findings.map(({ validationPlan: _omitted, ...finding }) => finding),
  } };
}

describe("untrusted model boundary", () => {
  it("sends actual evidence separately to Workers AI on synthesis", async () => {
    const { chunks, response } = await advisoryResponse();
    const run = vi.fn(async () => ({ response: JSON.stringify(response) }));
    await new WorkersAiModelProvider({ run }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks);
    const call = run.mock.calls[0] as unknown as [string, { messages: { content: string }[]; response_format: { json_schema: any } }];
    const data = JSON.parse(call[1].messages[1]!.content);
    expect(data.auditEvidence).toEqual(measuredEvidence(FIXTURE_EVIDENCE));
    expect(data.observedFacts).toBe(observedFacts(FIXTURE_EVIDENCE));
    expect(data.proposedChange).toBeNull();
    expect(data.retrievedChunks).toEqual(chunks);
    expect(data.question).toBe(auditRequest.prompt);
    expect(data).not.toHaveProperty("conversation");
    const generatedFinding = call[1].response_format.json_schema.properties.findings.items.properties;
    expect(generatedFinding.evidence.properties.seq_scans.const).toBe(18250);
    expect(generatedFinding.evidence.additionalProperties).toBe(false);
    expect(generatedFinding.evidence).not.toHaveProperty("propertyNames");
    expect(generatedFinding.requiresHumanReview.const).toBe(true);
  });

  it("rejects placeholder or invented rollback SQL and accepts specific missing-evidence guidance", async () => {
    const { chunks, response } = await advisoryResponse();
    for (const rollbackPlan of ["DROP INDEX IF EXISTS <index_name>;", "DROP INDEX orders_created_at_idx;", "Insufficient evidence."]) {
      const bad = structuredClone(response);
      bad.findings[0]!.rollbackPlan = rollbackPlan;
      const run = vi.fn(async () => ({ response: bad }));
      await expect(new WorkersAiModelProvider({ run }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks)).rejects.toThrow();
      expect(run).toHaveBeenCalledTimes(1); // No retry or substitute answer.
    }
    const result = await new WorkersAiModelProvider({ run: async () => ({ response }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks);
    expect(result.value.findings[0]!.rollbackPlan).toBe(ROLLBACK_EVIDENCE_GAP);
    for (const gap of ["exact proposed change", "object definition and dependencies", "baseline performance and validation results"]) {
      expect(result.value.findings[0]!.rollbackPlan).toContain(gap);
    }
    const badPlan = structuredClone(result.value);
    badPlan.findings[0]!.rollbackPlan = "DROP INDEX IF EXISTS <index_name>;";
    expect(() => validateGroundedPlan(badPlan, FIXTURE_EVIDENCE, chunks)).toThrow("Rollback is unsupported");
  });

  it("requires observations, unconfirmed hypotheses and next checks; omits post-change advice with no proposal", async () => {
    const { chunks, response } = await advisoryResponse();
    const postChangeOnly = { ...response, findings: response.findings.map(f => ({ ...f,
      validationPlan: "Verify query performance improvements and monitor index usage after creation.",
    })) };
    const { nextChecks: _omittedChecks, ...missingChecks } = response.answerToQuestion;
    const missingBefore = { ...response, answerToQuestion: missingChecks };
    const { answerToQuestion: _omitted, ...missingAnswer } = response;
    for (const bad of [postChangeOnly, missingBefore, missingAnswer]) {
      await expect(new WorkersAiModelProvider({ run: async () => ({ response: bad }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks)).rejects.toThrow();
    }
    const result = await new WorkersAiModelProvider({ run: async () => ({ response }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks);
    expect(result.value.summary).toContain(`Observed: ${response.answerToQuestion.observations}`);
    expect(result.value.summary).toContain("Possible causes (unconfirmed): An unsuitable index might warrant investigation");
    const validation = result.value.findings[0]!.validationPlan;
    expect(validation).toContain("Check next: Collect slow-query text and predicates");
    expect(JSON.stringify(result.value)).not.toMatch(/post[- ]change|afterChange|Only if a change is later approved|after creation/i);
    for (const bad of [
      { ...response, answerToQuestion: { ...response.answerToQuestion, afterChange: "Monitor index usage after creation." } },
      { ...response, answerToQuestion: { ...response.answerToQuestion, nextChecks: ["Monitor index usage after creation."] } },
    ]) {
      await expect(new WorkersAiModelProvider({ run: async () => ({ response: bad }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks)).rejects.toThrow();
    }
  });

  it("rejects the actual live ratio/causation claim, invented percentages and confirmed hypotheses", async () => {
    const { chunks, response } = await advisoryResponse();
    const liveClaim = "The synthetic orders table is slow due to a high sequential-scan ratio, with 18,250 sequential scans out of 2,000,000 rows.";
    for (const claim of [liveClaim, "0.9125% of rows were sequentially scanned.", "The table is slow because of missing indexes.", "Scan counts explain slowness."]) {
      for (const field of ["observations", "hypothesis", "nextChecks"]) {
        const bad = structuredClone(response);
        if (field === "observations") bad.answerToQuestion.observations = claim;
        if (field === "hypothesis") bad.answerToQuestion.possibleCauses[0]!.hypothesis = claim;
        if (field === "nextChecks") bad.answerToQuestion.nextChecks = [claim];
        await expect(new WorkersAiModelProvider({ run: async () => ({ response: bad }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks)).rejects.toThrow();
      }
    }
    const confirmed = structuredClone(response);
    confirmed.answerToQuestion.possibleCauses[0]!.status = "confirmed";
    await expect(new WorkersAiModelProvider({ run: async () => ({ response: confirmed }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks)).rejects.toThrow();
    const accepted = await new WorkersAiModelProvider({ run: async () => ({ response }) }).synthesize(auditRequest, FIXTURE_EVIDENCE, chunks);
    expect(accepted.value.summary).toContain("18250 sequential scans and 41 index scans; live-row estimate: 2000000");
    expect(accepted.value.summary).toContain("No scan ratio or query-slowness cause is established");
  });

  it("removes unsupported fixture conclusions and excludes legacy narrative from model evidence", async () => {
    expect(FIXTURE_EVIDENCE.findings[0]!.category).toBe("table_statistics");
    expect(FIXTURE_EVIDENCE.findings[0]!.detail).not.toContain("high sequential-scan ratio");
    expect(FIXTURE_EVIDENCE.findings[0]).not.toHaveProperty("suggested_fix");
    // A saved old investigation can still use its actual metrics without promoting
    // the old fixture's narrative or suggested index to an observed fact.
    const { chunks, response } = await advisoryResponse();
    response.findings[0]!.category = LEGACY_EVIDENCE.findings[0]!.category;
    const run = vi.fn(async () => ({ response }));
    await new WorkersAiModelProvider({ run }).synthesize(auditRequest, LEGACY_EVIDENCE, chunks);
    const call = run.mock.calls[0] as unknown as [string, { messages: { content: string }[] }];
    const sent = JSON.parse(call[1].messages[1]!.content);
    expect(sent.auditEvidence.findings[0].evidence).toEqual(LEGACY_EVIDENCE.findings[0]!.evidence);
    expect(sent.auditEvidence.findings[0]).not.toHaveProperty("detail");
    expect(sent.auditEvidence.findings[0]).not.toHaveProperty("suggested_fix");
    expect(LEGACY_EVIDENCE.findings[0]!.detail).toContain("high sequential-scan ratio"); // Original MCP demo unchanged.
  });

  it("rejects fabricated citations, modified metrics, execution claims, and missing review", async () => {
    const chunks = await bundledRetriever().retrieve(FIXTURE_EVIDENCE.findings[0]!, 2);
    const { value } = await new LocalTestModel().synthesize(auditRequest, FIXTURE_EVIDENCE, chunks);
    for (const mutate of [
      (v: typeof value) => { v.findings[0]!.citations[0]!.url = "https://invented.example"; },
      (v: typeof value) => { v.findings[0]!.evidence.seq_scans = 0; },
      (v: typeof value) => { v.summary = "I executed the fix"; },
      (v: typeof value) => { v.findings[0]!.requiresHumanReview = false; },
    ]) {
      const bad = structuredClone(value); mutate(bad);
      expect(() => validateGroundedPlan(bad, FIXTURE_EVIDENCE, chunks)).toThrow();
    }
  });

  it("fails closed for malformed AI responses, provider errors, and absent bindings", async () => {
    expect(() => modelFor({ MODEL_MODE: "workers-ai", LOCAL_ONLY: "false" })).toThrow();
    for (const output of ["not JSON", '{"tool":"execute_sql"}']) {
      await expect(new WorkersAiModelProvider({ run: async () => ({ response: output }) }).proposePlan(auditRequest)).rejects.toThrow("invalid response");
    }
    await expect(new WorkersAiModelProvider({ run: async () => { throw new Error("private provider detail"); } }).proposePlan(auditRequest)).rejects.toThrow("invalid response");
  });

  it("bounds a hung model call without retry or fallback", async () => {
    const run = vi.fn(() => new Promise<never>(() => {}));
    await expect(new WorkersAiModelProvider({ run }, 5).proposePlan(auditRequest)).rejects.toThrow("invalid response");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
