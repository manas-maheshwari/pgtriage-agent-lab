# Jev post-run review: live acceptance result

Recorded: 2026-09-29

This was one live TypeSafe System One request over a synthetic Agent Lab workflow.
It validates adapter compatibility and end-to-end routing, not model accuracy.

## Result

| Field | Value |
| --- | --- |
| Provider model | `jev-1.13.0` |
| Workflow state | `COMPLETED` |
| Findings | 1 synthetic `missing_index` finding |
| Jev suggested route | `HUMAN_REVIEW` |
| Route confidence | 0.92 |
| Task-complete probability | 0.90 |
| Evidence-supported probability | 0.75 |
| Needs-human-review probability | 0.93 |
| Urgency score | 2.19 / 3 |
| Urgency confidence | 0.78 |
| Input tokens | 1,018 |
| Output tokens | 131 |
| Final application route | `HUMAN_REVIEW` |

The final reason codes were `HUMAN_REVIEW_PROBABILITY_HIGH` and
`OUTPUT_EXPLICITLY_REQUIRES_HUMAN_REVIEW`. The latter is an application-owned
invariant, so the result would still require a person even if the probabilistic
assessment suggested auto-close.

No caller identity, request text, raw database evidence, generated summary text,
API key or real database content was included in the provider state. The API key
remains in an ignored local `.env` file.

## Limits

- One synthetic request does not establish calibration or route accuracy.
- The evidence probability reflects aggregate metadata, not inspection of raw
  PostgreSQL evidence.
- Latency was not instrumented separately from local startup and workflow time.
- A labeled multi-case live corpus is still required before selecting production
  thresholds.
