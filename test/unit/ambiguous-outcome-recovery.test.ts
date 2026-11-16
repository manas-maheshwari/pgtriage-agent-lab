import { describe, expect, it } from "vitest";

import { runAmbiguousOutcomeRecoveryExperiment } from "../../src/experiments/ambiguous-outcome-recovery.js";

describe("ambiguous-outcome recovery experiment", () => {
  it("runs every frozen variant against every frozen fault", () => {
    const report = runAmbiguousOutcomeRecoveryExperiment();

    expect(report.variants).toHaveLength(4);
    expect(report.faults).toHaveLength(9);
    expect(report.results).toHaveLength(36);
    expect(new Set(report.results.map((result) => result.fault)).size).toBe(9);
  });

  it("shows the duplicate-work risk of blind ambiguous retries", () => {
    const report = runAmbiguousOutcomeRecoveryExperiment();
    const blind = report.metricsByVariant["blind-retry"];

    expect(blind.duplicateDatabaseWork).toBeGreaterThan(0);
    expect(blind.recoveredCompletions).toBe(0);
  });

  it("shows the availability cost of failing closed without reconciliation", () => {
    const report = runAmbiguousOutcomeRecoveryExperiment();
    const failClosed = report.metricsByVariant["fail-closed"];

    expect(failClosed.completedWorkNotRecovered).toBeGreaterThan(0);
    expect(failClosed.operatorInterventions).toBeGreaterThan(0);
  });

  it("uses guards to prevent duplicate workflow advancement", () => {
    const report = runAmbiguousOutcomeRecoveryExperiment();
    const reconciled = report.metricsByVariant.reconciliation;
    const guarded = report.metricsByVariant["reconciliation-with-guards"];

    expect(reconciled.duplicateStateAdvances).toBeGreaterThan(0);
    expect(guarded.duplicateStateAdvances).toBe(0);
    expect(guarded.leaseContentionsPrevented).toBeGreaterThan(0);
    expect(guarded.stateConflictsPrevented).toBeGreaterThan(0);
  });

  it("never converts malformed terminal evidence into success", () => {
    const report = runAmbiguousOutcomeRecoveryExperiment();
    const malformed = report.results.filter(
      (result) => result.fault === "malformed-terminal-evidence",
    );

    expect(malformed).toHaveLength(4);
    expect(malformed.every((result) => result.falseSuccess === false)).toBe(true);
    expect(
      malformed.every((result) => result.terminalOutcome === "FAILED_CLOSED"),
    ).toBe(true);
  });

  it("produces a stable report for the frozen protocol", () => {
    const first = runAmbiguousOutcomeRecoveryExperiment();
    const second = runAmbiguousOutcomeRecoveryExperiment();

    expect(first.protocolHash).toBe(second.protocolHash);
    expect(first.reportHash).toBe(second.reportHash);
    expect(first.decision.recommendation).toBe(
      "ADVANCE_RECONCILIATION_WITH_GUARDS",
    );
  });
});
