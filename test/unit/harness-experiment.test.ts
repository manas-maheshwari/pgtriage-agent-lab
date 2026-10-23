import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { loadActiveHarnessConfiguration } from "../../src/config/harness.js";
import {
  AdoptionReportSchema,
  validateAdoption,
} from "../../src/experiments/adopt-harness-candidate.js";
import { hashExperimentReport } from "../../src/experiments/report-hash.js";

const candidate = {
  version: "1" as const,
  id: "candidate-retrieval-1-v1",
  surface: "retrieval_limit" as const,
  retrievalLimit: 1,
  description: "Retrieve one chunk per finding.",
};

describe("harness experiment controls", () => {
  it("loads the explicitly active configuration", async () => {
    const config = await loadActiveHarnessConfiguration(
      resolve(process.cwd(), "config/harness"),
    );

    expect(config.id).toBe("baseline-retrieval-2-v1");
    expect(config.retrievalLimit).toBe(2);
  });

  it("blocks adoption when the recorded decision retains the baseline", () => {
    const payload = {
      candidate: {
        config: candidate,
        configHash: "a".repeat(64),
        safetyEligible: true,
      },
      decision: { recommendation: "RETAIN_BASELINE" },
    };
    const report = AdoptionReportSchema.parse({
      ...payload,
      reportHash: hashExperimentReport(payload),
    });

    expect(() =>
      validateAdoption(report, {
        approveCandidate: candidate.id,
        reportHash: report.reportHash,
        approvedBy: "Manas Maheshwari",
      }),
    ).toThrow(/does not recommend adoption/i);
  });

  it("accepts an exact, safety-eligible, human-approved candidate", () => {
    const payload = {
      candidate: {
        config: candidate,
        configHash: "a".repeat(64),
        safetyEligible: true,
      },
      decision: { recommendation: "ADOPT" },
    };
    const report = AdoptionReportSchema.parse({
      ...payload,
      reportHash: hashExperimentReport(payload),
    });

    expect(() =>
      validateAdoption(report, {
        approveCandidate: candidate.id,
        reportHash: report.reportHash,
        approvedBy: "Manas Maheshwari",
      }),
    ).not.toThrow();
  });

  it("rejects a report whose recorded hash no longer matches its contents", () => {
    const report = AdoptionReportSchema.parse({
      reportHash: "b".repeat(64),
      candidate: {
        config: candidate,
        configHash: "a".repeat(64),
        safetyEligible: true,
      },
      decision: { recommendation: "ADOPT" },
    });

    expect(() =>
      validateAdoption(report, {
        approveCandidate: candidate.id,
        reportHash: report.reportHash,
        approvedBy: "Manas Maheshwari",
      }),
    ).toThrow(/report hash is invalid/i);
  });
});
