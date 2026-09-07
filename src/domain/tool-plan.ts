import { z } from "zod";

import { SchemaNameSchema } from "./request.js";

export const FullAuditArgumentsSchema = z
  .object({
    slowQueryLimit: z.number().int().min(1).max(50).default(10),
    schemaName: SchemaNameSchema.optional(),
  })
  .strict();

export const ToolPlanSchema = z
  .object({
    tool: z.literal("full_audit"),
    arguments: FullAuditArgumentsSchema,
    reason: z.string().min(1).max(500),
  })
  .strict();

export type FullAuditArguments = z.infer<typeof FullAuditArgumentsSchema>;
export type ToolPlan = z.infer<typeof ToolPlanSchema>;
