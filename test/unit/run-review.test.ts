import { describe, expect, it } from "vitest";

import { FakeRunReviewer } from "../../src/adapters/review/fake-run-reviewer.js";
import type { ProbabilisticRunAssessment } from "../../src/domain/run-review.js";
import {
  WorkflowRecordSchema,
  type WorkflowRecord,
} from "../../src/domain/workflow.js";
import type { TraceEvent } from "../../src/ports/trace-recorder.js";
import { RunReviewService } from "../../src/runtime/run-review.js";

describe("RunReviewService", () => {
  it("uses Jev-style assessment for a valid completed run", async () => {
    const reviewer = new FakeRunReviewer();
    const service = new RunReviewService({ reviewer });

    const decision = await service.review(completedWorkflow(), [toolTrace("ok")]);

    expect(decision.route).toBe("AUTO_CLOSE");
    expect(decision.source).toBe("probabilistic");
    expect(reviewer.callCount).toBe(1);
    expect(reviewer.states[0]).not.toHaveProperty("caller");
    expect(JSON.stringify(reviewer.states[0])).not.toContain("user-1");
    expect(JSON.stringify(reviewer.states[0])).not.toContain("tenant-1");
  });

  it("short-circuits ambiguous execution failures without calling the reviewer", async () => {
    const reviewer = new FakeRunReviewer();
    const service = new RunReviewService({ reviewer });

    const decision = await service.review(
      failedWorkflow("MCP_AMBIGUOUS_TRANSPORT_FAILURE"),
      [toolTrace("error")],
    );

    expect(decision).toMatchObject({
      route: "PRIORITY_REVIEW",
      source: "deterministic",
      reasonCodes: ["AMBIGUOUS_EXECUTION_OUTCOME"],
    });
    expect(reviewer.callCount).toBe(0);
  });

  it("auto-closes an expected policy denial only when no tool started", async () => {
    const reviewer = new FakeRunReviewer();
    const service = new RunReviewService({ reviewer });

    const decision = await service.review(
      failedWorkflow("EXECUTION_NOT_ALLOWED"),
      [],
    );

    expect(decision.route).toBe("AUTO_CLOSE");
    expect(decision.reasonCodes).toEqual(["EXPECTED_POLICY_DENIAL"]);
    expect(reviewer.callCount).toBe(0);
  });

  it("files an issue when a policy denial occurs after a tool starts", async () => {
    const reviewer = new FakeRunReviewer();
    const service = new RunReviewService({ reviewer });

    const decision = await service.review(
      failedWorkflow("WRITE_TOOL_NOT_ALLOWED"),
      [toolTrace("denied")],
    );

    expect(decision.route).toBe("FILE_ISSUE");
    expect(decision.reasonCodes).toEqual(["POLICY_DENIAL_AFTER_TOOL_START"]);
  });

  it("prevents a low-confidence assessment from auto-closing", async () => {
    const reviewer = new FakeRunReviewer({
      assessment: assessment({ routeConfidence: 0.55 }),
    });
    const service = new RunReviewService({ reviewer });

    const decision = await service.review(completedWorkflow(), [toolTrace("ok")]);

    expect(decision.route).toBe("HUMAN_REVIEW");
    expect(decision.reasonCodes).toContain("AUTO_CLOSE_THRESHOLD_NOT_MET");
    expect(decision.reasonCodes).toContain("LOW_ROUTE_CONFIDENCE");
  });

  it("does not let a probabilistic assessment override an explicit review flag", async () => {
    const reviewer = new FakeRunReviewer();
    const service = new RunReviewService({ reviewer });
    const workflow = WorkflowRecordSchema.parse({
      ...completedWorkflow(),
      result: {
        summary: "One advisory finding requires operator review.",
        findings: [
          {
            severity: "high",
            category: "missing_index",
            evidence: { queryId: "query-1" },
            recommendation: "Validate a candidate composite index.",
            citations: [],
            confidence: 0.9,
            requiresHumanReview: true,
            validationPlan: "Compare plans in a production-like fixture.",
            rollbackPlan: "Remove the candidate index if it regresses traffic.",
          },
        ],
      },
    });

    const decision = await service.review(workflow, [toolTrace("ok")]);

    expect(decision.route).toBe("HUMAN_REVIEW");
    expect(decision.reasonCodes).toContain(
      "OUTPUT_EXPLICITLY_REQUIRES_HUMAN_REVIEW",
    );
  });

  it("falls back to human review when the provider fails", async () => {
    const reviewer = new FakeRunReviewer({ error: new Error("provider down") });
    const service = new RunReviewService({ reviewer });

    const decision = await service.review(completedWorkflow(), [toolTrace("ok")]);

    expect(decision).toMatchObject({
      route: "HUMAN_REVIEW",
      source: "fallback",
      providerErrorCode: "REVIEW_PROVIDER_UNAVAILABLE",
    });
  });

  it("rejects non-terminal workflows", async () => {
    const reviewer = new FakeRunReviewer();
    const service = new RunReviewService({ reviewer });
    const workflow = WorkflowRecordSchema.parse({
      ...baseWorkflow(),
      state: "TOOL_RUNNING",
    });

    await expect(service.review(workflow, [])).rejects.toThrow(
      "is not in a terminal state",
    );
  });
});

