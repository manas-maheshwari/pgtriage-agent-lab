import { z } from "zod";

export const RunReviewRouteSchema = z.enum([
  "AUTO_CLOSE",
  "HUMAN_REVIEW",
  "PRIORITY_REVIEW",
  "FILE_ISSUE",
]);

export const ReviewableWorkflowStateSchema = z.enum([
  "COMPLETED",
  "TERMINAL_FAILURE",
  "CANCELLED",
]);

export const RunReviewStateSchema = z
  .object({
    version: z.literal("1"),
    workflow: z
      .object({
        workflowId: z.uuid(),
        terminalState: ReviewableWorkflowStateSchema,
        attempt: z.number().int().nonnegative(),
        environment: z.enum(["fixture", "approved_database"]),
        transitionPath: z.array(z.string().min(1)).max(32),
        errorCode: z.string().min(1).optional(),
        errorRetryable: z.boolean().optional(),
      })
      .strict(),
    execution: z
      .object({
        authorizedTool: z.string().min(1).optional(),
        toolStarted: z.boolean(),
        toolCompleted: z.boolean(),
        policyDenials: z.number().int().nonnegative(),
        toolErrors: z.number().int().nonnegative(),
        retryEvents: z.number().int().nonnegative(),
      })
      .strict(),
    output: z
      .object({
        evidencePresent: z.boolean(),
        resultPresent: z.boolean(),
        findingCount: z.number().int().nonnegative(),
        citationCount: z.number().int().nonnegative(),
        findingsRequiringHumanReview: z.number().int().nonnegative(),
        findingCategories: z.array(z.string().min(1)).max(25),
        severities: z.array(z.string().min(1)).max(25),
      })
      .strict(),
  })
  .strict();

const ProbabilitySchema = z.number().min(0).max(1);

export const ProbabilisticRunAssessmentSchema = z
  .object({
    taskCompleteProbability: ProbabilitySchema,
    evidenceSupportedProbability: ProbabilitySchema,
    needsHumanReviewProbability: ProbabilitySchema,
    suggestedRoute: RunReviewRouteSchema,
    routeConfidence: ProbabilitySchema,
    urgencyScore: z.number().min(0).max(3),
    urgencyConfidence: ProbabilitySchema,
    model: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  })
  .strict();

export const RunReviewDecisionSchema = z
  .object({
    route: RunReviewRouteSchema,
    source: z.enum(["deterministic", "probabilistic", "fallback"]),
    reasonCodes: z.array(z.string().min(1)).min(1),
    reviewState: RunReviewStateSchema,
    assessment: ProbabilisticRunAssessmentSchema.optional(),
    providerErrorCode: z.string().min(1).optional(),
  })
  .strict();

export type RunReviewRoute = z.infer<typeof RunReviewRouteSchema>;
export type RunReviewState = z.infer<typeof RunReviewStateSchema>;
export type ProbabilisticRunAssessment = z.infer<
  typeof ProbabilisticRunAssessmentSchema
>;
export type RunReviewDecision = z.infer<typeof RunReviewDecisionSchema>;
