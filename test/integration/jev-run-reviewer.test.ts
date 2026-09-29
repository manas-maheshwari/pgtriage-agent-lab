import { describe, expect, it } from "vitest";

import { JevRunReviewer } from "../../src/adapters/review/jev-run-reviewer.js";
import { RunReviewStateSchema } from "../../src/domain/run-review.js";

describe("JevRunReviewer", () => {
  it("sends the documented System One request and maps typed answers", async () => {
    let capturedBody: unknown;
    let capturedAuthorization: string | null = null;
    const fetchImplementation: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body));
      capturedAuthorization = new Headers(init?.headers).get("authorization");
      return new Response(JSON.stringify(validResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const reviewer = new JevRunReviewer({
      apiKey: "test-secret-key",
      fetchImplementation,
    });

    const result = await reviewer.review(reviewState());

    expect(capturedAuthorization).toBe("Bearer test-secret-key");
    expect(capturedBody).toMatchObject({
      model: "jev-latest",
      state: { version: "1" },
      questions: {
        task_complete: { type: "noul" },
        evidence_supported: { type: "noul" },
        needs_human_review: { type: "noul" },
        route: { type: "choice" },
        urgency: { type: "score" },
      },
    });
    expect(JSON.stringify(capturedBody)).not.toContain("test-secret-key");
    expect(result).toMatchObject({
      suggestedRoute: "AUTO_CLOSE",
      routeConfidence: 0.92,
      model: "jev-2026-09-15",
      inputTokens: 145,
    });
  });

  it("rejects malformed provider output", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response(JSON.stringify({ model: "jev-latest", answers: {} }), {
        status: 200,
      });
    const reviewer = new JevRunReviewer({
      apiKey: "test-secret-key",
      fetchImplementation,
    });

    await expect(reviewer.review(reviewState())).rejects.toThrow(
      "did not match the expected schema",
    );
  });

  it("does not expose provider response bodies in HTTP errors", async () => {
    const fetchImplementation: typeof fetch = async () =>
      new Response("sensitive provider detail", { status: 401 });
    const reviewer = new JevRunReviewer({
      apiKey: "test-secret-key",
      fetchImplementation,
    });

    await expect(reviewer.review(reviewState())).rejects.toThrow(
      "Jev request failed with HTTP 401.",
    );
  });
});

function reviewState() {
  return RunReviewStateSchema.parse({
    version: "1",
    workflow: {
      workflowId: "7aa6f0b7-b618-4d4f-a1b1-0249d5a61a20",
      terminalState: "COMPLETED",
      attempt: 0,
      environment: "fixture",
      transitionPath: ["POLICY_CHECKED->COMPLETED"],
    },
    execution: {
      authorizedTool: "full_audit",
      toolStarted: true,
      toolCompleted: true,
      policyDenials: 0,
      toolErrors: 0,
      retryEvents: 0,
    },
    output: {
      evidencePresent: true,
      resultPresent: true,
      findingCount: 1,
      citationCount: 1,
      findingsRequiringHumanReview: 0,
      findingCategories: ["missing_index"],
      severities: ["medium"],
    },
  });
}

function validResponse(): object {
  return {
    model: "jev-2026-09-15",
    answers: {
      task_complete: { type: "noul", noul: 0.98 },
      evidence_supported: { type: "noul", noul: 0.93 },
      needs_human_review: { type: "noul", noul: 0.07 },
      route: {
        type: "choice",
        choice: "AUTO_CLOSE",
        confidence: 0.92,
        probabilities: {
          AUTO_CLOSE: 0.92,
          HUMAN_REVIEW: 0.05,
          PRIORITY_REVIEW: 0.02,
          FILE_ISSUE: 0.01,
        },
      },
      urgency: {
        type: "score",
        score: 0.15,
        confidence: 0.9,
        legend: {
          "0": "No operator action required",
          "1": "Review during normal operations",
          "2": "Review promptly",
          "3": "Immediate attention required",
        },
        probabilities: { "0": 0.9, "1": 0.08, "2": 0.01, "3": 0.01 },
      },
    },
    usage: { input_tokens: 145, output_tokens: 28 },
  };
}
