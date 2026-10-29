import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import type {
  ReviewerInfluenceArm,
  ReviewerInfluenceAssignment,
  ReviewerInfluenceDataset,
  ReviewerInfluenceObservation,
} from "../../src/domain/reviewer-influence.js";
import {
  analyzeReviewerInfluence,
  prepareReviewerInfluenceStudy,
} from "../../src/experiments/reviewer-influence.js";
import {
  writeReviewerInfluenceStudyArtifacts,
} from "../../src/experiments/reviewer-influence-artifacts.js";

describe("reviewer-influence experiment", () => {
  it("balances six cases across the three exposure arms", () => {
    const study = prepareReviewerInfluenceStudy("reviewer-001");
    const counts = study.coordinatorManifest.assignments.reduce(
      (result, assignment) => {
        result[assignment.arm] += 1;
        return result;
      },
      {
        NO_MODEL: 0,
        MODEL_BEFORE_INITIAL: 0,
        MODEL_AFTER_INITIAL: 0,
      },
    );

    expect(counts.NO_MODEL).toBe(2);
    expect(counts.MODEL_BEFORE_INITIAL).toBe(2);
    expect(counts.MODEL_AFTER_INITIAL).toBe(2);
  });

  it("keeps hidden and post-initial advice out of the participant packet", () => {
    const study = prepareReviewerInfluenceStudy("reviewer-001");

    for (const studyCase of study.participantPacket.cases) {
      if (studyCase.arm === "MODEL_BEFORE_INITIAL") {
        expect(studyCase.modelAdvice).toBeDefined();
      } else {
        expect(studyCase.modelAdvice).toBeUndefined();
      }
    }
    expect(JSON.stringify(study.participantPacket)).not.toContain(
      study.coordinatorManifest.assignmentHash,
    );
  });

  it("separates participant materials from sealed coordinator artifacts", async () => {
    const outputRoot = await mkdtemp(
      resolve(tmpdir(), "agent-lab-reviewer-influence-"),
    );
    try {
      const paths = await writeReviewerInfluenceStudyArtifacts(
        "reviewer-001",
        outputRoot,
      );

      expect((await readdir(paths.participantDir)).sort()).toEqual([
        "README.md",
        "participant-packet.json",
        "response-template.json",
      ]);
      expect((await readdir(paths.coordinatorDir)).sort()).toEqual([
        "README.md",
        "coordinator-manifest.json",
      ]);

      const participantReadme = await readFile(
        resolve(paths.participantDir, "README.md"),
        "utf8",
      );
      const coordinatorManifest = await readFile(
        resolve(paths.coordinatorDir, "coordinator-manifest.json"),
        "utf8",
      );
      expect(participantReadme).not.toContain("coordinator-manifest.json");
      expect(coordinatorManifest).toContain('"assignmentHash"');
    } finally {
      await rm(outputRoot, { recursive: true, force: true });
    }
  });

  it("produces reproducible assignments for a pseudonymous participant", () => {
    const first = prepareReviewerInfluenceStudy("reviewer-001");
    const second = prepareReviewerInfluenceStudy("reviewer-001");
    const different = prepareReviewerInfluenceStudy("reviewer-002");

    expect(first.coordinatorManifest.assignmentHash).toBe(
      second.coordinatorManifest.assignmentHash,
    );
    expect(first.coordinatorManifest.assignmentHash).not.toBe(
      different.coordinatorManifest.assignmentHash,
    );
  });

  it("rejects identifying or malformed participant labels", () => {
    expect(() => prepareReviewerInfluenceStudy("A Person@example.com")).toThrow(
      /pseudonymous lowercase identifiers/i,
    );
  });

  it("does not interpret an underpowered pilot", () => {
    const report = analyzeReviewerInfluence(
      dataset(cohortObservations(1, () => ({ finalAligned: true }))),
    );

    expect(report.decision).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("detects model-aligned choice movement above the registered threshold", () => {
    const observations = cohortObservations(10, (assignment, armIndex) => ({
      initialAligned: false,
      finalAligned:
        assignment.arm === "NO_MODEL"
          ? armIndex < 10
          : armIndex < 16,
    }));

    const report = analyzeReviewerInfluence(dataset(observations));

    expect(report.metricsByArm.NO_MODEL.alignmentRate).toBe(0.5);
    expect(report.modelBeforeAlignmentDelta).toBe(0.3);
    expect(report.postInitialNetAlignmentShift).toBe(0.8);
    expect(report.switchTowardModelRateWhenDisagreed).toBe(0.8);
    expect(report.decision).toBe("MITIGATION_WARRANTED");
  });

  it("does not treat balanced switching as net model influence", () => {
    const observations = cohortObservations(10, (assignment, armIndex) => {
      if (assignment.arm !== "MODEL_AFTER_INITIAL") {
        return { finalAligned: armIndex < 10 };
      }
      const initialAligned = armIndex < 10;
      const finalAligned =
        armIndex < 5 ? false : armIndex < 15 ? true : false;
      return { initialAligned, finalAligned };
    });

    const report = analyzeReviewerInfluence(dataset(observations));

    expect(report.switchTowardModelRateWhenDisagreed).toBe(0.5);
    expect(report.switchAwayFromModelRateWhenAgreed).toBe(0.5);
    expect(report.postInitialNetAlignmentShift).toBe(0);
    expect(report.decision).toBe("NO_MEANINGFUL_INFLUENCE_DETECTED");
  });

  it("rejects observations that do not match the sealed assignment", () => {
    const observations = cohortObservations(1, () => ({ finalAligned: true }));
    const first = observations[0]!;
    observations[0] = {
      ...first,
      assignedLean:
        first.assignedLean === first.defensibleRoutes[0]
          ? first.defensibleRoutes[1]
          : first.defensibleRoutes[0],
    };

    expect(() => analyzeReviewerInfluence(dataset(observations))).toThrow(
      /does not match the sealed manifest/i,
    );
  });

  it("rejects a study run with any deterministic safety-gate failure", () => {
    const observations = cohortObservations(10, (_assignment, armIndex) => ({
      initialAligned: armIndex < 10,
      finalAligned: armIndex < 10,
    }));
    observations[0] = { ...observations[0]!, safetyInvariantPassed: false };

    const report = analyzeReviewerInfluence(dataset(observations));

    expect(report.safetyInvariantFailures).toBe(1);
    expect(report.decision).toBe("REJECT_STUDY_RUN");
  });
});

function cohortObservations(
  participantCount: number,
  choice: (
    assignment: ReviewerInfluenceAssignment,
    armIndex: number,
  ) => { initialAligned?: boolean; finalAligned: boolean },
): ReviewerInfluenceObservation[] {
  const armIndexes: Record<ReviewerInfluenceArm, number> = {
    NO_MODEL: 0,
    MODEL_BEFORE_INITIAL: 0,
    MODEL_AFTER_INITIAL: 0,
  };
  const observations: ReviewerInfluenceObservation[] = [];
  for (let participantIndex = 0; participantIndex < participantCount; participantIndex += 1) {
    const participantId = `reviewer-${String(participantIndex).padStart(3, "0")}`;
    const study = prepareReviewerInfluenceStudy(participantId);
    for (const assignment of study.coordinatorManifest.assignments) {
      const armIndex = armIndexes[assignment.arm]++;
      const selected = choice(assignment, armIndex);
      const opposite = assignment.defensibleRoutes.find(
        (route) => route !== assignment.assignedLean,
      )!;
      observations.push({
        participantId,
        caseId: assignment.caseId,
        arm: assignment.arm,
        defensibleRoutes: assignment.defensibleRoutes,
        assignedLean: assignment.assignedLean,
        ...(assignment.arm === "MODEL_AFTER_INITIAL"
          ? {
              initialRoute:
                selected.initialAligned === true
                  ? assignment.assignedLean
                  : opposite,
            }
          : {}),
        finalRoute: selected.finalAligned ? assignment.assignedLean : opposite,
        decisionTimeMs: 1_000 + armIndex,
        safetyInvariantPassed: true,
      });
    }
  }
  return observations;
}

function dataset(
  observations: ReviewerInfluenceObservation[],
): ReviewerInfluenceDataset {
  return {
    version: "1",
    studyId: "reviewer-influence-v1",
    observations,
  };
}
