import { describe, expect, it } from "vitest";

import {
  buildShadowAuditFixture,
  runShadowAuditExperiment,
  selectedForShadowAudit,
} from "../../src/experiments/shadow-audit.js";

describe("random-negative shadow-audit experiment", () => {
  it("selects an approximately five-percent deterministic sample", () => {
    const selected = Array.from({ length: 10_000 }, (_, index) =>
      selectedForShadowAudit(`run-${index}`, 0.05, "stable-seed"),
    ).filter(Boolean).length;

    expect(selected).toBeGreaterThanOrEqual(400);
    expect(selected).toBeLessThanOrEqual(600);
    expect(selectedForShadowAudit("run-42", 0.05, "stable-seed")).toBe(
      selectedForShadowAudit("run-42", 0.05, "stable-seed"),
    );
  });

  it("detects seeded misses without changing production routes", () => {
    const report = runShadowAuditExperiment(buildShadowAuditFixture());

    expect(report.candidate.shadowReviews).toBeGreaterThan(0);
    expect(report.candidate.newlyDetectedFalseNegatives).toBeGreaterThan(0);
    expect(report.comparison.recallDelta).toBeGreaterThan(0);
    expect(report.candidate.routeMutationCount).toBe(0);
    expect(report.candidate.productionLatencyAddedMs).toBe(0);
    expect(report.decision.recommendation).toBe("CONTINUE_EXPERIMENT");
    expect(report.decision.changesProductionRouting).toBe(false);
  });

  it("never shadow-samples a run already flagged by the primary screen", () => {
    const fixture = buildShadowAuditFixture();
    const report = runShadowAuditExperiment(fixture, { sampleRate: 1 });
    const primaryFlagged = fixture.filter((candidate) => candidate.primaryFlagged);

    expect(report.candidate.shadowReviews).toBe(
      fixture.length - primaryFlagged.length,
    );
  });

  it("rejects a candidate that finds no seeded primary-screen miss", () => {
    const fixture = buildShadowAuditFixture().map((candidate) => ({
      ...candidate,
      shadowReviewerFlagged: false,
    }));
    const report = runShadowAuditExperiment(fixture);

    expect(report.decision.recommendation).toBe("REJECT");
  });

  it("rejects duplicate run identifiers", () => {
    const candidate = buildShadowAuditFixture(1)[0]!;

    expect(() => runShadowAuditExperiment([candidate, candidate])).toThrow(
      /unique/i,
    );
  });
});
