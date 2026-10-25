# Local MCP runtime: real pgtriage integration

[Back to project overview](../README.md)

The default fixture demos need no database or model credentials. The optional
real-tool mode below **does connect to PostgreSQL** and can execute diagnostic
queries, including bounded EXPLAIN ANALYZE work. Use only an explicitly approved
database and scope. Advisory-only means no automated remediation; it does not mean
zero database load. Installing Agent Lab does not install the separate Python
pgtriage server; install it using the [pgtriage instructions](https://github.com/pgtriage/pgtriage)
or point to a local checkout as shown below. Agent Lab 0.4 requires pgtriage
0.3 or newer because the runtime requires durable audit identity and
`get_audit_run` reconciliation.

## Configure real mode

Real pgtriage mode requires explicit environment configuration:

```bash
export PGTRIAGE_CONNECTION_STRING="postgresql://..."
export PGTRIAGE_SCHEMA_NAME="pgtriage_demo"
export PGTRIAGE_AUDIT_STORE_PATH="/private/path/pgtriage-audit-runs.sqlite3"
export ANTHROPIC_API_KEY="..."
npm run demo:real:concise
```

`ANTHROPIC_API_KEY` is optional for `demo:real`; without it the runtime still uses the fake model but calls the real pgtriage MCP server. `PGTRIAGE_CONNECTION_STRING` is required for real tool mode and is never written to traces or output. Real mode defaults to the `pgtriage_demo` schema; set `PGTRIAGE_SCHEMA_NAME` explicitly to change the caller-authorized scope. The audit-store path is optional; pgtriage otherwise uses its platform state directory.

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

`PGTRIAGE_ARGS_JSON` must be a JSON array of strings. The child receives only
the database connection string, controlled runtime `PATH`, and explicitly
configured `PGTRIAGE_AUDIT_STORE_PATH`, `PGTRIAGE_AUDIT_RETENTION_HOURS`, and
`PGTRIAGE_AUDIT_TOMBSTONE_HOURS` values. Model credentials and unrelated
parent-process variables are not forwarded.

### Schema-scope contract

`schemaName` is optional typed request context. When present, the planner must return the exact same value and the MCP adapter maps it to `schema_name`. When omitted, pgtriage audits all non-system schemas. Agent Lab rejects empty and protected system scopes before tool execution; pgtriage remains responsible for catalog-backed existence validation.

### Retry contract

`full_audit` advertises `readOnlyHint: true`, `destructiveHint: false`, and
`idempotentHint: false`. Agent Lab persists a client-generated audit UUID before
dispatch and requires pgtriage's read-only, idempotent `get_audit_run` tool.

The runtime reconciles the UUID before dispatch and after ambiguous transport:

- `NOT_FOUND` permits one bounded dispatch or retry;
- `COMPLETED` recovers and validates retained evidence;
- `STARTED`, `FAILED`, `EXPIRED`, and `CONFLICT` stop and fail closed; and
- an unreachable or malformed lookup never becomes success.

Startup and capability discovery can still retry when failure is proven to be
pre-dispatch. This preserves the non-idempotent annotation while avoiding both a
blind replay and an unnecessary rerun of work that pgtriage already completed.