function assessment(
  overrides: Partial<ProbabilisticRunAssessment> = {},
): ProbabilisticRunAssessment {
  return {
    taskCompleteProbability: 0.97,
    evidenceSupportedProbability: 0.94,
    needsHumanReviewProbability: 0.08,
    suggestedRoute: "AUTO_CLOSE",
    routeConfidence: 0.91,
    urgencyScore: 0.2,
    urgencyConfidence: 0.9,
    model: "fake-jev",
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function completedWorkflow(): WorkflowRecord {
  return WorkflowRecordSchema.parse({
    ...baseWorkflow(),
    state: "COMPLETED",
    transitions: [
      transition("RECEIVED", "PLANNING"),
      transition("PLANNING", "PLAN_VALIDATED"),
      transition("PLAN_VALIDATED", "TOOL_AUTHORIZED"),
      transition("TOOL_AUTHORIZED", "TOOL_RUNNING"),
      transition("TOOL_RUNNING", "TOOL_COMPLETE"),
      transition("TOOL_COMPLETE", "SYNTHESIZING"),
      transition("SYNTHESIZING", "OUTPUT_VALIDATED"),
      transition("OUTPUT_VALIDATED", "POLICY_CHECKED"),
      transition("POLICY_CHECKED", "COMPLETED"),
    ],
    authorizedTool: { name: "full_audit", readOnlyHint: true },
    toolEvidence: {
      findings: [],
      summary: {
        total_findings: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
        tables_analyzed: 10,
        queries_analyzed: 5,
        indexes_analyzed: 4,
      },
    },
    result: {
      summary: "No material performance risks were found in the fixture audit.",
      findings: [],
    },
  });
}

function failedWorkflow(errorCode: string): WorkflowRecord {
  return WorkflowRecordSchema.parse({
    ...baseWorkflow(),
    state: "TERMINAL_FAILURE",
    error: {
      code: errorCode,
      message: "Synthetic failure for run-review testing.",
      retryable: false,
    },
  });
}

function baseWorkflow(): object {
  return {
    workflowId: "7aa6f0b7-b618-4d4f-a1b1-0249d5a61a20",
    idempotencyKey: "review-test-12345678",
    request: {
      prompt: "Audit this synthetic PostgreSQL fixture.",
      idempotencyKey: "review-test-12345678",
      environment: "fixture",
      caller: {
        tenantId: "tenant-1",
        userId: "user-1",
        roles: ["database_auditor"],
      },
    },
    attempt: 0,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:01.000Z",
    transitions: [],
  };
}

function transition(from: string, to: string): object {
  return {
    from,
    to,
    at: "2026-09-28T12:00:00.000Z",
    reason: "Synthetic test transition.",
  };
}

function toolTrace(status: TraceEvent["status"]): TraceEvent {
  return {
    workflowId: "7aa6f0b7-b618-4d4f-a1b1-0249d5a61a20",
    spanId: "tool-span-1",
    kind: "tool",
    name: "full_audit",
    startedAt: "2026-09-28T12:00:00.000Z",
    endedAt: "2026-09-28T12:00:01.000Z",
    durationMs: 1_000,
    status,
    attributes: {},
  };
}
