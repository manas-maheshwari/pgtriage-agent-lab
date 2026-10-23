import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  ActiveHarnessConfigurationSchema,
  HarnessConfigurationSchema,
} from "../domain/index.js";
import { hashExperimentReport } from "./report-hash.js";

const rootDir = resolve(import.meta.dirname, "../..");

export const AdoptionReportSchema = z
  .object({
    reportHash: z.string().regex(/^[a-f0-9]{64}$/),
    candidate: z
      .object({
        config: HarnessConfigurationSchema,
        configHash: z.string().regex(/^[a-f0-9]{64}$/),
        safetyEligible: z.boolean(),
      })
      .passthrough(),
    decision: z
      .object({
        recommendation: z.enum(["RETAIN_BASELINE", "ADOPT"]),
      })
      .passthrough(),
  })
  .passthrough();

export interface AdoptionRequest {
  approveCandidate?: string;
  reportHash?: string;
  approvedBy?: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = AdoptionReportSchema.parse(
    JSON.parse(
      await readFile(
        resolve(rootDir, "artifacts/harness-experiment-report.json"),
        "utf8",
      ),
    ) as unknown,
  );
  validateAdoption(report, args);

  const approvedBy = args.approvedBy!;
  const candidateId = args.approveCandidate!;
  const reportHash = args.reportHash!;
  if (report.candidate.config.id !== candidateId) {
    throw new Error("The approved candidate does not match the recorded run.");
  }
  if (report.reportHash !== reportHash) {
    throw new Error("The supplied report hash does not match the recorded run.");
  }

  const adoptedAt = new Date().toISOString();
  const active = ActiveHarnessConfigurationSchema.parse({
    version: "1",
    activeConfigId: report.candidate.config.id,
    adoptedAt,
    approvedBy,
    evidence: `Approved from report ${report.reportHash}.`,
  });
  await writeFile(
    resolve(rootDir, "config/harness/active.json"),
    `${JSON.stringify(active, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(rootDir, "artifacts/harness-adoption-record.json"),
    `${JSON.stringify(
      {
        ...active,
        candidateConfigHash: report.candidate.configHash,
        reportHash: report.reportHash,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(
    `Adopted ${active.activeConfigId} with explicit approval from ${active.approvedBy}.\n`,
  );
}

export function validateAdoption(
  report: z.infer<typeof AdoptionReportSchema>,
  args: AdoptionRequest,
): void {
  if (!args.approveCandidate || !args.reportHash || !args.approvedBy) {
    throw new Error(
      "Adoption requires --approve-candidate, --report-hash, and --approved-by.",
    );
  }
  if (hashExperimentReport(report) !== report.reportHash) {
    throw new Error("The recorded experiment report hash is invalid.");
  }
  if (report.reportHash !== args.reportHash) {
    throw new Error("The supplied report hash does not match the recorded run.");
  }
  if (report.candidate.config.id !== args.approveCandidate) {
    throw new Error("The approved candidate does not match the recorded run.");
  }
  if (!report.candidate.safetyEligible) {
    throw new Error("A safety-ineligible candidate cannot be adopted.");
  }
  if (report.decision.recommendation !== "ADOPT") {
    throw new Error(
      "This experiment does not recommend adoption. Create a new evidence-backed experiment instead of overriding the gate.",
    );
  }
}

function parseArgs(values: readonly string[]): AdoptionRequest {
  const parsed: AdoptionRequest = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const next = values[index + 1];
    if (!next) continue;
    if (value === "--approve-candidate") parsed.approveCandidate = next;
    if (value === "--report-hash") parsed.reportHash = next;
    if (value === "--approved-by") parsed.approvedBy = next;
  }
  return parsed;
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  await main();
}
