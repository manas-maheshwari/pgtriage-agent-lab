import {
  ReviewerInfluenceAssignmentSchema,
  ReviewerInfluenceCaseSchema,
  ReviewerInfluenceDatasetSchema,
  type ReviewerInfluenceArm,
  type ReviewerInfluenceAssignment,
  type ReviewerInfluenceCase,
  type ReviewerInfluenceDataset,
  type ReviewerInfluenceObservation,
} from "../domain/reviewer-influence.js";
import type { RunReviewRoute } from "../domain/run-review.js";
import { stableHash } from "../util/hash.js";

export const REVIEWER_INFLUENCE_STUDY_ID = "reviewer-influence-v1";

const ARMS: readonly ReviewerInfluenceArm[] = [
  "NO_MODEL",
  "MODEL_BEFORE_INITIAL",
  "MODEL_AFTER_INITIAL",
];

const CASES: readonly ReviewerInfluenceCase[] = [
  reviewCase({
    id: "supported-low-severity-advisory",
    title: "Supported low-severity advisory",
    summary:
      "A completed read-only audit reports one low-severity unused-index advisory. The evidence is internally consistent, citations resolve, and no execution ambiguity or explicit review flag is present.",
    routeA: "AUTO_CLOSE",
    routeB: "HUMAN_REVIEW",
    rationaleA:
      "Close automatically because every deterministic safety and evidence check passed and the advisory is low severity.",
    rationaleB:
      "Route to human review because an operator may want to validate workload seasonality before accepting an unused-index advisory.",
  }),
  reviewCase({
    id: "elevated-connection-pressure",
    title: "Elevated connection pressure",
    summary:
      "A completed audit reports sustained connection utilization near an operator-defined warning threshold. No connections are being refused, the evidence is fresh, and the advisory does not claim an outage.",
    routeA: "HUMAN_REVIEW",
    routeB: "PRIORITY_REVIEW",
    rationaleA:
      "Use normal human review because the database remains available and the evidence does not establish an active incident.",
    rationaleB:
      "Prioritize review because persistent pressure can become an availability incident before the next routine queue pass.",
  }),
  reviewCase({
    id: "repeatable-output-anomaly",
    title: "Repeatable output anomaly",
    summary:
      "A completed audit produced valid evidence, but a non-safety display field was normalized differently on two fixture runs. The advisory content and route remained unchanged.",
    routeA: "HUMAN_REVIEW",
    routeB: "FILE_ISSUE",
    rationaleA:
      "Use human review first because the variation may be benign formatting and has not affected the operational decision.",
    rationaleB:
      "File an issue because a repeatable output inconsistency should be tracked even when it does not change the current route.",
  }),
  reviewCase({
    id: "stale-statistics-context",
    title: "Stale statistics context",
    summary:
      "A completed audit reports a medium-severity performance advisory, but the statistics-reset timestamp is old enough that recent workload changes may not be represented. All citations are valid.",
    routeA: "AUTO_CLOSE",
    routeB: "HUMAN_REVIEW",
    rationaleA:
      "Close the run because the advisory already states its statistics-age limitation and does not request an action.",
    rationaleB:
      "Use human review because an operator should decide whether the stale observation window is representative before closure.",
  }),
  reviewCase({
    id: "time-sensitive-query-regression",
    title: "Time-sensitive query regression",
    summary:
      "A completed audit reports a high-latency query regression with valid evidence. The query is customer-facing, but the run contains no availability error and recommends investigation rather than a database change.",
    routeA: "HUMAN_REVIEW",
    routeB: "PRIORITY_REVIEW",
    rationaleA:
      "Use normal human review because the workflow completed safely and no outage or failed request is established.",
    rationaleB:
      "Prioritize review because a customer-facing regression has a narrower useful response window than routine findings.",
  }),
  reviewCase({
    id: "reproducible-citation-gap",
    title: "Reproducible citation gap",
    summary:
      "A completed audit contains a supported summary, but one non-decisive explanatory sentence lacks a direct citation. The gap reproduces in the fixture and does not affect the finding evidence.",
    routeA: "HUMAN_REVIEW",
    routeB: "FILE_ISSUE",
    rationaleA:
      "Use human review because the missing citation is non-decisive and a reviewer can determine whether the explanation should be retained.",
    rationaleB:
      "File an issue because a reproducible grounding gap should be tracked even when the main finding remains supported.",
  }),
];

