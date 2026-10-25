import { randomUUID } from "node:crypto";

import {
  AuditEvidenceSchema,
  AuditRequestSchema,
  RemediationPlanSchema,
  ToolPlanSchema,
  type AuditRequest,
  type AuthorizedTool,
  type WorkflowRecord,
  type WorkflowState,
} from "../domain/index.js";
import type { RetrievedChunk } from "../domain/retrieval.js";
import type { ModelProvider } from "../ports/model-provider.js";
import type { Retriever } from "../ports/retriever.js";
import type { ToolClient } from "../ports/tool-client.js";
import type { TraceRecorder } from "../ports/trace-recorder.js";
import type {
  WorkflowPatch,
  WorkflowStore,
} from "../ports/workflow-store.js";
import { stableHash } from "../util/hash.js";
import { RuntimeBudget, type RuntimeBudgetConfig } from "./budgets.js";
import {
  AgentRuntimeError,
  AmbiguousToolDispatchError,
  PreDispatchToolError,
  normalizeError,
} from "./errors.js";
import { PolicyEngine } from "./policy.js";
import { traced } from "../observability/tracing.js";

const TERMINAL_STATES: readonly WorkflowState[] = [
  "COMPLETED",
  "TERMINAL_FAILURE",
  "CANCELLED",
];

export interface OrchestratorDependencies {
  model: ModelProvider;
  tools: ToolClient;
  store: WorkflowStore;
  retriever: Retriever;
  traces: TraceRecorder;
  policy?: PolicyEngine;
  budget?: RuntimeBudgetConfig;
  workerId?: string;
  leaseTtlMs?: number;
  retrievalLimit?: number;
}

export class AgentOrchestrator {
  private readonly policy: PolicyEngine;
  private readonly workerId: string;
  private readonly leaseTtlMs: number;
  private readonly retrievalLimit: number;

  constructor(private readonly dependencies: OrchestratorDependencies) {
    this.policy = dependencies.policy ?? new PolicyEngine();
    this.workerId = dependencies.workerId ?? randomUUID();
    this.leaseTtlMs = dependencies.leaseTtlMs ?? 60_000;
    this.retrievalLimit = dependencies.retrievalLimit ?? 2;
    if (!Number.isInteger(this.retrievalLimit) || this.retrievalLimit < 1) {
      throw new Error("retrievalLimit must be a positive integer.");
    }
  }

  async run(input: unknown): Promise<WorkflowRecord> {
    const request = AuditRequestSchema.parse(input);
    const created = await this.dependencies.store.createOrGet(request);
    if (TERMINAL_STATES.includes(created.workflow.state)) {
      return created.workflow;
    }

    const leased = await this.dependencies.store.acquireLease(
      created.workflow.workflowId,
      this.workerId,
      this.leaseTtlMs,
    );
    if (!leased) {
      throw new AgentRuntimeError(
        "WORKFLOW_BUSY",
        "Another worker currently owns this workflow.",
        true,
      );
    }

    const budget = new RuntimeBudget(this.dependencies.budget);
    let workflow = created.workflow;

    try {
      this.policy.validateRequest(request);
      workflow = await this.resume(workflow, request, budget);
      return workflow;
    } catch (error) {
      const normalized = normalizeError(error);
      const latest =
        (await this.dependencies.store.get(workflow.workflowId)) ?? workflow;
      if (TERMINAL_STATES.includes(latest.state)) {
        return latest;
      }
      return this.transition(
        latest,
        "TERMINAL_FAILURE",
        normalized.message,
        {
          error: {
            code: normalized.code,
            message: normalized.message,
            retryable: normalized.retryable,
          },
        },
      );
    } finally {
      await this.dependencies.store.releaseLease(
        workflow.workflowId,
        this.workerId,
      );
    }
  }

