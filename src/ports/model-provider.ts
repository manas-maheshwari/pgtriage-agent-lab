import type {
  AuditEvidence,
  AuditRequest,
  RemediationPlan,
  ToolPlan,
} from "../domain/index.js";
import type { RetrievedChunk } from "../domain/retrieval.js";

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
}

export interface ModelResult<T> {
  value: T;
  model: string;
  requestId?: string;
  usage: ModelUsage;
}

export interface ModelProvider {
  proposePlan(request: AuditRequest): Promise<ModelResult<ToolPlan>>;
  synthesize(
    request: AuditRequest,
    evidence: AuditEvidence,
    retrievedChunks: readonly RetrievedChunk[],
  ): Promise<ModelResult<RemediationPlan>>;
}
