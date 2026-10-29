import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { prepareReviewerInfluenceStudy } from "./reviewer-influence.js";

export interface ReviewerInfluenceArtifactPaths {
  rootDir: string;
  participantDir: string;
  coordinatorDir: string;
}

export async function writeReviewerInfluenceStudyArtifacts(
  participantId: string,
  outputRoot: string,
): Promise<ReviewerInfluenceArtifactPaths> {
  const study = prepareReviewerInfluenceStudy(participantId);
  const rootDir = resolve(outputRoot, participantId);
  const participantDir = resolve(rootDir, "participant");
  const coordinatorDir = resolve(rootDir, "coordinator");
  await Promise.all([
    mkdir(participantDir, { recursive: true }),
    mkdir(coordinatorDir, { recursive: true }),
  ]);
  await Promise.all([
    writeJson(
      resolve(participantDir, "participant-packet.json"),
      study.participantPacket,
    ),
    writeJson(
      resolve(participantDir, "response-template.json"),
      study.responseTemplate,
    ),
    writeFile(
      resolve(participantDir, "README.md"),
      participantInstructions(),
      "utf8",
    ),
    writeJson(
      resolve(coordinatorDir, "coordinator-manifest.json"),
      study.coordinatorManifest,
    ),
    writeFile(
      resolve(coordinatorDir, "README.md"),
      coordinatorInstructions(),
      "utf8",
    ),
  ]);
  return { rootDir, participantDir, coordinatorDir };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function participantInstructions(): string {
  return `# Reviewer-influence study packet

This directory is local and gitignored. Use a pseudonymous participant ID.

1. Read \`participant-packet.json\` in order.
2. For \`NO_MODEL\`, record only a final route.
3. For \`MODEL_BEFORE_INITIAL\`, read the included advice before choosing.
4. For \`MODEL_AFTER_INITIAL\`, record the initial route before asking the
   coordinator to reveal the sealed advice.
5. Record the final route and elapsed decision time in
   \`response-template.json\`.

Do not commit participant responses or identifiers.
`;
}

function coordinatorInstructions(): string {
  return `# Reviewer-influence coordinator materials

Do not share this directory with the participant.

For a \`MODEL_AFTER_INITIAL\` case, confirm that the participant recorded an
initial route before revealing the matching advice from
\`coordinator-manifest.json\`. Never reveal the manifest itself.

Do not commit manifests, responses, or participant identifiers.
`;
}