  private async resume(
    initial: WorkflowRecord,
    request: AuditRequest,
    budget: RuntimeBudget,
  ): Promise<WorkflowRecord> {
    let workflow = initial;

    if (workflow.state === "RECEIVED") {
      workflow = await this.transition(workflow, "PLANNING", "Request accepted.");
    }

    if (workflow.state === "PLANNING") {
      const planResult = await this.retry(
        workflow.workflowId,
        "plan",
        budget,
        async () => {
          budget.consumeModelCall();
          return traced(
            this.dependencies.traces,
            { workflowId: workflow.workflowId, kind: "model", name: "plan" },
            () => this.dependencies.model.proposePlan(request),
          );
        },
      );
      const plan = ToolPlanSchema.parse(planResult.value);
      this.policy.validatePlanScope(request, plan);
      workflow = await this.transition(
        workflow,
        "PLAN_VALIDATED",
        "Planner output passed the tool-plan schema and caller-scope policy.",
        { plan, planHash: stableHash(plan), error: null },
      );
    }

    if (workflow.state === "PLAN_VALIDATED") {
      if (!workflow.plan) {
        throw new AgentRuntimeError(
          "MISSING_PLAN",
          "The workflow reached PLAN_VALIDATED without a plan.",
          false,
        );
      }
      const descriptor = await this.retry(
        workflow.workflowId,
        "capability-discovery",
        budget,
        async () => {
          budget.assertTime();
          const tools = await this.dependencies.tools.listTools();
          return traced(
            this.dependencies.traces,
            {
              workflowId: workflow.workflowId,
              kind: "policy",
              name: "authorize-tool",
              attributes: {
                schemaScope: request.schemaName ?? "all-non-system-schemas",
              },
            },
            async () => this.policy.authorizeTool(workflow.plan!, tools),
          );
        },
        (error) => error instanceof PreDispatchToolError,
      );
      const authorizedTool: AuthorizedTool = {
        name: "full_audit",
        readOnlyHint: true,
        ...(descriptor.destructiveHint === undefined
          ? {}
          : { destructiveHint: descriptor.destructiveHint }),
        ...(descriptor.idempotentHint === undefined
          ? {}
          : { idempotentHint: descriptor.idempotentHint }),
      };
      workflow = await this.transition(
        workflow,
        "TOOL_AUTHORIZED",
        "Execution-time policy authorized the read-only tool.",
        { authorizedTool },
      );
    }

    if (workflow.state === "TOOL_AUTHORIZED") {
      workflow = await this.transition(
        workflow,
        "TOOL_RUNNING",
        "Starting the authorized MCP tool.",
        { auditRunId: workflow.auditRunId ?? workflow.workflowId },
      );
    }

    if (workflow.state === "TOOL_RUNNING") {
      if (!workflow.plan) {
        throw new AgentRuntimeError(
          "MISSING_PLAN",
          "The workflow cannot execute a tool without a plan.",
          false,
        );
      }
      if (!workflow.authorizedTool) {
        throw new AgentRuntimeError(
          "MISSING_TOOL_AUTHORIZATION",
          "The workflow cannot execute a tool without persisted authorization metadata.",
          false,
        );
      }
      const evidence = await this.executeAuditWithReconciliation(
        workflow,
        budget,
      );
      const parsedEvidence = AuditEvidenceSchema.safeParse(evidence);
      if (!parsedEvidence.success) {
        throw new AgentRuntimeError(
          "TOOL_EVIDENCE_INVALID",
          "Tool evidence failed structural or summary-consistency validation.",
          false,
          { cause: parsedEvidence.error },
        );
      }
      const validatedEvidence = parsedEvidence.data;
      workflow = await this.transition(
        workflow,
        "TOOL_COMPLETE",
        "Tool evidence passed runtime validation.",
        {
          toolEvidence: validatedEvidence,
          toolResultHash: stableHash(validatedEvidence),
          error: null,
        },
      );
    }

    let retrievedChunks: readonly RetrievedChunk[] = [];
    if (workflow.state === "TOOL_COMPLETE") {
      if (!workflow.toolEvidence) {
        throw new AgentRuntimeError(
          "MISSING_TOOL_EVIDENCE",
          "The workflow reached TOOL_COMPLETE without evidence.",
          false,
        );
      }
      retrievedChunks = await this.retrieveEvidence(workflow);
      workflow = await this.transition(
        workflow,
        "SYNTHESIZING",
        "Evidence retrieval completed.",
      );
    }

    if (workflow.state === "SYNTHESIZING") {
      if (!workflow.toolEvidence) {
        throw new AgentRuntimeError(
          "MISSING_TOOL_EVIDENCE",
          "The workflow cannot synthesize without tool evidence.",
          false,
        );
      }
      if (retrievedChunks.length === 0) {
        retrievedChunks = await this.retrieveEvidence(workflow);
      }
      const synthesis = await this.retry(
        workflow.workflowId,
        "synthesize",
        budget,
        async () => {
          budget.consumeModelCall();
          return traced(
            this.dependencies.traces,
            { workflowId: workflow.workflowId, kind: "model", name: "synthesize" },
            () =>
              this.dependencies.model.synthesize(
                request,
                workflow.toolEvidence!,
                retrievedChunks,
              ),
          );
        },
      );
      const result = RemediationPlanSchema.parse(synthesis.value);
      workflow = await this.transition(
        workflow,
        "OUTPUT_VALIDATED",
        "Remediation output passed its runtime schema.",
        { result, error: null },
      );
    }

    if (workflow.state === "OUTPUT_VALIDATED") {
      if (!workflow.result) {
        throw new AgentRuntimeError(
          "MISSING_RESULT",
          "The workflow reached OUTPUT_VALIDATED without a result.",
          false,
        );
      }
      await traced(
        this.dependencies.traces,
        { workflowId: workflow.workflowId, kind: "policy", name: "validate-output" },
        async () => this.policy.validateOutput(workflow.result!),
      );
      workflow = await this.transition(
        workflow,
        "POLICY_CHECKED",
        "The advisory-only output policy passed.",
      );
    }

    if (workflow.state === "POLICY_CHECKED") {
      workflow = await this.transition(
        workflow,
        "COMPLETED",
        "Workflow completed successfully.",
      );
    }

    return workflow;
  }

