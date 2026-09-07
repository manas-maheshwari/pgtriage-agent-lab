# Demo Script

## Recording Goal

In two to three minutes, show that pgtriage can operate as a bounded MCP evidence source inside a production-shaped agent runtime. The point is not model cleverness. The point is that deterministic code owns scope, state, policy, budgets, retries, idempotency, tool execution, and final validation.

## Recommended Sequence

### 1. Frame the boundary, 20 seconds

Say:

> The caller asks for a database audit and supplies an optional authorized schema scope. The model can propose one `full_audit` call, but it cannot change that scope or authorize itself. TypeScript validates the plan, checks MCP annotations and local policy, invokes pgtriage, validates the evidence, retrieves citations, and allows only advisory output.

### 2. Show the MCP path, 60 to 90 seconds

Run:

```bash
npm run demo:mcp:concise
```

What to point out:

- every state transition is explicit;
- schema scope is printed separately from the free-text prompt;
- scope policy confirms that the plan matches caller-authorized context;
- authorization shows `readOnlyHint=true`, `destructiveHint=false`, and `idempotentHint=false`;
- the MCP invocation uses bounded wire arguments;
- evidence is represented by a finding count and SHA-256 hash;
- retrieval attaches local runbook citations;
- output policy passes only after schema validation and human-review checks;
- the final recommendation remains advisory.

The fixture MCP server has the same `full_audit` annotation and schema-scope shape as the current pgtriage server, but needs no API key or database.

### 3. Explain the retry tradeoff, 30 seconds

Say:

> `full_audit` is read-only but not idempotent because slow-query analysis may run bounded `EXPLAIN ANALYZE`. Startup or capability-discovery failure can be retried because dispatch has not happened. If a timeout or transport failure is ambiguous after dispatch, the runtime stops after one attempt instead of silently repeating database work.

### 4. Show measured behavior, 20 seconds

Run:

```bash
npm run eval
```

Point to `artifacts/eval-report.md`. Highlight schema-scope enforcement, annotation failures, pre-dispatch recovery, ambiguous-dispatch refusal, idempotency, and output-policy rejection.

## Optional Real Local Run

Use a throwaway database and the `pgtriage_demo` schema:

```bash
export PGTRIAGE_CONNECTION_STRING="postgresql://..."
export PGTRIAGE_SCHEMA_NAME="pgtriage_demo"
export PGTRIAGE_COMMAND="/path/to/pgtriage/.venv/bin/python"
export PGTRIAGE_ARGS_JSON='["-m", "pgtriage"]'
export PGTRIAGE_CWD="/path/to/pgtriage"
npm run demo:real:concise
```

Leave `ANTHROPIC_API_KEY` unset when the recording should demonstrate the real MCP/database boundary with deterministic model output. Set it only when live model behavior is specifically part of the demonstration.

## Unsafe Request

The policy test suite shows blocked paths:

```bash
npm test -- test/integration/orchestrator.test.ts
```

Useful cases include direct execution refusal, model schema-scope substitution, missing `readOnlyHint`, a destructive annotation, and an execution claim in generated output.

## Evaluation

Run:

```bash
npm run eval
```

The report is written to:

- `artifacts/eval-report.json`
- `artifacts/eval-report.md`

Complete JSON remains available with `npm run demo:mcp` or `--output=json`. Use that for debugging, not the short recording.
