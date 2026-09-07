import { z } from "zod";

import { AuditEvidenceSchema } from "./evidence.js";
import { RemediationPlanSchema } from "./remediation.js";
import { AuditRequestSchema } from "./request.js";
import { ToolPlanSchema } from "./tool-plan.js";

export const WorkflowStateSchema = z.enum([
  "RECEIVED",
  "PLANNING",
  "PLAN_VALIDATED",
  "TOOL_AUTHORIZED",
  "TOOL_RUNNING",
  "TOOL_COMPLETE",
  "SYNTHESIZING",
  "OUTPUT_VALIDATED",
  "POLICY_CHECKED",
  "COMPLETED",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE",
  "CANCELLED",
]);

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

export const WorkflowTransitionSchema = z
  .object({
    from: WorkflowStateSchema,
    to: WorkflowStateSchema,
    at: z.iso.datetime(),
    reason: z.string().min(1),
  })
  .strict();

export const WorkflowErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  })
  .strict();

export const AuthorizedToolSchema = z
  .object({
    name: z.literal("full_audit"),
    readOnlyHint: z.literal(true),
    destructiveHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
  })
  .strict();

export const WorkflowRecordSchema = z
  .object({
    workflowId: z.uuid(),
    idempotencyKey: z.string().min(8).max(128),
    request: AuditRequestSchema,
    state: WorkflowStateSchema,
    attempt: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    transitions: z.array(WorkflowTransitionSchema),
    plan: ToolPlanSchema.optional(),
    authorizedTool: AuthorizedToolSchema.optional(),
    toolEvidence: AuditEvidenceSchema.optional(),
    result: RemediationPlanSchema.optional(),
    planHash: z.string().min(1).optional(),
    toolResultHash: z.string().min(1).optional(),
    error: WorkflowErrorSchema.optional(),
  })
  .strict();

export const ALLOWED_TRANSITIONS: Readonly<
  Record<WorkflowState, readonly WorkflowState[]>
> = {
  RECEIVED: ["PLANNING", "TERMINAL_FAILURE", "CANCELLED"],
  PLANNING: ["PLAN_VALIDATED", "RETRYABLE_FAILURE", "TERMINAL_FAILURE", "CANCELLED"],
  PLAN_VALIDATED: ["TOOL_AUTHORIZED", "TERMINAL_FAILURE", "CANCELLED"],
  TOOL_AUTHORIZED: ["TOOL_RUNNING", "TERMINAL_FAILURE", "CANCELLED"],
  TOOL_RUNNING: ["TOOL_COMPLETE", "RETRYABLE_FAILURE", "TERMINAL_FAILURE", "CANCELLED"],
  TOOL_COMPLETE: ["SYNTHESIZING", "TERMINAL_FAILURE", "CANCELLED"],
  SYNTHESIZING: ["OUTPUT_VALIDATED", "RETRYABLE_FAILURE", "TERMINAL_FAILURE", "CANCELLED"],
  OUTPUT_VALIDATED: ["POLICY_CHECKED", "TERMINAL_FAILURE", "CANCELLED"],
  POLICY_CHECKED: ["COMPLETED", "TERMINAL_FAILURE", "CANCELLED"],
  COMPLETED: [],
  RETRYABLE_FAILURE: ["PLANNING", "TOOL_RUNNING", "SYNTHESIZING", "TERMINAL_FAILURE", "CANCELLED"],
  TERMINAL_FAILURE: [],
  CANCELLED: [],
};

export function canTransition(
  from: WorkflowState,
  to: WorkflowState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type WorkflowRecord = z.infer<typeof WorkflowRecordSchema>;
export type WorkflowTransition = z.infer<typeof WorkflowTransitionSchema>;
export type WorkflowError = z.infer<typeof WorkflowErrorSchema>;
export type AuthorizedTool = z.infer<typeof AuthorizedToolSchema>;
