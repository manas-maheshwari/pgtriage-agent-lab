import { z } from "zod";

import {
  ProbabilisticRunAssessmentSchema,
  RunReviewRouteSchema,
  type ProbabilisticRunAssessment,
  type RunReviewState,
} from "../../domain/run-review.js";
import type { RunReviewer } from "../../ports/run-reviewer.js";

const NoulAnswerSchema = z
  .object({ type: z.literal("noul"), noul: z.number().min(0).max(1) })
  .strict();

const ChoiceAnswerSchema = z
  .object({
    type: z.literal("choice"),
    choice: RunReviewRouteSchema,
    confidence: z.number().min(0).max(1),
    probabilities: z.record(z.string(), z.number().min(0).max(1)),
  })
  .strict();

const ScoreAnswerSchema = z
  .object({
    type: z.literal("score"),
    score: z.number().min(0).max(3),
    confidence: z.number().min(0).max(1),
    legend: z.record(z.string(), z.unknown()),
    probabilities: z.record(z.string(), z.number().min(0).max(1)),
  })
  .strict();

const JevResponseSchema = z
  .object({
    model: z.string().min(1),
    answers: z
      .object({
        task_complete: NoulAnswerSchema,
        evidence_supported: NoulAnswerSchema,
        needs_human_review: NoulAnswerSchema,
        route: ChoiceAnswerSchema,
        urgency: ScoreAnswerSchema,
      })
      .strict(),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative(),
        output_tokens: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export interface JevRunReviewerOptions {
  apiKey: string;
  model?: string;
  endpoint?: string;
  fetchImplementation?: typeof fetch;
  timeoutMs?: number;
}

export class JevRunReviewer implements RunReviewer {
  private readonly endpoint: string;
  private readonly fetchImplementation: typeof fetch;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly options: JevRunReviewerOptions) {
    if (options.apiKey.trim().length === 0) {
      throw new Error("TYPESAFE_API_KEY must not be empty.");
    }
    this.endpoint = options.endpoint ?? "https://api.typesafe.ai/v1/systemone";
    this.fetchImplementation = options.fetchImplementation ?? fetch;
    this.model = options.model ?? "jev-latest";
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async review(state: RunReviewState): Promise<ProbabilisticRunAssessment> {
    const response = await this.fetchImplementation(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildRequest(this.model, state)),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Jev request failed with HTTP ${response.status}.`);
    }

    const parsed = JevResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("Jev returned a response that did not match the expected schema.");
    }

    const { answers, usage, model } = parsed.data;
    return ProbabilisticRunAssessmentSchema.parse({
      taskCompleteProbability: answers.task_complete.noul,
      evidenceSupportedProbability: answers.evidence_supported.noul,
      needsHumanReviewProbability: answers.needs_human_review.noul,
      suggestedRoute: answers.route.choice,
      routeConfidence: answers.route.confidence,
      urgencyScore: answers.urgency.score,
      urgencyConfidence: answers.urgency.confidence,
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });
  }
}

function buildRequest(model: string, state: RunReviewState): object {
  return {
    state,
    model,
    questions: {
      task_complete: {
        type: "noul",
        instructions:
          "Did this terminal run complete its intended read-only audit and produce the expected advisory output?",
        criteria: {
          true: "The workflow completed and produced internally consistent evidence and advisory output.",
          false:
            "The workflow failed, was cancelled, or lacks evidence or advisory output needed to satisfy the task.",
        },
      },
      evidence_supported: {
        type: "noul",
        instructions:
          "Is the run's output adequately supported by the evidence and citation counts in this summary?",
        criteria: {
          true: "The run has evidence and its findings have adequate citations and review flags.",
          false: "Evidence, citations, or review flags appear incomplete or inconsistent.",
        },
      },
      needs_human_review: {
        type: "noul",
        instructions:
          "Does this run require a human operator to inspect the result or failure before closure?",
        criteria: {
          true: "There is material uncertainty, an unresolved failure, insufficient support, or an explicit review requirement.",
          false: "The run is complete, well-supported, and safe to close without operator action.",
        },
      },
      route: {
        type: "choice",
        instructions:
          "Choose the safest operational route for this completed run review. This classification cannot authorize tools or database changes.",
        criteria: {
          AUTO_CLOSE: "Complete, supported, low-risk run requiring no operator action.",
          HUMAN_REVIEW: "A person should inspect uncertainty, output quality, or an ordinary failure.",
          PRIORITY_REVIEW: "Time-sensitive or ambiguous execution outcome requiring prompt operator attention.",
          FILE_ISSUE: "A reproducible product or policy defect should be tracked for engineering follow-up.",
        },
      },
      urgency: {
        type: "score",
        instructions: "Rate how urgently an operator should inspect this run.",
        criteria: [
          "No operator action required",
          "Review during normal operations",
          "Review promptly",
          "Immediate attention required",
        ],
      },
    },
  };
}
