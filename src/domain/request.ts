import { z } from "zod";

export const SchemaNameSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "Schema name must not be empty.",
  })
  .refine((value) => Buffer.byteLength(value, "utf8") <= 63, {
    message: "Schema name must fit PostgreSQL's 63-byte identifier limit.",
  })
  .refine(
    (value) => value !== "information_schema" && !value.startsWith("pg_"),
    { message: "Protected PostgreSQL system schemas cannot be audited." },
  );

export const CallerContextSchema = z
  .object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    roles: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const AuditRequestSchema = z
  .object({
    prompt: z.string().min(1).max(4_000),
    idempotencyKey: z.string().min(8).max(128),
    environment: z.enum(["fixture", "approved_database"]),
    schemaName: SchemaNameSchema.optional(),
    caller: CallerContextSchema,
    executeChanges: z.literal(false).default(false),
  })
  .strict();

export type CallerContext = z.infer<typeof CallerContextSchema>;
export type AuditRequest = z.infer<typeof AuditRequestSchema>;
export type SchemaName = z.infer<typeof SchemaNameSchema>;
