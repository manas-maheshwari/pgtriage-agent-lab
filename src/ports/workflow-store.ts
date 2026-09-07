import type {
  AuditRequest,
  WorkflowError,
  WorkflowRecord,
  WorkflowState,
} from "../domain/index.js";

export interface CreateWorkflowResult {
  workflow: WorkflowRecord;
  created: boolean;
}

export type WorkflowPatch = Partial<
  Pick<
    WorkflowRecord,
    | "attempt"
    | "plan"
    | "planHash"
    | "authorizedTool"
    | "toolEvidence"
    | "toolResultHash"
    | "result"
  >
> & { error?: WorkflowError | null };

export interface WorkflowStore {
  createOrGet(request: AuditRequest): Promise<CreateWorkflowResult>;
  get(workflowId: string): Promise<WorkflowRecord | undefined>;
  transition(
    workflowId: string,
    expectedFrom: WorkflowState,
    to: WorkflowState,
    reason: string,
    patch?: WorkflowPatch,
  ): Promise<WorkflowRecord>;
  acquireLease(workflowId: string, ownerId: string, ttlMs: number): Promise<boolean>;
  releaseLease(workflowId: string, ownerId: string): Promise<void>;
  close(): Promise<void>;
}
