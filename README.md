# pgtriage Agent Lab

## Working product

**pgtriage Agent Lab** is a production-shaped TypeScript agent runtime that asks a bounded PostgreSQL diagnostic tool for evidence and returns a structured, advisory-only remediation plan.

It is a companion reference implementation for [pgtriage](https://github.com/pgtriage/pgtriage), the open-source MCP server that performs the underlying PostgreSQL audit. The two projects remain independently installable: pgtriage owns database diagnostics, while Agent Lab demonstrates orchestration, policy, durable workflow state, retrieval, evaluation, and observability around that tool boundary.

The project intentionally starts with one complete path instead of a broad autonomous agent.

## First vertical slice

Given this request:

> Audit this PostgreSQL database and produce a prioritized remediation plan. Do not execute changes.

the system will:

1. create a workflow with a caller-supplied idempotency key;
2. bind an optional caller-authorized schema scope to typed request context;
3. ask a planner for one schema-valid `full_audit` tool call;
4. verify that the model did not invent, broaden, or replace the schema scope;
5. authorize the allowlisted tool at execution time from its MCP annotations;
6. invoke it through an MCP client;
7. pass the bounded tool result to a synthesizer;
8. validate the remediation plan against a Zod schema;
9. enforce an advisory-only output policy;
10. record correlated state transitions and timing data; and
11. return the final structured result.

The default implementation uses a deterministic fake model adapter and either a direct fixture tool or a fixture MCP server. That makes the complete workflow testable without an API key or production database. Real mode can swap in the Anthropic SDK and the real pgtriage MCP server without changing the orchestration contract.

## What this slice proves

- TypeScript can own an agent loop while Python owns the domain tool server.
- Model proposals are untrusted data and must pass schema and policy validation.
- Planning-time permission does not replace execution-time authorization.
- MCP annotations inform policy and retry behavior but never grant authorization.
- A non-idempotent `full_audit` is not automatically repeated after an ambiguous timeout or transport failure.
- Workflow state, retries, and idempotency belong to deterministic application code.
- Tool results are evidence, not instructions.
- A successful model response is not sufficient unless the complete workflow reaches a terminal state.

## What it deliberately does not prove

- a general-purpose autonomous DBA;
- automatic DDL or DML execution;
- multi-agent coordination;
- a polished web interface;
- Kubernetes deployment;
- production readiness for arbitrary databases.

It does include a narrow retrieval layer over local runbooks, but that is intentionally small. It proves citation flow and grounding behavior, not internet-scale RAG.

## Run it

```bash
npm install
npm run check
npm test
npm run demo:fixture
npm run demo:mcp
npm run demo:mcp:concise
npm run eval
```

`demo:fixture` uses an in-process fake tool. `demo:mcp` starts a local MCP fixture over stdio. Both complete without network access, API keys, or PostgreSQL. Every demo defaults to complete JSON output; append `-- --output=concise` or use a `:concise` script for recording-friendly output.

Real pgtriage mode requires explicit environment configuration:

```bash
export PGTRIAGE_CONNECTION_STRING="postgresql://..."
export PGTRIAGE_SCHEMA_NAME="pgtriage_demo"
export ANTHROPIC_API_KEY="..."
npm run demo:real:concise
```

`ANTHROPIC_API_KEY` is optional for `demo:real`; without it the runtime still uses the fake model but calls the real pgtriage MCP server. `PGTRIAGE_CONNECTION_STRING` is required for real tool mode and is never written to traces or output. Real mode defaults to the `pgtriage_demo` schema; set `PGTRIAGE_SCHEMA_NAME` explicitly to change the caller-authorized scope.

### Run against a local pgtriage checkout

The child process is configured as a command plus a JSON array of arguments. No shell string is parsed. If the pgtriage checkout has an editable virtual environment, point Agent Lab to it like this:

```bash
export PGTRIAGE_CONNECTION_STRING="postgresql://..."
export PGTRIAGE_SCHEMA_NAME="pgtriage_demo"
export PGTRIAGE_COMMAND="/path/to/pgtriage/.venv/bin/python"
export PGTRIAGE_ARGS_JSON='["-m", "pgtriage"]'
export PGTRIAGE_CWD="/path/to/pgtriage"
npm run demo:real:concise
```

`PGTRIAGE_ARGS_JSON` must be a JSON array of strings. The child receives only the database connection string and the controlled runtime `PATH`; model credentials and unrelated parent-process variables are not forwarded.

### Schema-scope contract

`schemaName` is optional typed request context. When present, the planner must return the exact same value and the MCP adapter maps it to `schema_name`. When omitted, pgtriage audits all non-system schemas. Agent Lab rejects empty and protected system scopes before tool execution; pgtriage remains responsible for catalog-backed existence validation.

### Retry contract

`full_audit` advertises `readOnlyHint: true`, `destructiveHint: false`, and `idempotentHint: false`. Agent Lab can retry startup or capability discovery when failure is proven to be pre-dispatch. It does not automatically retry an ambiguous timeout or transport failure after `full_audit` may have started. This can require manual operator reconciliation, but it avoids silently repeating bounded `EXPLAIN ANALYZE` work.

## Technology choices

| Area | Choice | Why | Tradeoff |
|---|---|---|---|
| Runtime | Node.js 22 + TypeScript | Matches TypeScript-heavy agent platform roles and makes contracts explicit | Less aligned with the existing Python pgtriage implementation, which is useful because it forces a real protocol boundary |
| Package manager | npm | Already installed and requires no additional tooling | Slower and less strict than pnpm for large monorepos; irrelevant at this size |
| Model boundary | Small `ModelProvider` interface | Keeps orchestration independent of one vendor and permits deterministic tests | Must avoid inventing an over-general abstraction before a second provider exists |
| Real model | Anthropic TypeScript SDK | Directly relevant to the role and supports native tool use | Live tests cost money and can be nondeterministic |
| Tool protocol | Official MCP TypeScript SDK | Exercises a genuine TypeScript-host/Python-server contract | Adds transport and lifecycle complexity compared with a direct function call |
| Validation | Zod | Runtime validation plus inferred TypeScript types | A valid schema does not prove a recommendation is semantically safe |
| Tests | Vitest | Fast TypeScript-native unit and integration tests | The test runner does not solve external-service reproducibility by itself |
| Workflow persistence | Memory and SQLite implementations | Shows idempotency and lease semantics without needing a hosted database | Node's `node:sqlite` API is still experimental |
| Interface | CLI first | Keeps attention on orchestration, safety, and evaluation | Less visually impressive until a thin UI is added later |

## Repository structure

```text
pgtriage-agent-lab/
├── README.md
├── docs/
│   ├── architecture.md
│   └── milestones.md
├── src/
│   ├── cli.ts
│   ├── domain/
│   │   ├── remediation.ts
│   │   └── workflow.ts
│   ├── runtime/
│   │   ├── orchestrator.ts
│   │   ├── policy.ts
│   │   └── budgets.ts
│   ├── ports/
│   │   ├── model-provider.ts
│   │   ├── tool-client.ts
│   │   └── workflow-store.ts
│   ├── adapters/
│   │   ├── model/
│   │   │   ├── fake-model-provider.ts
│   │   │   └── anthropic-model-provider.ts
│   │   ├── tools/
│   │   │   └── mcp-tool-client.ts
│   │   ├── retrieval/
│   │   │   └── markdown-corpus-retriever.ts
│   │   └── persistence/
│   │       ├── memory-workflow-store.ts
│   │       └── sqlite-workflow-store.ts
│   ├── eval/
│   │   └── run-eval.ts
│   └── observability/
│       ├── jsonl-trace-recorder.ts
│       └── memory-trace-recorder.ts
├── test/
│   ├── unit/
│   └── integration/
├── corpus/
└── artifacts/
```

`runs/` and `node_modules/` are generated locally and ignored. Evaluation reports under `artifacts/` are regenerated by `npm run eval` and retained as reviewable evidence.

## Build order

The project follows one rule: **make the deterministic shell correct before making the model more capable.**

1. Contracts and deterministic fixture path: done
2. Explicit orchestration and policy: done
3. Real MCP and Anthropic integration: implemented, with live mode gated by env
4. Persistence and recovery primitives: implemented with SQLite, idempotency, and leases
5. Narrow evidence retrieval: implemented over local runbooks
6. Evaluation harness: implemented with generated JSON and Markdown reports
7. Observability and technical review pack: implemented as docs and JSONL traces

See [architecture.md](docs/architecture.md) for component boundaries and [milestones.md](docs/milestones.md) for acceptance criteria.
