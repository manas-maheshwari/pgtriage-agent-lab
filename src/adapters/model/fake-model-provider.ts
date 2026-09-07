import type {
  AuditEvidence,
  AuditRequest,
  RemediationPlan,
  ToolPlan,
} from "../../domain/index.js";
import type { RetrievedChunk } from "../../domain/retrieval.js";
import type {
  ModelProvider,
  ModelResult,
  ModelUsage,
} from "../../ports/model-provider.js";
import { AgentRuntimeError } from "../../runtime/errors.js";

const ZERO_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  estimatedCostUsd: 0,
};

export interface FakeModelOptions {
  planFailureCount?: number;
  synthesisFailureCount?: number;
  requestedTool?: string;
  claimExecution?: boolean;
  plannedSchemaName?: string;
  omitSchemaScope?: boolean;
}

export class FakeModelProvider implements ModelProvider {
  planCalls = 0;
  synthesisCalls = 0;

  constructor(private readonly options: FakeModelOptions = {}) {}

  async proposePlan(request: AuditRequest): Promise<ModelResult<ToolPlan>> {
    this.planCalls += 1;
    if (this.planCalls <= (this.options.planFailureCount ?? 0)) {
      throw new AgentRuntimeError(
        "MODEL_RATE_LIMITED",
        "Injected transient planning failure.",
        true,
      );
    }

    const schemaName = this.options.omitSchemaScope
      ? undefined
      : (this.options.plannedSchemaName ?? request.schemaName);

    return {
      value: {
        tool: (this.options.requestedTool ?? "full_audit") as "full_audit",
        arguments: {
          slowQueryLimit: 10,
          ...(schemaName === undefined ? {} : { schemaName }),
        },
        reason: "Collect bounded database evidence before recommending changes.",
      },
      model: "fake-deterministic",
      usage: ZERO_USAGE,
    };
  }

  async synthesize(
    _request: AuditRequest,
    evidence: AuditEvidence,
    retrievedChunks: readonly RetrievedChunk[],
  ): Promise<ModelResult<RemediationPlan>> {
    this.synthesisCalls += 1;
    if (this.synthesisCalls <= (this.options.synthesisFailureCount ?? 0)) {
      throw new AgentRuntimeError(
        "MODEL_RATE_LIMITED",
        "Injected transient synthesis failure.",
        true,
      );
    }

    const citations = retrievedChunks.slice(0, 2).map((chunk) => ({
      document: chunk.document,
      section: chunk.section,
      url: chunk.url,
    }));
    const hasGrounding = citations.length > 0;

    return {
      value: {
        summary: `The audit produced ${evidence.summary.total_findings} finding(s).`,
        findings: evidence.findings.map((finding) => ({
          severity: finding.severity,
          category: finding.category,
          evidence: finding.evidence,
          recommendation: this.options.claimExecution
            ? "The agent executed the recommended database change."
            : hasGrounding
              ? finding.suggested_fix ?? `Investigate: ${finding.detail}`
              : `Insufficient evidence to recommend a specific change. Investigate: ${finding.detail}`,
          citations,
          confidence: hasGrounding ? 0.9 : 0.4,
          requiresHumanReview: true,
          validationPlan: hasGrounding
            ? "Validate the recommendation on a production-like fixture and compare query plans and latency."
            : "Retrieve supporting documentation and rerun analysis before proposing a concrete remediation.",
          rollbackPlan:
            "Document a database-specific rollback procedure and obtain operator approval before any change.",
        })),
      },
      model: "fake-deterministic",
      usage: ZERO_USAGE,
    };
  }
}
