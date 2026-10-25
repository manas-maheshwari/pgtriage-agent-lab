# Controlled harness experiments

Agent Lab uses a narrow, evidence-gated interpretation of the contrastive
Propose-Probe-Compose method described by Harness^2. The runtime does not rewrite
itself. A human registers bounded configurations, the runner probes each one on
the same versioned scenarios, and deterministic safety gates decide whether a
candidate is even eligible for consideration.

## First experiment

The first experiment changes exactly one non-authoritative surface:

- baseline: retrieve up to two supporting chunks per finding;
- candidate: retrieve up to one supporting chunk per finding.

Run it with:

```bash
npm run experiment:harness
```

The runner writes machine-readable and reviewable reports to:

- `artifacts/harness-experiment-report.json`;
- `artifacts/harness-experiment-report.md`.

Both variants run the same 16 conformance scenarios against the recorded
pgtriage 0.3.0 contract. Configuration, scenario, model, outcome, and report
hashes identify the exact evidence used in the comparison. Wall-clock latency is
reported but excluded from reproducible hashes and the decision because it is
too noisy in this local fixture run.

## Recorded result

Both configurations preserved the deterministic safety baseline. The candidate
reduced supporting citations from twelve to six and produced no measured token,
cost, or latency benefit. The runner therefore retained
`baseline-retrieval-2-v1` and persisted that negative result as the lesson.

This is a same-task comparison, not evidence of generalization to unseen tasks.

## Adoption boundary

The experiment runner cannot update the active configuration. A separate command
requires the exact candidate ID, report hash, and approver identity. It also
refuses safety-ineligible or non-recommended candidates. The recorded candidate
is intentionally blocked from adoption because its report says
`RETAIN_BASELINE`.

Future experiments must create a new versioned candidate and report. They cannot
override a prior gate, edit authorization or workflow code, or treat a quality
gain as permission to accept a safety regression.
