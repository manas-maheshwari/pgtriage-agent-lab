import {
  ProbabilisticRunAssessmentSchema,
  RunReviewDecisionSchema,
  RunReviewStateSchema,
  type ProbabilisticRunAssessment,
  type RunReviewDecision,
  type RunReviewRoute,
  type RunReviewState,
} from "../domain/run-review.js";
import type { WorkflowRecord } from "../domain/workflow.js";
import type { RunReviewer } from "../ports/run-reviewer.js";
import type { TraceEvent } from "../ports/trace-recorder.js";

const EXPECTED_POLICY_DENIALS = new Set([
  "DESTRUCTIVE_TOOL_NOT_ALLOWED",
  "ENVIRONMENT_NOT_AUTHORIZED",
  "EXECUTION_NOT_ALLOWED",
  "SCHEMA_SCOPE_MISMATCH",
  "WRITE_TOOL_NOT_ALLOWED",
]);

const AMBIGUOUS_EXECUTION_ERRORS = new Set([
  "MCP_AMBIGUOUS_TRANSPORT_FAILURE",
  "TOOL_TIMEOUT",
]);

export interface RunReviewServiceOptions {
  reviewer: RunReviewer;
}

export class RunReviewService {
  constructor(private readonly options: RunReviewServiceOptions) {}

  async review(
    workflow: WorkflowRecord,
    traces: readonly TraceEvent[],
  ): Promise<RunReviewDecision> {
    const reviewState = buildRunReviewState(workflow, traces);
    const deterministic = deterministicDecision(reviewState);
    if (deterministic) return deterministic;

    try {
      const assessment = ProbabilisticRunAssessmentSchema.parse(
        await this.options.reviewer.review(reviewState),
      );
      return decisionFromAssessment(reviewState, assessment);
    } catch {
      return RunReviewDecisionSchema.parse({
        route: "HUMAN_REVIEW",
        source: "fallback",
        reasonCodes: ["REVIEW_PROVIDER_UNAVAILABLE"],
        reviewState,
        providerErrorCode: "REVIEW_PROVIDER_UNAVAILABLE",
      });
    }
  }
}

export function buildRunReviewState(
  workflow: WorkflowRecord,
  traces: readonly TraceEvent[],
): RunReviewState {
  if (!isReviewableState(workflow.state)) {
    throw new Error(`Workflow ${workflow.workflowId} is not in a terminal state.`);
  }

  const findings = workflow.result?.findings ?? [];
  const toolEvents = traces.filter((event) => event.kind === "tool");
  return RunReviewStateSchema.parse({
    version: "1",
    workflow: {
      workflowId: workflow.workflowId,
      terminalState: workflow.state,
      attempt: workflow.attempt,
      environment: workflow.request.environment,
      transitionPath: workflow.transitions.map(
        (transition) => `${transition.from}->${transition.to}`,
      ),
      ...(workflow.error?.code ? { errorCode: workflow.error.code } : {}),
      ...(workflow.error ? { errorRetryable: workflow.error.retryable } : {}),
    },
    execution: {
      ...(workflow.authorizedTool?.name
        ? { authorizedTool: workflow.authorizedTool.name }
        : {}),
      toolStarted: toolEvents.length > 0,
      toolCompleted: toolEvents.some((event) => event.status === "ok"),
      policyDenials: traces.filter(
        (event) => event.kind === "policy" && event.status === "denied",
      ).length,
      toolErrors: toolEvents.filter((event) => event.status === "error").length,
      retryEvents: traces.filter((event) => event.kind === "retry").length,
    },
    output: {
      evidencePresent: workflow.toolEvidence !== undefined,
      resultPresent: workflow.result !== undefined,
      findingCount: findings.length,
      citationCount: findings.reduce(
        (total, finding) => total + finding.citations.length,
        0,
      ),
      findingsRequiringHumanReview: findings.filter(
        (finding) => finding.requiresHumanReview,
      ).length,
      findingCategories: [...new Set(findings.map((finding) => finding.category))].slice(
        0,
        25,
      ),
      severities: [...new Set(findings.map((finding) => finding.severity))].slice(
        0,
        25,
      ),
    },
  });
}

