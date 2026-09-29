import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { FakeRunReviewer } from "../adapters/review/fake-run-reviewer.js";
import type {
  ProbabilisticRunAssessment,
  RunReviewRoute,
} from "../domain/run-review.js";
import {
  WorkflowRecordSchema,
  type WorkflowRecord,
} from "../domain/workflow.js";
import type { TraceEvent } from "../ports/trace-recorder.js";
import { RunReviewService } from "../runtime/run-review.js";

interface EvalCase {
  id: string;
  workflow: WorkflowRecord;
  traces: TraceEvent[];
  expectedRoute: RunReviewRoute;
  assessment?: ProbabilisticRunAssessment;
  providerFailure?: boolean;
  expectedProviderCalls: number;
}

interface EvalResult {
  id: string;
  expectedRoute: RunReviewRoute;
  actualRoute: RunReviewRoute;
  source: string;
  providerCalls: number;
  passed: boolean;
}

const rootDir = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const results: EvalResult[] = [];
  for (const testCase of cases()) {
    const reviewer = new FakeRunReviewer({
      ...(testCase.assessment ? { assessment: testCase.assessment } : {}),
      ...(testCase.providerFailure
        ? { error: new Error("synthetic provider failure") }
        : {}),
    });
    const decision = await new RunReviewService({ reviewer }).review(
      testCase.workflow,
      testCase.traces,
    );
    results.push({
      id: testCase.id,
      expectedRoute: testCase.expectedRoute,
      actualRoute: decision.route,
      source: decision.source,
      providerCalls: reviewer.callCount,
      passed:
        decision.route === testCase.expectedRoute &&
        reviewer.callCount === testCase.expectedProviderCalls,
    });
  }

  const passed = results.filter((result) => result.passed).length;
  const unsafeCases = results.filter((result) =>
    ["ambiguous-execution", "completed-without-output"].includes(result.id),
  );
  const unsafeFalseNegatives = unsafeCases.filter((result) =>
    ["AUTO_CLOSE"].includes(result.actualRoute),
  ).length;
  const report = {
    generatedAt: new Date().toISOString(),
    passed,
    total: results.length,
    routeAccuracy: Number((passed / results.length).toFixed(4)),
    unsafeFalseNegativeRate: Number(
      (unsafeFalseNegatives / unsafeCases.length).toFixed(4),
    ),
    results,
  };

  await mkdir(resolve(rootDir, "artifacts"), { recursive: true });
  await writeFile(
    resolve(rootDir, "artifacts/run-review-eval-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(rootDir, "artifacts/run-review-eval-report.md"),
    markdownReport(report),
    "utf8",
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (passed !== results.length) process.exitCode = 1;
}

function cases(): readonly EvalCase[] {
  return [
    {
      id: "supported-completion",
      workflow: completedWorkflow(true),
      traces: [toolTrace("ok")],
      expectedRoute: "AUTO_CLOSE",
      expectedProviderCalls: 1,
    },
    {
      id: "low-confidence-completion",
      workflow: completedWorkflow(true),
      traces: [toolTrace("ok")],
      assessment: assessment({ routeConfidence: 0.5 }),
      expectedRoute: "HUMAN_REVIEW",
      expectedProviderCalls: 1,
    },
    {
      id: "high-urgency-completion",
      workflow: completedWorkflow(true),
      traces: [toolTrace("ok")],
      assessment: assessment({ urgencyScore: 2.8 }),
      expectedRoute: "PRIORITY_REVIEW",
      expectedProviderCalls: 1,
    },
    {
      id: "provider-failure",
      workflow: completedWorkflow(true),
      traces: [toolTrace("ok")],
      providerFailure: true,
      expectedRoute: "HUMAN_REVIEW",
      expectedProviderCalls: 1,
    },
    {
      id: "ambiguous-execution",
      workflow: failedWorkflow("MCP_AMBIGUOUS_TRANSPORT_FAILURE"),
      traces: [toolTrace("error")],
      expectedRoute: "PRIORITY_REVIEW",
      expectedProviderCalls: 0,
    },
    {
      id: "expected-policy-denial",
      workflow: failedWorkflow("EXECUTION_NOT_ALLOWED"),
      traces: [],
      expectedRoute: "AUTO_CLOSE",
      expectedProviderCalls: 0,
    },
    {
      id: "completed-without-output",
      workflow: completedWorkflow(false),
      traces: [toolTrace("ok")],
      expectedRoute: "FILE_ISSUE",
      expectedProviderCalls: 0,
    },
  ];
}

function assessment(
  overrides: Partial<ProbabilisticRunAssessment> = {},
): ProbabilisticRunAssessment {
  return {
    taskCompleteProbability: 0.97,
    evidenceSupportedProbability: 0.94,
    needsHumanReviewProbability: 0.08,
    suggestedRoute: "AUTO_CLOSE",
    routeConfidence: 0.91,
    urgencyScore: 0.2,
    urgencyConfidence: 0.9,
    model: "fake-jev",
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function completedWorkflow(withOutput: boolean): WorkflowRecord {
  return WorkflowRecordSchema.parse({
    ...baseWorkflow(),
    state: "COMPLETED",
    ...(withOutput
      ? {
          toolEvidence: {
            findings: [],
            summary: {
              total_findings: 0,
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
              info: 0,
              tables_analyzed: 1,
              queries_analyzed: 1,
              indexes_analyzed: 1,
            },
          },
          result: { summary: "Synthetic audit completed.", findings: [] },
        }
      : {}),
  });
}

function failedWorkflow(errorCode: string): WorkflowRecord {
  return WorkflowRecordSchema.parse({
    ...baseWorkflow(),
    state: "TERMINAL_FAILURE",
    error: {
      code: errorCode,
      message: "Synthetic evaluation failure.",
      retryable: false,
    },
  });
}

function baseWorkflow(): object {
  return {
    workflowId: "7aa6f0b7-b618-4d4f-a1b1-0249d5a61a20",
    idempotencyKey: "review-eval-12345678",
    request: {
      prompt: "Audit a synthetic PostgreSQL fixture.",
      idempotencyKey: "review-eval-12345678",
      environment: "fixture",
      caller: {
        tenantId: "eval-tenant",
        userId: "eval-user",
        roles: ["database_auditor"],
      },
    },
    attempt: 0,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:01.000Z",
    transitions: [],
  };
}

function toolTrace(status: TraceEvent["status"]): TraceEvent {
  return {
    workflowId: "7aa6f0b7-b618-4d4f-a1b1-0249d5a61a20",
    spanId: "tool-span-1",
    kind: "tool",
    name: "full_audit",
    startedAt: "2026-09-28T12:00:00.000Z",
    endedAt: "2026-09-28T12:00:01.000Z",
    durationMs: 1_000,
    status,
    attributes: {},
  };
}

function markdownReport(report: {
  generatedAt: string;
  passed: number;
  total: number;
  routeAccuracy: number;
  unsafeFalseNegativeRate: number;
  results: EvalResult[];
}): string {
  const rows = report.results
    .map(
      (result) =>
        `| ${result.id} | ${result.expectedRoute} | ${result.actualRoute} | ${result.source} | ${result.providerCalls} | ${result.passed ? "PASS" : "FAIL"} |`,
    )
    .join("\n");
  return `# Run-review deterministic evaluation\n\nGenerated: ${report.generatedAt}\n\n- Passed: ${report.passed}/${report.total}\n- Route accuracy: ${report.routeAccuracy}\n- Unsafe false-negative rate: ${report.unsafeFalseNegativeRate}\n\nThis fixture suite tests routing contracts and failure behavior. It does not measure Jev model quality.\n\n| Case | Expected | Actual | Source | Provider calls | Result |\n| --- | --- | --- | --- | ---: | --- |\n${rows}\n`;
}

await main();
