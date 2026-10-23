import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  HarnessConfigurationSchema,
  type HarnessConfiguration,
} from "../domain/index.js";
import {
  runConformanceSuite,
  type ConformanceReport,
} from "../eval/run-conformance.js";
import { stableHash } from "../util/hash.js";
import { hashExperimentReport } from "./report-hash.js";

const rootDir = resolve(import.meta.dirname, "../..");
const EXPERIMENT_ID = "retrieval-limit-v1";
const EXPERIMENT_VERSION = "1";
const MODEL_DESCRIPTOR = {
  provider: "fake-deterministic",
  version: "fake-model-contract-v1",
};

interface VariantResult {
  config: HarnessConfiguration;
  configHash: string;
  outcomeHash: string;
  safetyEligible: boolean;
  metrics: ReturnType<typeof summarize>;
  report: ConformanceReport;
}

interface ExperimentReport {
  generatedAt: string;
  experimentId: string;
  experimentVersion: string;
  method: "controlled-propose-probe-compare";
  variedSurface: "retrieval_limit";
  scenarioHash: string;
  modelHash: string;
  sameScenarioSet: boolean;
  baseline: VariantResult;
  candidate: VariantResult;
  comparison: {
    citationDelta: number;
    completionRateDelta: number;
    refusalRateDelta: number;
    unsafeCompletionDelta: number;
    unboundedLoopDelta: number;
    latencyDeltaMs: number;
  };
  heldOutGeneralization: {
    measured: false;
    note: string;
  };
  decision: {
    recommendation: "RETAIN_BASELINE" | "ADOPT";
    activeConfigId: string;
    reason: string;
    autonomousAdoption: false;
  };
  lesson: string;
  reportHash: string;
}

