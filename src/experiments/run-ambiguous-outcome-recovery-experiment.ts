import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  runAmbiguousOutcomeRecoveryExperiment,
  type RecoveryExperimentReport,
} from "./ambiguous-outcome-recovery.js";

const rootDir = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const report = runAmbiguousOutcomeRecoveryExperiment();
  const artifactDir = resolve(rootDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(artifactDir, "ambiguous-outcome-recovery-report.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    ),
    writeFile(
      resolve(artifactDir, "ambiguous-outcome-recovery-report.md"),
      markdownReport(report),
      "utf8",
    ),
  ]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.decision.recommendation === "REJECT_EXPERIMENT") {
    process.exitCode = 1;
  }
}

function markdownReport(report: RecoveryExperimentReport): string {
  const rows = Object.entries(report.metricsByVariant)
    .map(
      ([variant, metrics]) =>
        `| ${variant} | ${metrics.completedOrRecovered}/${metrics.scenarios} | ${metrics.recoveredCompletions} | ${metrics.duplicateDispatches} | ${metrics.duplicateDatabaseWork} | ${metrics.completedWorkNotRecovered} | ${metrics.operatorInterventions} | ${metrics.duplicateStateAdvances} | ${metrics.leaseContentionsPrevented} | ${metrics.stateConflictsPrevented} | ${metrics.falseSuccesses} |`,
    )
    .join("\n");
  return `# Ambiguous-outcome recovery pilot

- Experiment: ${report.experimentId}
- Method: ${report.method}
- Protocol hash: \`${report.protocolHash}\`
- Report hash: \`${report.reportHash}\`

| Variant | Completed/recovered | Recovered ambiguous completions | Duplicate dispatches | Duplicate database work | Completed work not recovered | Operator interventions | Duplicate state advances | Lease contentions prevented | State conflicts prevented | False success |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows}

## Decision

**${report.decision.recommendation}.** ${report.decision.reason}

## Permitted claim

${report.permittedClaim}

## Limits

${report.limits.map((limit) => `- ${limit}`).join("\n")}
`;
}

await main();
