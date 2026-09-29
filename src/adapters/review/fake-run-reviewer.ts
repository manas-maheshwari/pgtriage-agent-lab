import type {
  ProbabilisticRunAssessment,
  RunReviewState,
} from "../../domain/run-review.js";
import type { RunReviewer } from "../../ports/run-reviewer.js";

const DEFAULT_ASSESSMENT: ProbabilisticRunAssessment = {
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
};

export interface FakeRunReviewerOptions {
  assessment?: ProbabilisticRunAssessment;
  error?: Error;
}

export class FakeRunReviewer implements RunReviewer {
  callCount = 0;
  readonly states: RunReviewState[] = [];

  constructor(private readonly options: FakeRunReviewerOptions = {}) {}

  async review(state: RunReviewState): Promise<ProbabilisticRunAssessment> {
    this.callCount += 1;
    this.states.push(structuredClone(state));
    if (this.options.error) throw this.options.error;
    return structuredClone(this.options.assessment ?? DEFAULT_ASSESSMENT);
  }
}
