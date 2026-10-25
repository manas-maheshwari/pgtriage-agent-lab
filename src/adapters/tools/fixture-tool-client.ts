import {
  AuditEvidenceSchema,
  type AuditEvidence,
  type AuditRunLookup,
  type ToolPlan,
} from "../../domain/index.js";
import type {
  ToolCallContext,
  ToolClient,
  ToolDescriptor,
} from "../../ports/tool-client.js";
import { AgentRuntimeError } from "../../runtime/errors.js";
import {
  AmbiguousToolDispatchError,
  PreDispatchToolError,
} from "../../runtime/errors.js";

const FIXTURE_EVIDENCE: AuditEvidence = AuditEvidenceSchema.parse({
  findings: [
    {
      severity: "high",
      category: "missing_index",
      table: "orders",
      detail:
        "Table 'orders' has 2,000,000 rows and a high sequential-scan ratio.",
      suggested_fix:
        "Review frequent predicates and consider CREATE INDEX CONCURRENTLY after validation.",
      safe_to_apply: false,
      requires_downtime: false,
      evidence: {
        live_rows: 2_000_000,
        seq_scans: 18_250,
        idx_scans: 41,
      },
    },
  ],
  summary: {
    total_findings: 1,
    critical: 0,
    high: 1,
    medium: 0,
    low: 0,
    info: 0,
    tables_analyzed: 12,
    queries_analyzed: 10,
    indexes_analyzed: 23,
  },
});

export interface FixtureToolOptions {
  capabilityFailureCount?: number;
  preDispatchFailureCount?: number;
  ambiguousFailureCount?: number;
  delayMs?: number;
  readOnlyHint?: boolean;
  omitReadOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  evidence?: AuditEvidence;
  rawEvidence?: unknown;
  contractMismatch?: boolean;
  omitAuditRunIdContract?: boolean;
  omitReconciliationTool?: boolean;
  ambiguousOutcome?:
    | "not_found"
    | "started"
    | "completed"
    | "failed"
    | "expired"
    | "conflict";
}

export class FixtureToolClient implements ToolClient {
  listCount = 0;
  callCount = 0;
  dispatchCount = 0;
  reconciliationCount = 0;
  lastWireArguments?: Record<string, unknown>;
  private readonly auditRuns = new Map<string, AuditRunLookup>();

  constructor(private readonly options: FixtureToolOptions = {}) {}

  seedAuditRun(
    auditRunId: string,
    status: AuditRunLookup["status"],
    result?: AuditEvidence,
  ): void {
    this.auditRuns.set(auditRunId, lookup(auditRunId, status, result));
  }

  async listTools(): Promise<readonly ToolDescriptor[]> {
    this.listCount += 1;
    if (this.listCount <= (this.options.capabilityFailureCount ?? 0)) {
      throw new PreDispatchToolError(
        "MCP_CAPABILITY_DISCOVERY_FAILED",
        "Injected transient capability-discovery failure.",
      );
    }

    const readOnlyHint = this.options.omitReadOnlyHint
      ? undefined
      : (this.options.readOnlyHint ?? true);
    return [
      {
        name: "full_audit",
        description: "Run a comprehensive, read-only PostgreSQL performance audit.",
        inputSchema: {
          type: "object",
          properties: {
            slow_query_limit: { type: "integer", minimum: 1, maximum: 50 },
            ...(this.options.contractMismatch
              ? {}
              : { schema_name: { type: "string" } }),
            ...(this.options.omitAuditRunIdContract
              ? {}
              : { audit_run_id: { type: "string", format: "uuid" } }),
          },
        },
        ...(readOnlyHint === undefined ? {} : { readOnlyHint }),
        destructiveHint: this.options.destructiveHint ?? false,
        idempotentHint: this.options.idempotentHint ?? false,
      },
      ...(this.options.omitReconciliationTool
        ? []
        : [
            {
              name: "get_audit_run",
              description: "Retrieve a durable audit operation without repeating it.",
              inputSchema: {
                type: "object",
                properties: { audit_run_id: { type: "string", format: "uuid" } },
              },
              readOnlyHint: true,
              destructiveHint: false,
              idempotentHint: true,
            },
          ]),
    ];
  }

