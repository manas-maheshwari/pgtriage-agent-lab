# Research-driven engineering program

Agent Lab and [pgtriage](https://github.com/pgtriage/pgtriage) form one
production-agent case study:

- pgtriage is the deterministic evidence and recommendation layer;
- Agent Lab is the governed runtime that authorizes, invokes, validates, and
  recovers around that layer;
- the conformance suite measures whether the boundary survives failures and
  adversarial inputs.

The goal of this program is not to reproduce every new agent paper. Research is
useful here only when it becomes a bounded experiment with measurable results.

## Invariants

Research experiments may vary prompts, tool descriptions, retrieval settings,
model selection, routing thresholds, and other non-authoritative harness
configuration.

They may not rewrite or bypass:

- authorization and policy rules;
- tool allowlists or caller-approved scope;
- workflow transition rules;
- idempotency and retry semantics;
- output schemas and safety validation;
- the rule that remediation remains advisory.

Those controls are ordinary application code. A model cannot grant itself more
authority in order to improve a benchmark score.

## Intake gate

Every proposed research integration must answer six questions before code is
written:

1. What failure or limitation in the current system does it address?
2. Which component owns the change?
3. What is the smallest reversible experiment?
4. Which existing baseline will it be compared against?
5. Which safety properties must remain unchanged?
6. What result would cause us to reject the idea?

An idea is promoted only when it improves at least one measured dimension
without regressing a safety gate:

- task completion or recommendation quality;
- unsafe-action refusal;
- evidence and citation validity;
- recovery from known failure classes;
- latency, model calls, token use, or estimated cost;
- operator review burden.

## Track A: cross-repository conformance

Use pgtriage as a real MCP workload and Agent Lab as the client runtime. The
suite will inject failures at named boundaries, including:

- failure before dispatch;
- ambiguous failure after dispatch;
- duplicate delivery;
- malformed or contract-incompatible tool output;
- missing, conflicting, or injected evidence;
- caller-scope substitution;
- unauthorized remediation requests;
- tool-contract version mismatch.

Each run must emit a machine-readable report covering execution count, final
state, unsafe actions, human-review routing, evidence validity, retry behavior,
latency, and estimated cost where available.

## Track B: evidence-gated harness experiments

The first experiment will adapt the contrastive method described by
[Harness^2](https://github.com/google-research/harness2): propose bounded harness
variants, probe them on the same versioned scenarios, compare their behavior,
and compose or select a candidate only from recorded evidence.

Initial editable surfaces are deliberately narrow:

- planner and synthesis prompts;
- tool descriptions and guidance;
- retrieval configuration;
- deterministic routing thresholds;
- model choice when explicitly configured.

Candidate adoption requires:

- the same scenario set and seed where applicable;
- a baseline-versus-candidate report;
- no regression in deterministic safety checks;
- explicit human approval;
- a persisted record of the adopted configuration and supporting evidence.

The system will not claim recursive self-improvement. It is a controlled
harness experiment until repeated evaluations demonstrate transfer to unseen
scenarios.

## Track C: stronger tool-side evidence

pgtriage first completes its frozen 0.2.0 duplicate-index candidate contract.
The next tool-contract increment should expose a bounded operation envelope for
provenance and reconciliation, including an audit identifier, detector version,
timestamps, statistics-reset context, and an evidence hash.

Agent Lab can then reconcile a known audit operation after an ambiguous client
failure instead of blindly repeating work or relying only on a local timeout.

## Sequence

1. Complete and release pgtriage 0.2.0 duplicate-index candidate selection.
2. Establish conformance-suite baselines against the released pgtriage contract.
3. Run one bounded harness experiment against the versioned conformance cases.
4. Publish the measured results, limitations, and one failure-oriented demo.
5. Consider persistent cross-task lessons only after the first experiment is
   reproducible and its safety gates are stable.

Launch, correctness, and regression work preempt research experiments.

## Current status

As of October 24, 2026:

- pgtriage 0.2.1 remains the public release; the paired 0.3.0 feature branch adds
  durable audit identity and reconciliation;
- the deterministic conformance baseline passes 16 of 16 scenarios against the
  recorded pgtriage 0.3.0 contract;
- the first bounded harness experiment compared retrieval limits of two and one
  on the same 16 scenarios;
- both variants preserved safety, but the candidate cut supporting citations in
  half without a measured cost benefit, so the baseline remained active;
- future experiments remain blocked from changing policy, state, retry,
  tool-authorization, or output-validation code.

## Research log

| Date | Source | Candidate use | Decision |
| --- | --- | --- | --- |
| 2026-10-24 | pgtriage/Agent Lab failure analysis | Durable operation identity across ambiguous MCP delivery | Persist a client-generated audit UUID, reconcile before replay, and fail closed unless absence is proven |
| 2026-10-23 | [Harness^2 paper](https://arxiv.org/abs/2610.14224) and [official repository](https://github.com/google-research/harness2) | Evidence-gated comparison of bounded harness variants | Adopt the experimental method; do not allow policy or state-machine self-modification |

## Non-goals

- autonomous SQL remediation;
- a general-purpose multi-agent framework;
- replacing deterministic grading with an LLM judge;
- adopting a framework solely because it is new or popular;
- claiming model or harness improvements without a versioned baseline;
- weakening fail-closed behavior to increase completion rate.
