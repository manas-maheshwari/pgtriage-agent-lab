import { z } from "zod";

import { RunReviewRouteSchema } from "./run-review.js";

export const ReviewerInfluenceArmSchema = z.enum([
  "NO_MODEL",
  "MODEL_BEFORE_INITIAL",
  "MODEL_AFTER_INITIAL",
]);

export const ReviewerInfluenceCaseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    title: z.string().min(1),
    summary: z.string().min(1),
    routeA: RunReviewRouteSchema,
    routeB: RunReviewRouteSchema,
    rationaleA: z.string().min(1),
    rationaleB: z.string().min(1),
  })
  .strict()
  .refine((value) => value.routeA !== value.routeB, {
    message: "Reviewer-influence cases require two distinct defensible routes.",
  });

export const ReviewerInfluenceAssignmentSchema = z
  .object({
    caseId: z.string().min(1),
    order: z.number().int().nonnegative(),
    arm: ReviewerInfluenceArmSchema,
    assignedLean: RunReviewRouteSchema,
    modelRationale: z.string().min(1),
    defensibleRoutes: z.tuple([RunReviewRouteSchema, RunReviewRouteSchema]),
  })
  .strict();

export const ReviewerInfluenceObservationSchema = z
  .object({
    participantId: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
    caseId: z.string().min(1),
    arm: ReviewerInfluenceArmSchema,
    defensibleRoutes: z.tuple([RunReviewRouteSchema, RunReviewRouteSchema]),
    assignedLean: RunReviewRouteSchema,
    initialRoute: RunReviewRouteSchema.optional(),
    finalRoute: RunReviewRouteSchema,
    decisionTimeMs: z.number().int().positive(),
    safetyInvariantPassed: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.defensibleRoutes[0] === value.defensibleRoutes[1]) {
      context.addIssue({
        code: "custom",
        message: "Observations require two distinct defensible routes.",
        path: ["defensibleRoutes"],
      });
    }
    for (const [name, route] of [
      ["assignedLean", value.assignedLean],
      ["finalRoute", value.finalRoute],
      ...(value.initialRoute
        ? ([["initialRoute", value.initialRoute]] as const)
        : []),
    ] as const) {
      if (!value.defensibleRoutes.includes(route)) {
        context.addIssue({
          code: "custom",
          message: `${name} must be one of the registered defensible routes.`,
          path: [name],
        });
      }
    }
    if (value.arm === "MODEL_AFTER_INITIAL" && !value.initialRoute) {
      context.addIssue({
        code: "custom",
        message: "MODEL_AFTER_INITIAL observations require an initial route.",
        path: ["initialRoute"],
      });
    }
    if (value.arm !== "MODEL_AFTER_INITIAL" && value.initialRoute) {
      context.addIssue({
        code: "custom",
        message: "Only MODEL_AFTER_INITIAL observations record an initial route.",
        path: ["initialRoute"],
      });
    }
  });

export const ReviewerInfluenceDatasetSchema = z
  .object({
    version: z.literal("1"),
    studyId: z.literal("reviewer-influence-v1"),
    observations: z.array(ReviewerInfluenceObservationSchema).min(1),
  })
  .strict();

export type ReviewerInfluenceArm = z.infer<
  typeof ReviewerInfluenceArmSchema
>;
export type ReviewerInfluenceCase = z.infer<
  typeof ReviewerInfluenceCaseSchema
>;
export type ReviewerInfluenceAssignment = z.infer<
  typeof ReviewerInfluenceAssignmentSchema
>;
export type ReviewerInfluenceObservation = z.infer<
  typeof ReviewerInfluenceObservationSchema
>;
export type ReviewerInfluenceDataset = z.infer<
  typeof ReviewerInfluenceDatasetSchema
>;