export interface PublicStudyCase {
  caseId: string;
  order: number;
  arm: ReviewerInfluenceArm;
  title: string;
  summary: string;
  defensibleRoutes: readonly [RunReviewRoute, RunReviewRoute];
  modelAdvice?: {
    suggestedRoute: RunReviewRoute;
    rationale: string;
  };
  adviceRevealRequired: boolean;
}

export interface ReviewerInfluenceStudy {
  participantPacket: {
    version: "1";
    studyId: typeof REVIEWER_INFLUENCE_STUDY_ID;
    participantId: string;
    instructions: readonly string[];
    cases: PublicStudyCase[];
  };
  coordinatorManifest: {
    version: "1";
    studyId: typeof REVIEWER_INFLUENCE_STUDY_ID;
    participantId: string;
    assignmentHash: string;
    assignments: ReviewerInfluenceAssignment[];
  };
  responseTemplate: {
    version: "1";
    studyId: typeof REVIEWER_INFLUENCE_STUDY_ID;
    participantId: string;
    responses: Array<{
      caseId: string;
      arm: ReviewerInfluenceArm;
      initialRoute: RunReviewRoute | null;
      finalRoute: RunReviewRoute | null;
      decisionTimeMs: number | null;
      safetyInvariantPassed: boolean;
    }>;
  };
}

export interface ReviewerInfluenceReport {
  studyId: typeof REVIEWER_INFLUENCE_STUDY_ID;
  totalObservations: number;
  uniqueParticipants: number;
  metricsByArm: Record<ReviewerInfluenceArm, ArmMetrics>;
  modelBeforeAlignmentDelta: number;
  modelAfterAlignmentDelta: number;
  postInitialNetAlignmentShift: number;
  switchTowardModelRateWhenDisagreed: number;
  switchAwayFromModelRateWhenAgreed: number;
  safetyInvariantFailures: number;
  decision:
    | "INSUFFICIENT_EVIDENCE"
    | "MITIGATION_WARRANTED"
    | "NO_MEANINGFUL_INFLUENCE_DETECTED"
    | "REJECT_STUDY_RUN";
  reason: string;
  reportHash: string;
}

interface ArmMetrics {
  observations: number;
  alignedWithAssignedLean: number;
  alignmentRate: number;
  medianDecisionTimeMs: number;
}

export function prepareReviewerInfluenceStudy(
  participantId: string,
): ReviewerInfluenceStudy {
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(participantId)) {
    throw new Error(
      "Participant IDs must be pseudonymous lowercase identifiers between 3 and 64 characters.",
    );
  }

  const caseOffset = bucket(`${participantId}:case-order`, CASES.length);
  const armOffset = bucket(`${participantId}:arm-order`, ARMS.length);
  const orderedCases = rotate(CASES, caseOffset);
  const assignments = orderedCases.map((studyCase, index) => {
    const defensibleRoutes = [studyCase.routeA, studyCase.routeB] as const;
    const assignedLean =
      defensibleRoutes[bucket(`${participantId}:${studyCase.id}:lean`, 2)];
    return ReviewerInfluenceAssignmentSchema.parse({
      caseId: studyCase.id,
      order: index,
      arm: ARMS[(index + armOffset) % ARMS.length],
      assignedLean,
      modelRationale:
        assignedLean === studyCase.routeA
          ? studyCase.rationaleA
          : studyCase.rationaleB,
      defensibleRoutes,
    });
  });
  const assignmentHash = stableHash(assignments);

  return {
    participantPacket: {
      version: "1",
      studyId: REVIEWER_INFLUENCE_STUDY_ID,
      participantId,
      instructions: [
        "Choose only between the two listed routes; deterministic safety gates have already passed.",
        "For NO_MODEL cases, make one final decision without model advice.",
        "For MODEL_BEFORE_INITIAL cases, read the displayed advice before deciding.",
        "For MODEL_AFTER_INITIAL cases, record an initial route before requesting the sealed advice, then record a final route.",
      ],
      cases: assignments.map((assignment) => publicCase(assignment)),
    },
    coordinatorManifest: {
      version: "1",
      studyId: REVIEWER_INFLUENCE_STUDY_ID,
      participantId,
      assignmentHash,
      assignments,
    },
    responseTemplate: {
      version: "1",
      studyId: REVIEWER_INFLUENCE_STUDY_ID,
      participantId,
      responses: assignments.map((assignment) => ({
        caseId: assignment.caseId,
        arm: assignment.arm,
        initialRoute: null,
        finalRoute: null,
        decisionTimeMs: null,
        safetyInvariantPassed: true,
      })),
    },
  };
}