  async callTool(
    plan: ToolPlan,
    context: ToolCallContext,
  ): Promise<AuditEvidence> {
    this.callCount += 1;
    if (this.callCount <= (this.options.preDispatchFailureCount ?? 0)) {
      throw new PreDispatchToolError(
        "MCP_PRE_DISPATCH_UNAVAILABLE",
        "Injected transient MCP failure before dispatch.",
      );
    }
    if (plan.tool !== "full_audit") {
      throw new AgentRuntimeError(
        "TOOL_NOT_FOUND",
        `Fixture tool '${plan.tool}' does not exist.`,
        false,
      );
    }

    this.dispatchCount += 1;
    this.lastWireArguments = {
      slow_query_limit: plan.arguments.slowQueryLimit,
      audit_run_id: context.workflowId,
      ...(plan.arguments.schemaName === undefined
        ? {}
        : { schema_name: plan.arguments.schemaName }),
    };

    const evidence = Object.hasOwn(this.options, "rawEvidence")
      ? this.options.rawEvidence
      : (this.options.evidence ?? FIXTURE_EVIDENCE);

    if (this.dispatchCount <= (this.options.ambiguousFailureCount ?? 0)) {
      const outcome = this.options.ambiguousOutcome ?? "started";
      if (outcome === "started") {
        this.auditRuns.set(context.workflowId, lookup(context.workflowId, "STARTED"));
      } else if (outcome === "completed") {
        this.auditRuns.set(
          context.workflowId,
          lookup(context.workflowId, "COMPLETED", evidence as AuditEvidence),
        );
      } else if (outcome === "failed") {
        this.auditRuns.set(context.workflowId, {
          ...lookup(context.workflowId, "FAILED"),
          failure: {
            code: "FIXTURE_FAILURE",
            reason: "The fixture recorded a bounded audit failure.",
          },
        });
      } else if (outcome === "expired") {
        this.auditRuns.set(context.workflowId, lookup(context.workflowId, "EXPIRED"));
      } else if (outcome === "conflict") {
        this.auditRuns.set(context.workflowId, lookup(context.workflowId, "CONFLICT"));
      }
      throw new AmbiguousToolDispatchError(
        "MCP_AMBIGUOUS_TRANSPORT_FAILURE",
        "Injected transport failure after the tool may have been dispatched.",
      );
    }

    this.auditRuns.set(context.workflowId, lookup(context.workflowId, "STARTED"));

    const delayMs = this.options.delayMs ?? 0;
    if (delayMs > context.timeoutMs) {
      throw new AmbiguousToolDispatchError(
        "TOOL_TIMEOUT",
        "The fixture tool timed out after it may have been dispatched.",
      );
    }
    if (delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, delayMs);
        context.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(
              new AgentRuntimeError("TOOL_CANCELLED", "Tool call cancelled.", false),
            );
          },
          { once: true },
        );
      });
    }

    this.auditRuns.set(
      context.workflowId,
      lookup(context.workflowId, "COMPLETED", evidence as AuditEvidence),
    );
    return structuredClone(evidence as AuditEvidence);
  }

  async getAuditRun(auditRunId: string): Promise<AuditRunLookup> {
    this.reconciliationCount += 1;
    return structuredClone(
      this.auditRuns.get(auditRunId) ?? lookup(auditRunId, "NOT_FOUND"),
    );
  }

  async close(): Promise<void> {}
}

export { FIXTURE_EVIDENCE };

function lookup(
  auditRunId: string,
  status: AuditRunLookup["status"],
  result?: AuditEvidence,
): AuditRunLookup {
  return {
    audit_run_id: auditRunId,
    status,
    provenance: null,
    result: result ?? null,
    failure: null,
  };
}
