import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildShadowAuditFixture,
  runShadowAuditExperiment,
  type ShadowAuditExperimentReport,
} from "./shadow-audit.js";

const rootDir = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const report = runShadowAuditExperiment(buildShadowAuditFixture(), {
    sampleRate: 0.05,
    seed: "shadow-audit-seed-v1",
    estimatedCostPerReviewUsd: 0.002,
    maxFalsePositiveAlertRate: 0.1,
  });
  const artifactDir = resolve(rootDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(artifactDir, "shadow-audit-experiment-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(artifactDir, "shadow-audit-experiment-report.md"),
      markdownReport(report),
      "utf8",
    ),
  ]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.decision.recommendation === "REJECT") process.exitCode = 1;
}

function markdownReport(report: ShadowAuditExperimentReport): string {
  return `# Random-negative shadow-audit experiment

- Experiment: ${report.experimentId}
- Method: ${report.method}
- Fixture hash: \`${report.fixtureHash}\`
- Seed hash: \`${report.seedHash}\`
- Report hash: \`${report.reportHash}\`

| Metric | Baseline | 5% shadow audit |
| --- | ---: | ---: |
| Runs | ${report.baseline.totalRuns} | ${report.candidate.totalRuns} |
| Seeded violations | ${report.baseline.totalViolations} | ${report.candidate.totalViolations} |
| Combined detections | ${report.baseline.combinedDetections} | ${report.candidate.combinedDetections} |
| Combined recall | ${report.baseline.combinedRecall} | ${report.candidate.combinedRecall} |
| Shadow reviews | ${report.baseline.shadowReviews} | ${report.candidate.shadowReviews} |
| Newly detected false negatives | ${report.baseline.newlyDetectedFalseNegatives} | ${report.candidate.newlyDetectedFalseNegatives} |
| False-positive alerts | ${report.baseline.falsePositiveAlerts} | ${report.candidate.falsePositiveAlerts} |
| Production route mutations | ${report.baseline.routeMutationCount} | ${report.candidate.routeMutationCount} |
| Production latency added (ms) | ${report.baseline.productionLatencyAddedMs} | ${report.candidate.productionLatencyAddedMs} |
| Estimated review cost (USD) | ${report.baseline.estimatedReviewCostUsd} | ${report.candidate.estimatedReviewCostUsd} |

## Decision

**${report.decision.recommendation}.** ${report.decision.reason}

This result supports further offline evaluation only. It does not authorize a
production sampling rate or change any run's operational route.

## Limits

${report.limits.map((limit) => `- ${limit}`).join("\n")}
`;
}

await main();