export function analyzeReviewerInfluence(
  input: ReviewerInfluenceDataset,
  options: { minimumPerArm?: number; meaningfulDelta?: number } = {},
): ReviewerInfluenceReport {
  const dataset = ReviewerInfluenceDatasetSchema.parse(input);
  assertUniqueObservations(dataset.observations);
  assertAssignmentsMatchPreparation(dataset.observations);
  const minimumPerArm = options.minimumPerArm ?? 20;
  const meaningfulDelta = options.meaningfulDelta ?? 0.1;
  const metricsByArm = Object.fromEntries(
    ARMS.map((arm) => [arm, summarizeArm(dataset.observations, arm)]),
  ) as Record<ReviewerInfluenceArm, ArmMetrics>;
  const hiddenBaseline = metricsByArm.NO_MODEL.alignmentRate;
  const modelBeforeAlignmentDelta = round(
    metricsByArm.MODEL_BEFORE_INITIAL.alignmentRate - hiddenBaseline,
  );
  const modelAfterAlignmentDelta = round(
    metricsByArm.MODEL_AFTER_INITIAL.alignmentRate - hiddenBaseline,
  );
  const afterInitial = dataset.observations.filter(
    (observation) => observation.arm === "MODEL_AFTER_INITIAL",
  );
  const disagreements = afterInitial.filter(
    (observation) => observation.initialRoute !== observation.assignedLean,
  );
  const agreements = afterInitial.filter(
    (observation) => observation.initialRoute === observation.assignedLean,
  );
  const initialAlignmentRate = rate(agreements.length, afterInitial.length);
  const finalAlignmentRate = rate(
    afterInitial.filter(
      (observation) => observation.finalRoute === observation.assignedLean,
    ).length,
    afterInitial.length,
  );
  const postInitialNetAlignmentShift = round(
    finalAlignmentRate - initialAlignmentRate,
  );
  const switchTowardModelRateWhenDisagreed = rate(
    disagreements.filter(
      (observation) => observation.finalRoute === observation.assignedLean,
    ).length,
    disagreements.length,
  );
  const switchAwayFromModelRateWhenAgreed = rate(
    agreements.filter(
      (observation) => observation.finalRoute !== observation.initialRoute,
    ).length,
    agreements.length,
  );
  const safetyInvariantFailures = dataset.observations.filter(
    (observation) => !observation.safetyInvariantPassed,
  ).length;
  const underpowered = ARMS.some(
    (arm) => metricsByArm[arm].observations < minimumPerArm,
  );

  let decision: ReviewerInfluenceReport["decision"];
  let reason: string;
  if (safetyInvariantFailures > 0) {
    decision = "REJECT_STUDY_RUN";
    reason =
      "At least one observation breached a deterministic safety invariant, so influence estimates are not eligible for product decisions.";
  } else if (underpowered) {
    decision = "INSUFFICIENT_EVIDENCE";
    reason = `Each arm requires at least ${minimumPerArm} observations before interpreting influence.`;
  } else if (
    Math.abs(modelBeforeAlignmentDelta) >= meaningfulDelta ||
    Math.abs(modelAfterAlignmentDelta) >= meaningfulDelta ||
    Math.abs(postInitialNetAlignmentShift) >= meaningfulDelta
  ) {
    decision = "MITIGATION_WARRANTED";
    reason =
      "Showing model advice changed reviewer choices beyond the registered influence threshold; test mitigations before changing the production review experience.";
  } else {
    decision = "NO_MEANINGFUL_INFLUENCE_DETECTED";
    reason =
      "The registered sample did not show a reviewer-choice shift at or above the influence threshold.";
  }

  const reportWithoutHash: Omit<ReviewerInfluenceReport, "reportHash"> = {
    studyId: REVIEWER_INFLUENCE_STUDY_ID,
    totalObservations: dataset.observations.length,
    uniqueParticipants: new Set(
      dataset.observations.map((observation) => observation.participantId),
    ).size,
    metricsByArm,
    modelBeforeAlignmentDelta,
    modelAfterAlignmentDelta,
    postInitialNetAlignmentShift,
    switchTowardModelRateWhenDisagreed,
    switchAwayFromModelRateWhenAgreed,
    safetyInvariantFailures,
    decision,
    reason,
  };
  return {
    ...reportWithoutHash,
    reportHash: stableHash(reportWithoutHash),
  };
}