function deterministicDecision(
  state: RunReviewState,
): RunReviewDecision | undefined {
  const errorCode = state.workflow.errorCode;

  if (errorCode && AMBIGUOUS_EXECUTION_ERRORS.has(errorCode)) {
    return decision(
      state,
      "PRIORITY_REVIEW",
      "deterministic",
      "AMBIGUOUS_EXECUTION_OUTCOME",
    );
  }

  if (
    state.workflow.terminalState === "COMPLETED" &&
    (!state.output.evidencePresent || !state.output.resultPresent)
  ) {
    return decision(
      state,
      "FILE_ISSUE",
      "deterministic",
      "COMPLETED_WITHOUT_REQUIRED_OUTPUT",
    );
  }

  if (state.workflow.terminalState === "CANCELLED") {
    return decision(
      state,
      "HUMAN_REVIEW",
      "deterministic",
      "CANCELLED_RUN_REQUIRES_REVIEW",
    );
  }

  if (errorCode && EXPECTED_POLICY_DENIALS.has(errorCode)) {
    const route: RunReviewRoute = state.execution.toolStarted
      ? "FILE_ISSUE"
      : "AUTO_CLOSE";
    return decision(
      state,
      route,
      "deterministic",
      state.execution.toolStarted
        ? "POLICY_DENIAL_AFTER_TOOL_START"
        : "EXPECTED_POLICY_DENIAL",
    );
  }

  if (state.workflow.terminalState === "TERMINAL_FAILURE") {
    return decision(
      state,
      "HUMAN_REVIEW",
      "deterministic",
      "UNCLASSIFIED_TERMINAL_FAILURE",
    );
  }

  return undefined;
}

function decisionFromAssessment(
  state: RunReviewState,
  assessment: ProbabilisticRunAssessment,
): RunReviewDecision {
  const reasonCodes: string[] = [];
  let route = assessment.suggestedRoute;

  if (assessment.urgencyScore >= 2.5) {
    route = "PRIORITY_REVIEW";
    reasonCodes.push("HIGH_URGENCY_SCORE");
  }

  if (
    route === "AUTO_CLOSE" &&
    (assessment.routeConfidence < 0.75 ||
      assessment.taskCompleteProbability < 0.85 ||
      assessment.evidenceSupportedProbability < 0.85 ||
      assessment.needsHumanReviewProbability >= 0.25)
  ) {
    route = "HUMAN_REVIEW";
    reasonCodes.push("AUTO_CLOSE_THRESHOLD_NOT_MET");
  }

  if (
    route !== "PRIORITY_REVIEW" &&
    route !== "FILE_ISSUE" &&
    assessment.needsHumanReviewProbability >= 0.5
  ) {
    route = "HUMAN_REVIEW";
    reasonCodes.push("HUMAN_REVIEW_PROBABILITY_HIGH");
  }

  if (
    route !== "PRIORITY_REVIEW" &&
    route !== "FILE_ISSUE" &&
    state.output.findingsRequiringHumanReview > 0
  ) {
    route = "HUMAN_REVIEW";
    reasonCodes.push("OUTPUT_EXPLICITLY_REQUIRES_HUMAN_REVIEW");
  }

  if (assessment.routeConfidence < 0.6 && route !== "PRIORITY_REVIEW") {
    route = "HUMAN_REVIEW";
    reasonCodes.push("LOW_ROUTE_CONFIDENCE");
  }

  if (reasonCodes.length === 0) {
    reasonCodes.push(`JEV_ROUTE_${route}`);
  }

  return RunReviewDecisionSchema.parse({
    route,
    source: "probabilistic",
    reasonCodes,
    reviewState: state,
    assessment,
  });
}

function decision(
  state: RunReviewState,
  route: RunReviewRoute,
  source: "deterministic" | "probabilistic" | "fallback",
  reasonCode: string,
): RunReviewDecision {
  return RunReviewDecisionSchema.parse({
    route,
    source,
    reasonCodes: [reasonCode],
    reviewState: state,
  });
}

function isReviewableState(
  state: WorkflowRecord["state"],
): state is "COMPLETED" | "TERMINAL_FAILURE" | "CANCELLED" {
  return (
    state === "COMPLETED" ||
    state === "TERMINAL_FAILURE" ||
    state === "CANCELLED"
  );
}
