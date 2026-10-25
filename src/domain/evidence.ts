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
  .passthrough()
  .superRefine((value, context) => {
    if (value.summary.total_findings !== value.findings.length) {
      context.addIssue({
        code: "custom",
        path: ["summary", "total_findings"],
        message: "Summary total_findings must equal the number of findings.",
      });
    }

    const expectedCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const finding of value.findings) {
      expectedCounts[finding.severity] += 1;
    }
    for (const [severity, expected] of Object.entries(expectedCounts)) {
      const actual = value.summary[severity as keyof typeof expectedCounts];
      if (actual !== expected) {
        context.addIssue({
          code: "custom",
          path: ["summary", severity],
          message: `Summary ${severity} count must equal ${expected}.`,
        });
      }
    }
  });

export type PgTriageFinding = z.infer<typeof PgTriageFindingSchema>;
export type AuditSummary = z.infer<typeof AuditSummarySchema>;
export type AuditEvidence = z.infer<typeof AuditEvidenceSchema>;

export const AuditRunStatusSchema = z.enum([
  "NOT_FOUND",
  "STARTED",
  "COMPLETED",
  "FAILED",
  "EXPIRED",
  "CONFLICT",
]);

export const AuditRunLookupSchema = z
  .object({
    audit_run_id: z.string().uuid(),
    status: AuditRunStatusSchema,
    provenance: z.record(z.string(), z.unknown()).nullable().optional(),
    result: AuditEvidenceSchema.nullable().optional(),
    failure: z
      .object({
        code: z.string().nullable().optional(),
        reason: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export type AuditRunStatus = z.infer<typeof AuditRunStatusSchema>;
export type AuditRunLookup = z.infer<typeof AuditRunLookupSchema>;