export function reviewerInfluenceCases(): readonly ReviewerInfluenceCase[] {
  return CASES;
}

function publicCase(assignment: ReviewerInfluenceAssignment): PublicStudyCase {
  const studyCase = CASES.find((candidate) => candidate.id === assignment.caseId);
  if (!studyCase) throw new Error(`Unknown study case ${assignment.caseId}.`);
  return {
    caseId: assignment.caseId,
    order: assignment.order,
    arm: assignment.arm,
    title: studyCase.title,
    summary: studyCase.summary,
    defensibleRoutes: assignment.defensibleRoutes,
    ...(assignment.arm === "MODEL_BEFORE_INITIAL"
      ? {
          modelAdvice: {
            suggestedRoute: assignment.assignedLean,
            rationale: assignment.modelRationale,
          },
        }
      : {}),
    adviceRevealRequired: assignment.arm === "MODEL_AFTER_INITIAL",
  };
}

function summarizeArm(
  observations: readonly ReviewerInfluenceObservation[],
  arm: ReviewerInfluenceArm,
): ArmMetrics {
  const selected = observations.filter((observation) => observation.arm === arm);
  return {
    observations: selected.length,
    alignedWithAssignedLean: selected.filter(
      (observation) => observation.finalRoute === observation.assignedLean,
    ).length,
    alignmentRate: rate(
      selected.filter(
        (observation) => observation.finalRoute === observation.assignedLean,
      ).length,
      selected.length,
    ),
    medianDecisionTimeMs: median(
      selected.map((observation) => observation.decisionTimeMs),
    ),
  };
}

function assertUniqueObservations(
  observations: readonly ReviewerInfluenceObservation[],
): void {
  const keys = observations.map(
    (observation) => `${observation.participantId}:${observation.caseId}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error("Each participant may contribute only one observation per case.");
  }
}

function assertAssignmentsMatchPreparation(
  observations: readonly ReviewerInfluenceObservation[],
): void {
  const assignmentsByParticipant = new Map<
    string,
    Map<string, ReviewerInfluenceAssignment>
  >();
  for (const observation of observations) {
    let assignments = assignmentsByParticipant.get(observation.participantId);
    if (!assignments) {
      assignments = new Map(
        prepareReviewerInfluenceStudy(observation.participantId).coordinatorManifest.assignments.map(
          (assignment) => [assignment.caseId, assignment],
        ),
      );
      assignmentsByParticipant.set(observation.participantId, assignments);
    }
    const expected = assignments.get(observation.caseId);
    if (!expected) {
      throw new Error(
        `Case ${observation.caseId} was not assigned to ${observation.participantId}.`,
      );
    }
    if (
      observation.arm !== expected.arm ||
      observation.assignedLean !== expected.assignedLean ||
      observation.defensibleRoutes[0] !== expected.defensibleRoutes[0] ||
      observation.defensibleRoutes[1] !== expected.defensibleRoutes[1]
    ) {
      throw new Error(
        `Observation assignment does not match the sealed manifest for ${observation.participantId}:${observation.caseId}.`,
      );
    }
  }
}

function reviewCase(input: ReviewerInfluenceCase): ReviewerInfluenceCase {
  return ReviewerInfluenceCaseSchema.parse(input);
}

function rotate<T>(values: readonly T[], offset: number): T[] {
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function bucket(value: string, count: number): number {
  return Number.parseInt(stableHash(value).slice(0, 8), 16) % count;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
