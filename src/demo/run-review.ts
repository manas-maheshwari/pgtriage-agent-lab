import { resolve } from "node:path";

import { FakeModelProvider } from "../adapters/model/fake-model-provider.js";
import { MemoryWorkflowStore } from "../adapters/persistence/memory-workflow-store.js";
import { MarkdownCorpusRetriever } from "../adapters/retrieval/markdown-corpus-retriever.js";
import { FakeRunReviewer } from "../adapters/review/fake-run-reviewer.js";
import { JevRunReviewer } from "../adapters/review/jev-run-reviewer.js";
import { FixtureToolClient } from "../adapters/tools/fixture-tool-client.js";
import { MemoryTraceRecorder } from "../observability/memory-trace-recorder.js";
import type { RunReviewer } from "../ports/run-reviewer.js";
import { AgentOrchestrator } from "../runtime/orchestrator.js";
import { RunReviewService } from "../runtime/run-review.js";

const rootDir = resolve(import.meta.dirname, "../..");

async function main(): Promise<void> {
  const live = process.argv.includes("--live");
  const store = new MemoryWorkflowStore();
  const traces = new MemoryTraceRecorder();
  const orchestrator = new AgentOrchestrator({
    model: new FakeModelProvider(),
    tools: new FixtureToolClient(),
    store,
    traces,
    retriever: new MarkdownCorpusRetriever(resolve(rootDir, "corpus")),
  });

  try {
    const workflow = await orchestrator.run({
      prompt: "Audit the synthetic PostgreSQL fixture and produce advisory findings.",
      idempotencyKey: "run-review-demo-20260928",
      environment: "fixture",
      caller: {
        tenantId: "demo-tenant",
        userId: "demo-user",
        roles: ["database_auditor"],
      },
    });

    const reviewer = reviewerForMode(live);
    const decision = await new RunReviewService({ reviewer }).review(
      workflow,
      traces.events,
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: live ? "jev" : "deterministic-fake",
          workflow: {
            workflowId: workflow.workflowId,
            state: workflow.state,
            findings: workflow.result?.findings.length ?? 0,
          },
          review: decision,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await store.close();
  }
}

function reviewerForMode(live: boolean): RunReviewer {
  if (!live) return new FakeRunReviewer();

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TYPESAFE_API_KEY is required for --live. Use the default demo for a credential-free run.",
    );
  }
  return new JevRunReviewer({
    apiKey,
    ...(process.env.TYPESAFE_MODEL
      ? { model: process.env.TYPESAFE_MODEL }
      : {}),
  });
}

await main();
