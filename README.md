# pgtriage Agent Lab

A TypeScript reference runtime for **evidence-based PostgreSQL investigations**.
Models can plan and explain; application code controls authorization, tool
execution, workflow state, retries, and validation.

Agent Lab works with [pgtriage](https://github.com/pgtriage/pgtriage), the Python
MCP server that collects PostgreSQL diagnostics. pgtriage owns the audit. Agent
Lab demonstrates the production boundaries around an agent that uses it.

> Default demos use synthetic data and deterministic test models. They need no
> database, cloud account, or model API key, and they never execute remediation.

[Walkthrough](docs/review/WALKTHROUGH.md) ·
[Architecture](docs/architecture.md) ·
[Integration guide](docs/local-runtime.md) ·
[Post-run review](docs/run-review.md)

## Why this exists

A useful database agent needs more than a good model response:

```text
request -> plan -> policy check -> MCP diagnostic -> validation -> saved result
                                                                   |
                                                        optional quality review
```

The runtime makes those boundaries explicit. A model can propose actions and
interpret evidence, but it cannot grant itself access, bypass validation, or
silently convert an uncertain execution outcome into success.

## Run it in one minute

Requires Node.js 22 or newer.

```bash
git clone https://github.com/manas-maheshwari/pgtriage-agent-lab.git
cd pgtriage-agent-lab
npm ci
npm run demo:mcp:concise
```

This starts a fixture MCP server over stdio, runs a bounded audit workflow, and
prints an advisory result using synthetic diagnostics.

## Explore the system

| Experience | Command | What it shows |
| --- | --- | --- |
| MCP workflow | `npm run demo:mcp:concise` | Authorization, tool execution, retries, and output validation |
| In-process workflow | `npm run demo:fixture:concise` | The same orchestration without MCP transport |
| Local chat UI | `npm run dev:cloudflare` | Saved investigations and evidence-based follow-ups |
| Post-run review | `npm run demo:review` | Deterministic closure and escalation routing |
| Real pgtriage | `npm run demo:real:concise` | Explicitly approved diagnostics against a configured database |

Read the [integration guide](docs/local-runtime.md) before using the real pgtriage
mode. It can contact a real database even without a model API key.

The local chat UI runs at `http://127.0.0.1:8787` with a fixed test model and a
synthetic incident. It demonstrates state and evidence handling, not live model
quality.

## What is enforced in code

- **Authorization:** proposed tools and schema scope must satisfy explicit policy.
- **Retry safety:** ambiguous post-dispatch failures are not replayed blindly.
- **Evidence checks:** valid JSON must still pass citation and advisory validation.
- **Bounded inference:** hosted attempts reserve persisted quota before dispatch.
- **Safe review:** Jev can assess quality and urgency, but deterministic rules own
  the final route and fail closed to human review.

The Jev integration is documented with a
[design note](docs/run-review.md),
[deterministic evaluation](artifacts/run-review-eval-report.md), and
[recorded live API check](artifacts/run-review-live-result.md).

## Verification

The recorded September 28 suite passed:

| Check | Result |
| --- | ---: |
| Automated tests | 89 |
| TypeScript checks | 2 |
| Workflow evaluation cases | 26 |
| Post-run routing cases | 7 |

<details>
<summary>Run the full validation suite</summary>

```bash
npm run check:all
npx playwright install chromium
npm run test:all
npm run eval
npm run eval:review
```

</details>

These are fixture-based contract and recorded integration results, not a general
model-accuracy study. CI runs without cloud credentials.

## Current limits

This is a reference implementation, not an autonomous DBA or production-ready
database service. It has no automatic DDL/DML remediation or general-purpose SQL
tool. Real diagnostics can still consume database resources, and a citation's
presence alone does not prove that every claim is supported.

See [milestones](docs/milestones.md) and the [postmortem](docs/postmortem.md) for
remaining gaps and the design changes that followed testing.

## Documentation

| Document | Start here when you want to... |
| --- | --- |
| [Walkthrough](docs/review/WALKTHROUGH.md) | See a saved investigation |
| [Architecture](docs/architecture.md) | Understand components and trust boundaries |
| [Local integration](docs/local-runtime.md) | Connect Agent Lab to pgtriage |
| [Post-run review](docs/run-review.md) | Understand the Jev routing layer |
| [Cloudflare notes](cloudflare/README.md) | Inspect the hosted chat implementation |
| [Privacy review](docs/review/PRIVACY-CHECK.md) | Review publication and data-handling checks |

The repository also retains [recorded hosted-model results](cloudflare/LIVE-RESULTS.md)
and an auditable [development prompt history](PROMPTS.md).
