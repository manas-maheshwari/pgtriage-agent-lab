import {
  AuditEvidenceSchema,
  type AuditEvidence,
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
}

export class FixtureToolClient implements ToolClient {
  listCount = 0;
  callCount = 0;
  dispatchCount = 0;
  lastWireArguments?: Record<string, unknown>;

  constructor(private readonly options: FixtureToolOptions = {}) {}

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
            schema_name: { type: "string" },
          },
        },
        ...(readOnlyHint === undefined ? {} : { readOnlyHint }),
        destructiveHint: this.options.destructiveHint ?? false,
        idempotentHint: this.options.idempotentHint ?? false,
      },
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
      ...(plan.arguments.schemaName === undefined
        ? {}
        : { schema_name: plan.arguments.schemaName }),
    };

    if (this.dispatchCount <= (this.options.ambiguousFailureCount ?? 0)) {
      throw new AmbiguousToolDispatchError(
        "MCP_AMBIGUOUS_TRANSPORT_FAILURE",
        "Injected transport failure after the tool may have been dispatched.",
      );
    }

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

    return structuredClone(this.options.evidence ?? FIXTURE_EVIDENCE);
  }

  async close(): Promise<void> {}
}

export { FIXTURE_EVIDENCE };
