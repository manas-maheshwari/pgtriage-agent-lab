# Post-run review with Jev

This vertical slice adds an operational reviewer after an Agent Lab workflow reaches
a terminal state. It combines deterministic invariants with a probabilistic Jev
assessment. The reviewer classifies a run for closure or follow-up; it cannot
authorize tools, rerun a workflow, or apply database changes.

## Why this boundary

Some review questions are exact:

- Did a tool dispatch have an ambiguous outcome?
- Did the workflow claim completion without evidence or output?
- Did a policy denial happen before or after tool execution started?
- Did a finding explicitly require operator review?

Application code answers those questions. They are not delegated to a model.

Other questions are useful but less mechanical:

- Does the terminal record appear to satisfy the intended audit task?
- Is the output adequately supported by its evidence and citation shape?
- How urgent is operator review?
- Which operational queue best fits the run?

Jev evaluates those dimensions and returns probabilities, a route choice and an
urgency score. Application-owned thresholds reduce the assessment to a route.

## Data flow

```text
terminal workflow + trace events
              |
              v
   bounded review-state builder
   - no caller identity
   - no credentials
   - no raw database evidence or generated summary text
              |
              v
      deterministic hard rules --------------------+
              |                                     |
       no hard decision                      hard decision
              |                                     |
              v                                     v
      Jev System One API                     final route
              |
              v
 probabilistic assessment
              |
              v
 deterministic thresholds and explicit review flags
              |
              v
 AUTO_CLOSE | HUMAN_REVIEW | PRIORITY_REVIEW | FILE_ISSUE
```

The request uses TypeSafe's documented `POST /v1/systemone` contract. Five named
questions are sent in one call: three `noul` questions, one `choice` question and
one `score` question. The adapter validates the complete response before it enters
the routing policy.

## Failure behavior

| Condition | Route | Jev called? |
| --- | --- | --- |
| Ambiguous post-dispatch failure or timeout | `PRIORITY_REVIEW` | No |
| Completed state without required evidence/output | `FILE_ISSUE` | No |
| Expected policy denial before tool start | `AUTO_CLOSE` | No |
| Policy denial after tool start | `FILE_ISSUE` | No |
| Other terminal failure or cancellation | `HUMAN_REVIEW` | No |
| Provider error, timeout or invalid schema | `HUMAN_REVIEW` | Attempted |
| Low-confidence auto-close suggestion | `HUMAN_REVIEW` | Yes |
| Output explicitly requires human review | At least `HUMAN_REVIEW` | Yes |

Escalating routes are preserved. A model result can never downgrade an ambiguous
execution outcome, remove an explicit human-review requirement, or grant tool
access.

## Run it

Credential-free demo using the deterministic reviewer adapter:

```bash
npm run demo:review
```

Deterministic routing evaluation:

```bash
npm run eval:review
```

The generated reports are:

- `artifacts/run-review-eval-report.json`
- `artifacts/run-review-eval-report.md`

One sanitized live acceptance result is recorded in
[`artifacts/run-review-live-result.md`](../artifacts/run-review-live-result.md).
It verifies the HTTP contract and routing path only; it is not an accuracy study.

For a live Jev assessment, create a TypeSafe API key in your own account and expose
it only to the local process:

```bash
TYPESAFE_API_KEY=... npm run demo:review:live
```

Optionally set `TYPESAFE_MODEL` to a model name returned by TypeSafe's
`GET /v1/models` endpoint. The default alias is `jev-latest`. Do not commit keys or
paste them into issues, screenshots or demo recordings.

## What is and is not measured

The deterministic evaluation measures routing contracts against labeled fixtures,
including provider failure and unsafe false-negative cases. It does not establish
Jev model accuracy. A meaningful live evaluation needs a labeled corpus of real or
carefully constructed run summaries, route precision/recall by class, unsafe
false-negative rate, calibration, latency and cost.

This repository integrates with TypeSafe's public API; it does not imply a
partnership or endorsement.
