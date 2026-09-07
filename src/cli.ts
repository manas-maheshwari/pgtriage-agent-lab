import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FakeModelProvider } from "./adapters/model/fake-model-provider.js";
import { AnthropicModelProvider } from "./adapters/model/anthropic-model-provider.js";
import { MemoryWorkflowStore } from "./adapters/persistence/memory-workflow-store.js";
import { MarkdownCorpusRetriever } from "./adapters/retrieval/markdown-corpus-retriever.js";
import { FixtureToolClient } from "./adapters/tools/fixture-tool-client.js";
import { fixtureMcpToolClient, realPgTriageToolClient } from "./config/tool-clients.js";
import type { AuditRequest } from "./domain/index.js";
import { JsonlTraceRecorder } from "./observability/jsonl-trace-recorder.js";
import type { ToolClient } from "./ports/tool-client.js";
import type { WorkflowStore } from "./ports/workflow-store.js";
import { AgentOrchestrator } from "./runtime/orchestrator.js";
import { formatConciseWorkflow } from "./output/concise-formatter.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type DemoMode = "fixture" | "mcp-fixture" | "real";
type OutputMode = "json" | "concise";

async function main(): Promise<void> {
  const mode = parseMode(process.argv);
  const outputMode = parseOutputMode(process.argv);
  const runDir = resolve(rootDir, "runs");
  await mkdir(runDir, { recursive: true });

  const traces = new JsonlTraceRecorder(resolve(runDir, `${mode}-trace.jsonl`));
  const store = await workflowStore(runDir);
  const tools = toolClientForMode(mode);
  const model =
    process.env.ANTHROPIC_API_KEY && mode === "real"
      ? new AnthropicModelProvider()
      : new FakeModelProvider();

  const orchestrator = new AgentOrchestrator({
    model,
    tools,
    store,
    traces,
    retriever: new MarkdownCorpusRetriever(resolve(rootDir, "corpus")),
  });

  try {
    const workflow = await orchestrator.run(requestForMode(mode));
    process.stdout.write(
      outputMode === "concise"
        ? formatConciseWorkflow(workflow)
        : `${JSON.stringify(workflow, null, 2)}\n`,
    );
    if (workflow.state !== "COMPLETED") {
      process.exitCode = 1;
    }
  } finally {
    await tools.close();
    await store.close();
  }
}

async function workflowStore(runDir: string): Promise<WorkflowStore> {
  if (process.env.SQLITE_WORKFLOWS !== "1") return new MemoryWorkflowStore();
  const { SqliteWorkflowStore } = await import(
    "./adapters/persistence/sqlite-workflow-store.js"
  );
  return new SqliteWorkflowStore(resolve(runDir, "workflows.sqlite"));
}

function parseOutputMode(argv: readonly string[]): OutputMode {
  const output =
    argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length) ??
    "json";
  if (output === "json" || output === "concise") return output;
  throw new Error("Supported output modes are --output=json and --output=concise.");
}

function parseMode(argv: readonly string[]): DemoMode {
  const mode = argv.find((arg) => arg.startsWith("--mode="))?.slice("--mode=".length) ?? "fixture";
  if (mode === "fixture" || mode === "mcp-fixture" || mode === "real") return mode;
  throw new Error("Supported modes are --mode=fixture, --mode=mcp-fixture, and --mode=real.");
}

function toolClientForMode(mode: DemoMode): ToolClient {
  if (mode === "fixture") return new FixtureToolClient();
  if (mode === "mcp-fixture") return fixtureMcpToolClient();
  return realPgTriageToolClient();
}

function requestForMode(mode: DemoMode): AuditRequest {
  const schemaName =
    mode === "real"
      ? (process.env.PGTRIAGE_SCHEMA_NAME ?? "pgtriage_demo")
      : undefined;
  return {
    prompt:
      "Audit this PostgreSQL database for missing indexes, sequential scans, dead tuple bloat, and connection pressure. Return advisory recommendations only.",
    idempotencyKey: `${mode}-demo-request`,
    environment: mode === "real" ? "approved_database" : "fixture",
    ...(schemaName === undefined ? {} : { schemaName }),
    caller: {
      tenantId: "demo-tenant",
      userId: "demo-user",
      roles: mode === "real" ? ["approved_database_auditor"] : ["engineer"],
    },
    executeChanges: false,
  };
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