async function main(): Promise<void> {
  const baselineConfig = await loadConfig("baseline-retrieval-2-v1.json");
  const candidateConfig = await loadConfig("candidate-retrieval-1-v1.json");
  assertSingleSurfaceChange(baselineConfig, candidateConfig);

  const [baselineReport, candidateReport] = await Promise.all([
    runConformanceSuite({ retrievalLimit: baselineConfig.retrievalLimit }),
    runConformanceSuite({ retrievalLimit: candidateConfig.retrievalLimit }),
  ]);
  const baseline = variant(baselineConfig, baselineReport);
  const candidate = variant(candidateConfig, candidateReport);
  const baselineScenarioIds = baselineReport.results.map((result) => result.id);
  const candidateScenarioIds = candidateReport.results.map((result) => result.id);
  const sameScenarioSet =
    JSON.stringify(baselineScenarioIds) === JSON.stringify(candidateScenarioIds) &&
    baselineReport.scenarioVersion === candidateReport.scenarioVersion;
  const scenarioHash = stableHash({
    version: baselineReport.scenarioVersion,
    ids: baselineScenarioIds,
  });
  const comparison = {
    citationDelta:
      candidate.metrics.totalCitations - baseline.metrics.totalCitations,
    completionRateDelta: round(
      candidate.metrics.completionRate - baseline.metrics.completionRate,
    ),
    refusalRateDelta: round(
      candidate.metrics.refusalRate - baseline.metrics.refusalRate,
    ),
    unsafeCompletionDelta:
      candidate.metrics.unsafeCompletionCount -
      baseline.metrics.unsafeCompletionCount,
    unboundedLoopDelta:
      candidate.metrics.unboundedLoopCount - baseline.metrics.unboundedLoopCount,
    latencyDeltaMs: round(
      candidate.metrics.averageLatencyMs - baseline.metrics.averageLatencyMs,
      3,
    ),
  };
  const candidateCanBeConsidered =
    sameScenarioSet && baseline.safetyEligible && candidate.safetyEligible;
  const improvesMeasuredQuality = comparison.citationDelta >= 0;
  const recommendation: "RETAIN_BASELINE" | "ADOPT" =
    candidateCanBeConsidered && improvesMeasuredQuality
      ? "ADOPT"
      : "RETAIN_BASELINE";
  const reason = candidateCanBeConsidered
    ? improvesMeasuredQuality
      ? "The candidate preserved safety and did not reduce measured citation coverage. Human approval is still required."
      : "The candidate preserved safety but reduced citation coverage without a measured token or cost benefit."
    : "The candidate was disqualified by scenario drift or a deterministic safety regression.";

  const reportWithoutHash = {
    generatedAt: new Date().toISOString(),
    experimentId: EXPERIMENT_ID,
    experimentVersion: EXPERIMENT_VERSION,
    method: "controlled-propose-probe-compare" as const,
    variedSurface: "retrieval_limit" as const,
    scenarioHash,
    modelHash: stableHash(MODEL_DESCRIPTOR),
    sameScenarioSet,
    baseline,
    candidate,
    comparison,
    heldOutGeneralization: {
      measured: false as const,
      note: "This first experiment reuses the conformance scenarios. It does not establish transfer to unseen tasks.",
    },
    decision: {
      recommendation,
      activeConfigId: baselineConfig.id,
      reason,
      autonomousAdoption: false as const,
    },
    lesson:
      "Reducing retrieval from two chunks to one preserved deterministic safety but removed supporting citations. Keep the baseline until a measured token or latency benefit justifies that evidence tradeoff.",
  };
  const report: ExperimentReport = {
    ...reportWithoutHash,
    reportHash: hashExperimentReport(reportWithoutHash),
  };

  await mkdir(resolve(rootDir, "artifacts"), { recursive: true });
  await writeFile(
    resolve(rootDir, "artifacts/harness-experiment-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(rootDir, "artifacts/harness-experiment-report.md"),
    markdownReport(report),
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!sameScenarioSet || !baseline.safetyEligible || !candidate.safetyEligible) {
    process.exitCode = 1;
  }
}

async function loadConfig(fileName: string): Promise<HarnessConfiguration> {
  const content = await readFile(resolve(rootDir, "config/harness", fileName), "utf8");
  return HarnessConfigurationSchema.parse(JSON.parse(content) as unknown);
}

function assertSingleSurfaceChange(
  baseline: HarnessConfiguration,
  candidate: HarnessConfiguration,
): void {
  if (baseline.surface !== candidate.surface) {
    throw new Error("Baseline and candidate must vary the same registered surface.");
  }
  if (baseline.retrievalLimit === candidate.retrievalLimit) {
    throw new Error("The candidate must change exactly one registered value.");
  }
}

function variant(
  config: HarnessConfiguration,
  report: ConformanceReport,
): VariantResult {
  return {
    config,
    configHash: stableHash(config),
    outcomeHash: stableHash(reproducibleConformanceView(report)),
    safetyEligible:
      report.passed === report.total &&
      report.unsafeCompletionCount === 0 &&
      report.unboundedLoopCount === 0,
    metrics: summarize(report),
    report,
  };
}

function summarize(report: ConformanceReport) {
  return {
    passed: report.passed,
    total: report.total,
    completionRate: report.completionRate,
    refusalRate: report.refusalRate,
    evidenceValidityRate: report.evidenceValidityRate,
    citationValidityRate: report.citationValidityRate,
    totalCitations: report.results.reduce(
      (total, result) => total + result.citations,
      0,
    ),
    unsafeCompletionCount: report.unsafeCompletionCount,
    unboundedLoopCount: report.unboundedLoopCount,
    totalDispatches: report.totalDispatches,
    totalRetries: report.totalRetries,
    averageLatencyMs: report.averageLatencyMs,
    p95LatencyMs: report.p95LatencyMs,
    totalInputTokens: report.totalInputTokens,
    totalOutputTokens: report.totalOutputTokens,
    totalEstimatedCostUsd: report.totalEstimatedCostUsd,
  };
}

function reproducibleConformanceView(report: ConformanceReport): object {
  return {
    scenarioVersion: report.scenarioVersion,
    contracts: report.contracts,
    retrievalLimit: report.retrievalLimit,
    results: report.results.map((result) => ({
      id: result.id,
      passed: result.passed,
      finalState: result.finalState,
      errorCode: result.errorCode,
      reviewRoute: result.reviewRoute,
      toolCalls: result.toolCalls,
      dispatches: result.dispatches,
      retryEvents: result.retryEvents,
      modelCalls: result.modelCalls,
      citations: result.citations,
      evidenceValid: result.evidenceValid,
      citationsValid: result.citationsValid,
      trustedCompletion: result.trustedCompletion,
      unsafeCompletion: result.unsafeCompletion,
      unboundedLoop: result.unboundedLoop,
    })),
  };
}

function markdownReport(report: ExperimentReport): string {
  return `# Controlled harness experiment: retrieval limit

Generated: ${report.generatedAt}

- Experiment: ${report.experimentId} (contract ${report.experimentVersion})
- Method: ${report.method}
- Varied surface: ${report.variedSurface}
- Scenario hash: \`${report.scenarioHash}\`
- Model hash: \`${report.modelHash}\`
- Report hash: \`${report.reportHash}\`
- Identical scenario set: ${report.sameScenarioSet}
- Held-out generalization measured: ${report.heldOutGeneralization.measured}

| Variant | Config | Retrieval limit | Safety eligible | Passed | Citations | Unsafe completions | Unbounded loops |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| Baseline | ${report.baseline.config.id} | ${report.baseline.config.retrievalLimit} | ${report.baseline.safetyEligible} | ${report.baseline.metrics.passed}/${report.baseline.metrics.total} | ${report.baseline.metrics.totalCitations} | ${report.baseline.metrics.unsafeCompletionCount} | ${report.baseline.metrics.unboundedLoopCount} |
| Candidate | ${report.candidate.config.id} | ${report.candidate.config.retrievalLimit} | ${report.candidate.safetyEligible} | ${report.candidate.metrics.passed}/${report.candidate.metrics.total} | ${report.candidate.metrics.totalCitations} | ${report.candidate.metrics.unsafeCompletionCount} | ${report.candidate.metrics.unboundedLoopCount} |

## Decision

**${report.decision.recommendation}.** ${report.decision.reason}

The active configuration remains \`${report.decision.activeConfigId}\`. This
runner cannot update it, and no candidate is adopted automatically.

## Evidence-supported lesson

${report.lesson}

## Limits

${report.heldOutGeneralization.note} Wall-clock latency is recorded for
inspection but excluded from the reproducible report hash and adoption decision.
The deterministic fixture model reports zero token use and model cost, so this
run provides no evidence of a cost reduction.
`;
}

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

await main();
