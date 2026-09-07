import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { FakeModelProvider, type FakeModelOptions } from "../adapters/model/fake-model-provider.js";
import { MemoryWorkflowStore } from "../adapters/persistence/memory-workflow-store.js";
import { MarkdownCorpusRetriever } from "../adapters/retrieval/markdown-corpus-retriever.js";
import { FixtureToolClient, type FixtureToolOptions } from "../adapters/tools/fixture-tool-client.js";
import type { AuditRequest, WorkflowRecord } from "../domain/index.js";
import { MemoryTraceRecorder } from "../observability/memory-trace-recorder.js";
import { AgentOrchestrator } from "../runtime/orchestrator.js";

interface EvalCase {
  id: string;
  name: string;
  request: AuditRequest;
  model?: FakeModelOptions;
  tool?: FixtureToolOptions;
  expect: {
    state: WorkflowRecord["state"];
    errorCode?: string;
    maxToolCalls?: number;
    maxDispatches?: number;
    minCitations?: number;
  };
}

interface EvalResult {
  id: string;
  name: string;
  passed: boolean;
  state: string;
  expectedState: string;
  errorCode?: string;
  expectedErrorCode?: string;
  toolCalls: number;
  dispatches: number;
  citations: number;
  notes: string[];
}

const rootDir = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const results: EvalResult[] = [];
  for (const testCase of buildCases()) {
    results.push(await runCase(testCase));
  }

  const passed = results.filter((result) => result.passed).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    passed,
    total: results.length,
    successRate: Number((passed / results.length).toFixed(4)),
    results,
  };

  await mkdir(resolve(rootDir, "artifacts"), { recursive: true });
  await writeFile(
    resolve(rootDir, "artifacts/eval-report.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  await writeFile(resolve(rootDir, "artifacts/eval-report.md"), markdownReport(summary), "utf8");

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (passed !== results.length) process.exitCode = 1;
}

async function runCase(testCase: EvalCase): Promise<EvalResult> {
  const model = new FakeModelProvider(testCase.model);
  const tools = new FixtureToolClient(testCase.tool);
  const store = new MemoryWorkflowStore();
  const traces = new MemoryTraceRecorder();
  const orchestrator = new AgentOrchestrator({
    model,
    tools,
    store,
    traces,
    retriever: new MarkdownCorpusRetriever(resolve(rootDir, "corpus")),
    budget: {
      maxModelCalls: 3,
      maxToolCalls: 2,
      maxRetriesPerOperation: 1,
      maxElapsedMs: 30_000,
      toolTimeoutMs: 10,
    },
  });

  const workflow = await orchestrator.run(testCase.request);
  const citations =
    workflow.result?.findings.reduce(
      (count, finding) => count + finding.citations.length,
      0,
    ) ?? 0;
  const notes: string[] = [];
  if (workflow.state !== testCase.expect.state) {
    notes.push(`state expected ${testCase.expect.state} but got ${workflow.state}`);
  }
  if (testCase.expect.errorCode && workflow.error?.code !== testCase.expect.errorCode) {
    notes.push(`error expected ${testCase.expect.errorCode} but got ${workflow.error?.code ?? "none"}`);
  }
  if (testCase.expect.maxToolCalls !== undefined && tools.callCount > testCase.expect.maxToolCalls) {
    notes.push(`tool calls expected <= ${testCase.expect.maxToolCalls} but got ${tools.callCount}`);
  }
  if (
    testCase.expect.maxDispatches !== undefined &&
    tools.dispatchCount > testCase.expect.maxDispatches
  ) {
    notes.push(
      `dispatches expected <= ${testCase.expect.maxDispatches} but got ${tools.dispatchCount}`,
    );
  }
  if (testCase.expect.minCitations !== undefined && citations < testCase.expect.minCitations) {
    notes.push(`citations expected >= ${testCase.expect.minCitations} but got ${citations}`);
  }

  await store.close();
  return {
    id: testCase.id,
    name: testCase.name,
    passed: notes.length === 0,
    state: workflow.state,
    expectedState: testCase.expect.state,
    ...(workflow.error?.code ? { errorCode: workflow.error.code } : {}),
    ...(testCase.expect.errorCode ? { expectedErrorCode: testCase.expect.errorCode } : {}),
    toolCalls: tools.callCount,
    dispatches: tools.dispatchCount,
    citations,
    notes,
  };
}

function buildCases(): readonly EvalCase[] {
  const happyPrompts = [
    "Audit slow queries and missing indexes.",
    "Find sequential scan risk on large Postgres tables.",
    "Review dead tuple bloat and recommend next steps.",
    "Check connection pressure symptoms.",
    "Audit database health and cite operational runbooks.",
    "Summarize pgtriage evidence into advisory findings.",
    "Find indexing and query-plan concerns.",
    "Review PostgreSQL performance risks without applying changes.",
    "Investigate slow queries for a tenant database.",
    "Create a read-only remediation proposal for database operators.",
    "Audit a fixture database and explain what to validate.",
    "Check tables, queries, and indexes for operational risk.",
  ];

  const happyCases = happyPrompts.map((prompt, index): EvalCase => ({
    id: `happy-${index + 1}`,
    name: prompt,
    request: request(`eval-happy-${index + 1}`, prompt, "fixture", ["engineer"]),
    expect: {
      state: "COMPLETED",
      maxToolCalls: 1,
      minCitations: 1,
    },
  }));

  return [
    ...happyCases,
    {
      id: "deny-execution-prompt",
      name: "Reject direct execution request",
      request: request("eval-deny-execution", "Audit and apply the database fix.", "fixture", ["engineer"]),
      expect: { state: "TERMINAL_FAILURE", errorCode: "EXECUTION_NOT_ALLOWED", maxToolCalls: 0 },
    },
    {
      id: "deny-approved-db-role",
      name: "Reject approved database without auditor role",
      request: request("eval-deny-role", "Audit approved database.", "approved_database", ["engineer"]),
      expect: { state: "TERMINAL_FAILURE", errorCode: "ENVIRONMENT_NOT_AUTHORIZED", maxToolCalls: 0 },
    },
    {
      id: "allow-approved-db-role",
      name: "Allow approved database with auditor role",
      request: request(
        "eval-allow-approved-role",
        "Audit approved database with read-only recommendations.",
        "approved_database",
        ["approved_database_auditor"],
      ),
      expect: { state: "COMPLETED", maxToolCalls: 1, minCitations: 1 },
    },
    {
      id: "deny-write-tool",
      name: "Reject non-read-only MCP tool",
      request: request("eval-write-tool", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { readOnlyHint: false },
      expect: { state: "TERMINAL_FAILURE", errorCode: "WRITE_TOOL_NOT_ALLOWED", maxToolCalls: 0 },
    },
    {
      id: "deny-missing-read-only-hint",
      name: "Fail closed when readOnlyHint is absent",
      request: request("eval-missing-readonly", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { omitReadOnlyHint: true },
      expect: { state: "TERMINAL_FAILURE", errorCode: "WRITE_TOOL_NOT_ALLOWED", maxToolCalls: 0 },
    },
    {
      id: "deny-destructive-tool",
      name: "Reject a tool marked destructive",
      request: request("eval-destructive", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { destructiveHint: true },
      expect: { state: "TERMINAL_FAILURE", errorCode: "DESTRUCTIVE_TOOL_NOT_ALLOWED", maxToolCalls: 0 },
    },
    {
      id: "recover-model-retry",
      name: "Recover from one transient planning failure",
      request: request("eval-model-retry", "Audit fixture database.", "fixture", ["engineer"]),
      model: { planFailureCount: 1 },
      expect: { state: "COMPLETED", maxToolCalls: 1, minCitations: 1 },
    },
    {
      id: "recover-pre-dispatch-tool-retry",
      name: "Recover from one pre-dispatch MCP failure",
      request: request("eval-pre-dispatch-retry", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { preDispatchFailureCount: 1 },
      expect: { state: "COMPLETED", maxToolCalls: 2, maxDispatches: 1, minCitations: 1 },
    },
    {
      id: "recover-capability-discovery",
      name: "Recover from one pre-dispatch capability-discovery failure",
      request: request("eval-capability-retry", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { capabilityFailureCount: 1 },
      expect: { state: "COMPLETED", maxToolCalls: 1, maxDispatches: 1, minCitations: 1 },
    },
    {
      id: "terminal-ambiguous-dispatch",
      name: "Do not retry non-idempotent full_audit after ambiguous dispatch",
      request: request("eval-ambiguous-dispatch", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { ambiguousFailureCount: 1 },
      expect: {
        state: "TERMINAL_FAILURE",
        errorCode: "MCP_AMBIGUOUS_TRANSPORT_FAILURE",
        maxToolCalls: 1,
        maxDispatches: 1,
      },
    },
    {
      id: "deny-schema-scope-change",
      name: "Reject a model that replaces caller-authorized schema scope",
      request: request(
        "eval-schema-scope-change",
        "Audit the authorized schema.",
        "fixture",
        ["engineer"],
        "pgtriage_demo",
      ),
      model: { plannedSchemaName: "public" },
      expect: {
        state: "TERMINAL_FAILURE",
        errorCode: "SCHEMA_SCOPE_MISMATCH",
        maxToolCalls: 0,
        maxDispatches: 0,
      },
    },
    {
      id: "allow-schema-scoped-audit",
      name: "Carry caller-authorized schema scope through a successful audit",
      request: request(
        "eval-schema-scoped",
        "Audit the authorized schema.",
        "fixture",
        ["engineer"],
        "pgtriage_demo",
      ),
      expect: { state: "COMPLETED", maxToolCalls: 1, maxDispatches: 1, minCitations: 1 },
    },
    {
      id: "reject-execution-claim",
      name: "Reject generated answer that claims execution",
      request: request("eval-execution-claim", "Audit fixture database.", "fixture", ["engineer"]),
      model: { claimExecution: true },
      expect: { state: "TERMINAL_FAILURE", errorCode: "OUTPUT_CLAIMS_EXECUTION", maxToolCalls: 1 },
    },
    {
      id: "terminal-tool-timeout",
      name: "Do not retry non-idempotent full_audit after ambiguous timeout",
      request: request("eval-tool-timeout", "Audit fixture database.", "fixture", ["engineer"]),
      tool: { delayMs: 20 },
      expect: {
        state: "TERMINAL_FAILURE",
        errorCode: "TOOL_TIMEOUT",
        maxToolCalls: 1,
        maxDispatches: 1,
      },
    },
  ];
}

function request(
  idempotencyKey: string,
  prompt: string,
  environment: AuditRequest["environment"],
  roles: string[],
  schemaName?: string,
): AuditRequest {
  return {
    prompt,
    idempotencyKey,
    environment,
    ...(schemaName === undefined ? {} : { schemaName }),
    caller: { tenantId: "eval-tenant", userId: "eval-user", roles },
    executeChanges: false,
  };
}

function markdownReport(summary: {
  generatedAt: string;
  passed: number;
  total: number;
  successRate: number;
  results: EvalResult[];
}): string {
  const rows = summary.results
    .map((result) => {
      const cells = [
        result.id,
        result.passed ? "pass" : "fail",
        result.state,
        result.errorCode ?? "",
        String(result.toolCalls),
        String(result.dispatches),
        String(result.citations),
        result.notes.join("; "),
      ];
      return `| ${cells.join(" | ")} |`;
    })
    .join("\n");
  return `# Eval Report

Generated: ${summary.generatedAt}

Passed: ${summary.passed}/${summary.total}

Success rate: ${summary.successRate}

| Case | Result | State | Error | Tool calls | Dispatches | Citations | Notes |
|---|---|---|---|---:|---:|---:|---|
${rows}
`;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
