import { z } from "zod";

export const SeveritySchema = z.enum([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const CitationSchema = z
  .object({
    document: z.string().min(1),
    section: z.string().min(1),
    url: z.url(),
  })
  .strict();

export const FindingSchema = z
  .object({
    severity: SeveritySchema,
    category: z.string().min(1),
    evidence: z.record(z.string(), z.unknown()),
    recommendation: z.string().min(1),
    citations: z.array(CitationSchema),
    confidence: z.number().min(0).max(1),
    requiresHumanReview: z.boolean(),
    validationPlan: z.string().min(1),
    rollbackPlan: z.string().min(1),
  })
  .strict();

export const RemediationPlanSchema = z
  .object({
    summary: z.string().min(1),
    findings: z.array(FindingSchema),
  })
  .strict();

export type Severity = z.infer<typeof SeveritySchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type RemediationPlan = z.infer<typeof RemediationPlanSchema>;
