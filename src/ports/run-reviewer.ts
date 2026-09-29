import type {
  ProbabilisticRunAssessment,
  RunReviewState,
} from "../domain/run-review.js";

export interface RunReviewer {
  review(state: RunReviewState): Promise<ProbabilisticRunAssessment>;
}
