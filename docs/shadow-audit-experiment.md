# Random-negative shadow-audit experiment

Agent Lab's deterministic routing and fixture evaluations catch known failure
classes. They do not measure how often a monitor misses an unfamiliar failure
among runs that appear safe enough to auto-close.

OpenAI's October 2026 description of its
[multilayer agent-monitoring system](https://openai.com/index/how-we-detect-frontier-model-misalignment/)
reports sending a random subset of unflagged activity into a later review stage
to estimate what earlier screens miss. Agent Lab adapts that method as a bounded,
offline fixture experiment. It does not reproduce OpenAI's monitoring system or
make claims about frontier-model misalignment.

## Registered experiment

- **Baseline:** no unflagged auto-close runs receive shadow review.
- **Candidate:** deterministically sample 5% of eligible, unflagged auto-close
  fixture runs into a second-stage review.
- **Primary outcome:** newly detected seeded violations that the primary screen
  missed.
- **Secondary metrics:** combined recall, shadow-review volume, false-positive
  alerts, estimated review cost, route mutations, and production latency.
- **Rejection:** reject if no seeded miss is found, the registered false-positive
  alert threshold is exceeded, or any production route or latency changes.

Run it with:

```bash
npm run experiment:shadow-audit
```

The runner writes:

- `artifacts/shadow-audit-experiment-report.json`;
- `artifacts/shadow-audit-experiment-report.md`.

## Recorded fixture result

The versioned fixture contains 2,000 synthetic runs and 177 seeded violations.
The primary screen detected 135 violations (76.27% recall). The candidate
sampled 98 of 1,844 eligible unflagged runs (5.31%), found three seeded misses,
and raised combined recall to 77.97%, a 1.7-point increase. It produced one
false-positive alert across 98 shadow reviews, an estimated fixture review cost
of $0.196, zero route mutations, and zero production-path latency.

The decision is `CONTINUE_EXPERIMENT`, not adopt. These numbers show that the
fixture and measurement loop work; they do not justify a production sample rate
or establish live-monitor quality.

## Immutable boundaries

The experiment is observational and offline:

- sampling cannot suppress an existing deterministic escalation;
- sampled review cannot downgrade or mutate the production route;
- Jev receives no authorization or remediation capability;
- no prompts, caller identifiers, secrets, database evidence, or hidden model
  reasoning enter the fixture;
- the candidate adds no latency to the production decision path.

The synthetic fixture provides known ground truth so monitor coverage can be
measured. Its deterministic primary and secondary reviewers do not establish
live-model precision, recall, cost, or an appropriate production sampling rate.
