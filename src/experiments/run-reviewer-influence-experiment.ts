import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ReviewerInfluenceDatasetSchema } from "../domain/reviewer-influence.js";
import {
  analyzeReviewerInfluence,
  prepareReviewerInfluenceStudy,
  type ReviewerInfluenceReport,
} from "./reviewer-influence.js";

const rootDir = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const [command = "prepare", ...args] = process.argv.slice(2);
  if (command === "prepare") {
    await prepare(argument(args, "--participant") ?? "pilot-001");
    return;
  }
  if (command === "analyze") {
    const datasetPath = argument(args, "--dataset");
    if (!datasetPath) {
      throw new Error("analyze requires --dataset <path>.");
    }
    await analyze(resolve(process.cwd(), datasetPath));
    return;
  }
  throw new Error(`Unknown command ${command}. Use prepare or analyze.`);
}

async function prepare(participantId: string): Promise<void> {
  const study = prepareReviewerInfluenceStudy(participantId);
  const outputDir = resolve(rootDir, "runs/reviewer-influence", participantId);
  await mkdir(outputDir, { recursive: true });
  await Promise.all([
    writeJson(resolve(outputDir, "participant-packet.json"), study.participantPacket),
    writeJson(
      resolve(outputDir, "coordinator-manifest.json"),
      study.coordinatorManifest,
    ),
    writeJson(
      resolve(outputDir, "response-template.json"),
      study.responseTemplate,
    ),
    writeFile(resolve(outputDir, "README.md"), participantInstructions(), "utf8"),
  ]);
  process.stdout.write(
    `Prepared a blinded study packet in ${outputDir}. Keep coordinator-manifest.json hidden from the participant.\n`,
  );
}

async function analyze(datasetPath: string): Promise<void> {
  const dataset = ReviewerInfluenceDatasetSchema.parse(
    JSON.parse(await readFile(datasetPath, "utf8")) as unknown,
  );
  const report = analyzeReviewerInfluence(dataset);
  const artifactDir = resolve(rootDir, "artifacts");
  await mkdir(artifactDir, { recursive: true });
  await Promise.all([
    writeJson(resolve(artifactDir, "reviewer-influence-report.json"), report),
    writeFile(
      resolve(artifactDir, "reviewer-influence-report.md"),
      markdownReport(report),
      "utf8",
    ),
  ]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.decision === "REJECT_STUDY_RUN") process.exitCode = 1;
}

function argument(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function participantInstructions(): string {
  return `# Reviewer-influence study packet

This directory is local and gitignored. Use a pseudonymous participant ID.

1. The participant reads \`participant-packet.json\` in order.
2. For \`NO_MODEL\`, record only a final route.
3. For \`MODEL_BEFORE_INITIAL\`, show the included advice before the route choice.
4. For \`MODEL_AFTER_INITIAL\`, record the initial route first. Only then may the
   coordinator reveal the matching advice from \`coordinator-manifest.json\`.
5. Record the final route and elapsed decision time in
   \`response-template.json\`.

Never show the coordinator manifest before the required decision point. Do not
commit participant responses or identifiers.
`;
}

function markdownReport(report: ReviewerInfluenceReport): string {
  const rows = Object.entries(report.metricsByArm)
    .map(
      ([arm, metrics]) =>
        `| ${arm} | ${metrics.observations} | ${metrics.alignmentRate} | ${metrics.medianDecisionTimeMs} |`,
    )
    .join("\n");
  return `# Reviewer-influence experiment

- Study: ${report.studyId}
- Observations: ${report.totalObservations}
- Participants: ${report.uniqueParticipants}
- Report hash: \`${report.reportHash}\`

| Arm | Observations | Alignment with assigned lean | Median decision time (ms) |
| --- | ---: | ---: | ---: |
${rows}

- Model-before alignment delta: ${report.modelBeforeAlignmentDelta}
- Model-after alignment delta: ${report.modelAfterAlignmentDelta}
- Post-initial net alignment shift: ${report.postInitialNetAlignmentShift}
- Switch-toward-model rate when advice disagreed: ${report.switchTowardModelRateWhenDisagreed}
- Switch-away rate when advice agreed: ${report.switchAwayFromModelRateWhenAgreed}
- Safety invariant failures: ${report.safetyInvariantFailures}

## Decision

**${report.decision}.** ${report.reason}

This experiment measures reviewer-choice influence among two pre-registered,
defensible routes. It does not measure Jev accuracy and cannot change production
routing, authorization, evidence, retry, or remediation behavior.
`;
}

await main();