  private async retrieveEvidence(
    workflow: WorkflowRecord,
  ): Promise<readonly RetrievedChunk[]> {
    const findings = workflow.toolEvidence?.findings ?? [];
    const chunks = await traced(
      this.dependencies.traces,
      { workflowId: workflow.workflowId, kind: "retrieval", name: "retrieve" },
      async () => {
        const perFinding = await Promise.all(
          findings.map((finding) =>
            this.dependencies.retriever.retrieve(finding, this.retrievalLimit),
          ),
        );
        const unique = new Map<string, RetrievedChunk>();
        for (const chunk of perFinding.flat()) {
          const current = unique.get(chunk.chunkId);
          if (!current || chunk.score > current.score) {
            unique.set(chunk.chunkId, chunk);
          }
        }
        return [...unique.values()].sort((left, right) => right.score - left.score);
      },
    );
    return chunks;
  }

  private async executeAuditWithReconciliation(
    workflow: WorkflowRecord,
    budget: RuntimeBudget,
  ) {
    const plan = workflow.plan!;
    const authorizedTool = workflow.authorizedTool!;
    const auditRunId = workflow.auditRunId ?? workflow.workflowId;

    return this.retry(
      workflow.workflowId,
      "tool",
      budget,
      async () => {
        const beforeDispatch = await this.lookupAuditRun(
          workflow.workflowId,
          auditRunId,
          budget.config.toolTimeoutMs,
        );
        const recovered = evidenceFromLookup(beforeDispatch, auditRunId);
        if (recovered) return recovered;

        budget.consumeToolCall();
        try {
          return await traced(
            this.dependencies.traces,
            {
              workflowId: workflow.workflowId,
              kind: "tool",
              name: plan.tool,
              attributes: {
                auditRunId,
                schemaScope:
                  plan.arguments.schemaName ?? "all-non-system-schemas",
                idempotentHint: authorizedTool.idempotentHint ?? false,
              },
            },
            () =>
              this.dependencies.tools.callTool(plan, {
                workflowId: auditRunId,
                timeoutMs: budget.config.toolTimeoutMs,
              }),
          );
        } catch (error) {
          const normalized = normalizeError(error);
          if (!(normalized instanceof AmbiguousToolDispatchError)) throw normalized;

          const afterDispatch = await this.lookupAuditRun(
            workflow.workflowId,
            auditRunId,
            budget.config.toolTimeoutMs,
          );
          const recoveredAfterFailure = evidenceFromLookup(
            afterDispatch,
            auditRunId,
          );
          if (recoveredAfterFailure) return recoveredAfterFailure;
          if (afterDispatch.status === "NOT_FOUND") {
            throw new PreDispatchToolError(
              "AUDIT_RUN_NOT_FOUND_AFTER_AMBIGUOUS_DISPATCH",
              "pgtriage confirmed that no durable audit operation exists; dispatch may be retried.",
              { cause: normalized },
            );
          }
          throw new AgentRuntimeError(
            "AUDIT_RECONCILIATION_INVALID",
            "The audit reconciliation response did not produce a safe recovery decision.",
            false,
          );
        }
      },
      (error) => canRetryToolCall(error, authorizedTool),
    );
  }

