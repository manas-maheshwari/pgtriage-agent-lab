import type { AuditEvidence, ToolPlan } from "../domain/index.js";

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface ToolCallContext {
  workflowId: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ToolClient {
  listTools(): Promise<readonly ToolDescriptor[]>;
  callTool(plan: ToolPlan, context: ToolCallContext): Promise<AuditEvidence>;
  close(): Promise<void>;
}
