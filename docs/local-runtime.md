# Local MCP runtime: real pgtriage integration

[Back to project overview](../README.md)

The default fixture demos need no database or model credentials. The optional
real-tool mode below **does connect to PostgreSQL** and can execute diagnostic
queries, including bounded EXPLAIN ANALYZE work. Use only an explicitly approved
database and scope. Advisory-only means no automated remediation; it does not mean
zero database load. Installing Agent Lab does not install the separate Python
pgtriage server; install it using the [pgtriage instructions](https://github.com/pgtriage/pgtriage)
or point to a local checkout as shown below.

## Configure real mode

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