  private async lookupAuditRun(
    workflowId: string,
    auditRunId: string,
    timeoutMs: number,
  ) {
    return traced(
      this.dependencies.traces,
      {
        workflowId,
        kind: "tool",
        name: "get_audit_run",
        attributes: { auditRunId },
      },
      () => this.dependencies.tools.getAuditRun(auditRunId, timeoutMs),
    );
  }

  private async transition(
    workflow: WorkflowRecord,
    to: WorkflowState,
    reason: string,
    patch: WorkflowPatch = {},
  ): Promise<WorkflowRecord> {
    const next = await this.dependencies.store.transition(
      workflow.workflowId,
      workflow.state,
      to,
      reason,
      patch,
    );
    const now = new Date().toISOString();
    await this.dependencies.traces.record({
      workflowId: workflow.workflowId,
      spanId: randomUUID(),
      kind: "workflow",
      name: `${workflow.state}->${to}`,
      startedAt: now,
      endedAt: now,
      durationMs: 0,
      status: to === "TERMINAL_FAILURE" ? "error" : "ok",
      attributes: { reason },
    });
    return next;
  }

  private async retry<T>(
    workflowId: string,
    operationName: string,
    budget: RuntimeBudget,
    operation: () => Promise<T>,
    shouldRetry: (error: AgentRuntimeError) => boolean = (error) => error.retryable,
  ): Promise<T> {
    const maxRetries = budget.config.maxRetriesPerOperation;
    let attempt = 0;
    while (true) {
      try {
        return await operation();
      } catch (error) {
        const normalized = normalizeError(error);
        if (!shouldRetry(normalized) || attempt >= maxRetries) {
          throw normalized;
        }
        attempt += 1;
        const now = new Date().toISOString();
        await this.dependencies.traces.record({
          workflowId,
          spanId: randomUUID(),
          kind: "retry",
          name: operationName,
          startedAt: now,
          endedAt: now,
          durationMs: 0,
          status: "error",
          attributes: { attempt, errorCode: normalized.code },
        });
      }
    }
  }
}

function evidenceFromLookup(
  lookup: Awaited<ReturnType<ToolClient["getAuditRun"]>>,
  auditRunId: string,
) {
  if (lookup.audit_run_id !== auditRunId) {
    throw new AgentRuntimeError(
      "AUDIT_RUN_ID_MISMATCH",
      "The reconciliation response referred to a different audit operation.",
      false,
    );
  }
  if (lookup.status === "NOT_FOUND") return undefined;
  if (lookup.status === "COMPLETED") {
    if (!lookup.result) {
      throw new AgentRuntimeError(
        "AUDIT_RECONCILIATION_INVALID",
        "A completed audit operation did not include recoverable evidence.",
        false,
      );
    }
    return lookup.result;
  }
  throw reconciliationStateError(lookup.status, auditRunId);
}

function reconciliationStateError(
  status: Exclude<
    Awaited<ReturnType<ToolClient["getAuditRun"]>>["status"],
    "NOT_FOUND" | "COMPLETED"
  >,
  auditRunId: string,
): AgentRuntimeError {
  const details = {
    STARTED: [
      "AUDIT_RUN_IN_PROGRESS",
      `Audit run '${auditRunId}' may still be running; it was not replayed.`,
    ],
    FAILED: [
      "AUDIT_RUN_FAILED",
      `Audit run '${auditRunId}' previously failed and was not replayed.`,
    ],
    EXPIRED: [
      "AUDIT_RUN_EXPIRED",
      `Audit run '${auditRunId}' expired; an explicit rerun decision is required.`,
    ],
    CONFLICT: [
      "AUDIT_RUN_CONFLICT",
      `Audit run '${auditRunId}' is bound to a different database or request.`,
    ],
  } as const;
  const [code, message] = details[status];
  return new AgentRuntimeError(code, message, false);
}

const LOCALLY_NON_IDEMPOTENT_TOOLS = new Set(["full_audit", "analyze_slow_queries"]);

function canRetryToolCall(
  error: AgentRuntimeError,
  tool: AuthorizedTool,
): boolean {
  if (error instanceof PreDispatchToolError) return true;
  if (error instanceof AmbiguousToolDispatchError) {
    return (
      tool.idempotentHint === true &&
      !LOCALLY_NON_IDEMPOTENT_TOOLS.has(tool.name)
    );
  }
  return false;
}
