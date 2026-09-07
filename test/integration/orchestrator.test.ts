import { describe, expect, it } from "vitest";

import { FakeModelProvider } from "../../src/adapters/model/fake-model-provider.js";
import { MemoryWorkflowStore } from "../../src/adapters/persistence/memory-workflow-store.js";
import { FixtureToolClient } from "../../src/adapters/tools/fixture-tool-client.js";
import { MemoryTraceRecorder } from "../../src/observability/memory-trace-recorder.js";
import { NoopRetriever } from "../../src/ports/retriever.js";
import { AgentOrchestrator } from "../../src/runtime/orchestrator.js";
import { formatConciseWorkflow } from "../../src/output/concise-formatter.js";

const request = {
  prompt: "Audit this PostgreSQL database and recommend safe next steps.",
  idempotencyKey: "integration-request-0001",
  environment: "fixture" as const,
  caller: { tenantId: "tenant-1", userId: "user-1", roles: ["engineer"] },
  executeChanges: false as const,
};

function harness(options: {
  model?: ConstructorParameters<typeof FakeModelProvider>[0];
  tool?: ConstructorParameters<typeof FixtureToolClient>[0];
} = {}) {
  const model = new FakeModelProvider(options.model);
  const tools = new FixtureToolClient(options.tool);
  const store = new MemoryWorkflowStore();
  const traces = new MemoryTraceRecorder();
  const orchestrator = new AgentOrchestrator({
    model,
    tools,
    store,
    traces,
    retriever: new NoopRetriever(),
  });
  return { model, tools, store, traces, orchestrator };
}

describe("AgentOrchestrator", () => {
  it("runs one bounded advisory workflow to completion", async () => {
    const { orchestrator, tools } = harness();
    const workflow = await orchestrator.run(request);

    expect(workflow.state).toBe("COMPLETED");
    expect(workflow.result?.findings).toHaveLength(1);
    expect(workflow.result?.findings[0]?.requiresHumanReview).toBe(true);
    expect(workflow.result?.findings[0]?.recommendation).toMatch(/Insufficient evidence/);
    expect(tools.callCount).toBe(1);
    expect(workflow.transitions.map(({ to }) => to)).toEqual([
      "PLANNING",
      "PLAN_VALIDATED",
      "TOOL_AUTHORIZED",
      "TOOL_RUNNING",
      "TOOL_COMPLETE",
      "SYNTHESIZING",
      "OUTPUT_VALIDATED",
      "POLICY_CHECKED",
      "COMPLETED",
    ]);
  });

  it("returns the stored terminal result for a repeated idempotency key", async () => {
    const { orchestrator, tools, model } = harness();
    const first = await orchestrator.run(request);
    const second = await orchestrator.run(request);

    expect(second.workflowId).toBe(first.workflowId);
    expect(tools.callCount).toBe(1);
    expect(model.planCalls).toBe(1);
  });

  it("rejects a request for execution before model or tool use", async () => {
    const { orchestrator, tools, model } = harness();
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-0002",
      prompt: "Run the database changes and apply the fix.",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("EXECUTION_NOT_ALLOWED");
    expect(model.planCalls).toBe(0);
    expect(tools.callCount).toBe(0);
  });

  it("denies a tool that is not declared read-only", async () => {
    const { orchestrator, tools } = harness({ tool: { readOnlyHint: false } });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-0003",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("WRITE_TOOL_NOT_ALLOWED");
    expect(tools.callCount).toBe(0);
  });

  it("fails closed when readOnlyHint is missing", async () => {
    const { orchestrator, tools } = harness({ tool: { omitReadOnlyHint: true } });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-missing-readonly",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("WRITE_TOOL_NOT_ALLOWED");
    expect(tools.callCount).toBe(0);
  });

  it("rejects a tool marked destructive", async () => {
    const { orchestrator, tools } = harness({ tool: { destructiveHint: true } });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-destructive",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("DESTRUCTIVE_TOOL_NOT_ALLOWED");
    expect(tools.callCount).toBe(0);
  });

  it("recovers from one transient model and pre-dispatch tool failure", async () => {
    const { orchestrator, tools, model } = harness({
      model: { planFailureCount: 1 },
      tool: { preDispatchFailureCount: 1 },
    });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-0004",
    });

    expect(workflow.state).toBe("COMPLETED");
    expect(model.planCalls).toBe(2);
    expect(tools.callCount).toBe(2);
    expect(tools.dispatchCount).toBe(1);
  });

  it("does not retry non-idempotent full_audit after an ambiguous dispatch failure", async () => {
    const { orchestrator, tools } = harness({
      tool: { ambiguousFailureCount: 1 },
    });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-ambiguous",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("MCP_AMBIGUOUS_TRANSPORT_FAILURE");
    expect(tools.callCount).toBe(1);
    expect(tools.dispatchCount).toBe(1);
  });

  it("does not retry non-idempotent full_audit after an ambiguous timeout", async () => {
    const model = new FakeModelProvider();
    const tools = new FixtureToolClient({ delayMs: 20 });
    const store = new MemoryWorkflowStore();
    const orchestrator = new AgentOrchestrator({
      model,
      tools,
      store,
      traces: new MemoryTraceRecorder(),
      retriever: new NoopRetriever(),
      budget: {
        maxModelCalls: 3,
        maxToolCalls: 2,
        maxRetriesPerOperation: 1,
        maxElapsedMs: 30_000,
        toolTimeoutMs: 10,
      },
    });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-timeout",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("TOOL_TIMEOUT");
    expect(tools.callCount).toBe(1);
    expect(tools.dispatchCount).toBe(1);
  });

  it("carries caller schema scope into the authorized plan and MCP wire arguments", async () => {
    const { orchestrator, tools } = harness();
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-schema",
      schemaName: "pgtriage_demo",
    });

    expect(workflow.state).toBe("COMPLETED");
    expect(workflow.plan?.arguments.schemaName).toBe("pgtriage_demo");
    expect(tools.lastWireArguments).toEqual({
      slow_query_limit: 10,
      schema_name: "pgtriage_demo",
    });
  });

  it("rejects a model that changes the caller-authorized schema", async () => {
    const { orchestrator, tools } = harness({
      model: { plannedSchemaName: "public" },
    });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-schema-mismatch",
      schemaName: "pgtriage_demo",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("SCHEMA_SCOPE_MISMATCH");
    expect(tools.listCount).toBe(0);
    expect(tools.callCount).toBe(0);
  });

  it("preserves all-schema behavior when schema scope is omitted", async () => {
    const { orchestrator, tools } = harness();
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-unscoped",
    });

    expect(workflow.state).toBe("COMPLETED");
    expect(workflow.plan?.arguments.schemaName).toBeUndefined();
    expect(tools.lastWireArguments).toEqual({ slow_query_limit: 10 });
  });

  it("keeps credentials out of concise output", async () => {
    const { orchestrator } = harness();
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-redaction",
      prompt:
        "Audit the database. Internal credential marker: postgresql://secret-user:secret-password@localhost/demo",
    });

    const output = formatConciseWorkflow(workflow);
    expect(output).not.toContain("secret-user");
    expect(output).not.toContain("secret-password");
    expect(output).toContain("Authorization: ALLOWED");
  });

  it("rejects generated output that falsely claims execution", async () => {
    const { orchestrator } = harness({ model: { claimExecution: true } });
    const workflow = await orchestrator.run({
      ...request,
      idempotencyKey: "integration-request-0005",
    });

    expect(workflow.state).toBe("TERMINAL_FAILURE");
    expect(workflow.error?.code).toBe("OUTPUT_CLAIMS_EXECUTION");
  });
});
