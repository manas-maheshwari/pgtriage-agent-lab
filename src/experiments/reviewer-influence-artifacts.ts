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
    writeFile(
      resolve(participantDir, "pilot-feedback.md"),
      pilotFeedbackTemplate(),
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
  return `# Procedural pilot instructions

Thank you for helping test these instructions. This is a dry run of a future
study about operational review choices. We are testing whether the procedure is
clear and whether any information is accidentally revealed too early. Your
decisions from this pilot will be discarded and will not be used as research
data.

You do not need PostgreSQL, MCP, or AI-agent expertise. There are six synthetic
cases and two defensible choices for each. Please reserve about 20–30 minutes
and complete the cases in the order shown.

## Files

- \`participant-packet.json\`: the six cases, in order;
- \`response-template.json\`: where you record your choices and timing;
- \`pilot-feedback.md\`: procedural feedback to return after finishing.

## Procedure

1. Start a timer for each case when you begin reading it.
2. Read only the current case. Do not revisit earlier cases.
3. If the case already contains model advice, read it before deciding.
4. If the case does not contain advice, make the requested initial or final
   choice using only the case evidence.
5. When a case asks for an initial choice, save that choice before asking the
   coordinator for the sealed advice. Do not revise the saved initial choice.
6. After the coordinator reveals advice for that case, record your final
   choice. Keeping your original choice is completely valid.
7. Record elapsed milliseconds, or tell the coordinator your approximate
   elapsed time if editing JSON is inconvenient.
8. Stop if a file is missing, a field is unclear, advice appears before it
   should, or you cannot tell what to do next. Record the problem in
   \`pilot-feedback.md\` instead of guessing.

There are no correct answers being graded. We care about whether the procedure
works as written. Do not include your name, email, employer, or other personal
information in the files.
`;
}

function pilotFeedbackTemplate(): string {
  return `# Procedural pilot feedback

Do not include your name or other identifying information.

1. Which instruction, field, or case was confusing?

2. Did you ever see model advice before the instructions said you should?

3. Did you know when to pause and ask the coordinator for advice?

4. Were you able to record an initial choice without accidentally overwriting
   it later?

5. Approximately how long did the full process take?

6. What would you change before another person tries this?
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
