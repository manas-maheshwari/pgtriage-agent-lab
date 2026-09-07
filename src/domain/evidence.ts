import { z } from "zod";

import { SeveritySchema } from "./remediation.js";

export const PgTriageFindingSchema = z
  .object({
    severity: SeveritySchema,
    category: z.string().min(1),
    table: z.string().nullable().optional(),
    index: z.string().nullable().optional(),
    query: z.string().nullable().optional(),
    detail: z.string().min(1),
    estimated_impact: z.string().nullable().optional(),
    suggested_fix: z.string().nullable().optional(),
    safe_to_apply: z.boolean().default(false),
    requires_downtime: z.boolean().default(false),
    evidence: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

export const AuditSummarySchema = z
  .object({
    total_findings: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
    info: z.number().int().nonnegative(),
    tables_analyzed: z.number().int().nonnegative(),
    queries_analyzed: z.number().int().nonnegative(),
    indexes_analyzed: z.number().int().nonnegative(),
  })
  .passthrough();

export const AuditEvidenceSchema = z
  .object({
    findings: z.array(PgTriageFindingSchema),
    summary: AuditSummarySchema,
    sections: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type PgTriageFinding = z.infer<typeof PgTriageFindingSchema>;
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type AuditEvidence = z.infer<typeof AuditEvidenceSchema>;
