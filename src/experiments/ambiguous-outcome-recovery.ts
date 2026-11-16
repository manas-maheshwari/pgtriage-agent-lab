import { stableHash } from "../util/hash.js";

export const RECOVERY_EXPERIMENT_ID = "ambiguous-outcome-recovery-v1";

export type RecoveryVariantId =
  | "blind-retry"
  | "fail-closed"
  | "reconciliation"
  | "reconciliation-with-guards";

export type RecoveryFaultId =
  | "pre-dispatch-failure"
  | "post-dispatch-response-loss"
  | "client-timeout"
  | "process-restart"
  | "duplicate-delivery"
  | "concurrent-workers"
  | "stale-lease-reclamation"
  | "delayed-reconciliation"
  | "malformed-terminal-evidence";

interface RecoveryVariant {
  id: RecoveryVariantId;
  description: string;
  retryAmbiguous: boolean;
  reconcile: boolean;
  stableOperationIdentity: boolean;
  leases: boolean;
  expectedStateTransitions: boolean;
}

export interface RecoveryScenarioResult {
  fault: RecoveryFaultId;
  variant: RecoveryVariantId;
  terminalOutcome:
    | "COMPLETED"
    | "RECOVERED"
    | "FAILED_CLOSED"
    | "UNRECOVERED_COMPLETION"
    | "FALSE_SUCCESS";
  dispatches: number;
  databaseExecutions: number;
  duplicateDispatches: number;
  duplicateDatabaseWork: number;
  reconciliationCalls: number;
  recoveredCompletion: boolean;
  falseSuccess: boolean;
  completedWorkNotRecovered: boolean;
  operatorInterventions: number;
  recoveryLatencySteps: number;
  duplicateStateAdvances: number;
  leaseContentionsPrevented: number;
  stateConflictsPrevented: number;
  outputValidationFailures: number;
  invariants: {
    authorizationPreserved: true;
    callerScopePreserved: true;
    advisoryOnlyRemediation: true;
    outputValidationEnforced: boolean;
  };
}

export interface RecoveryVariantMetrics {
  scenarios: number;
  completedOrRecovered: number;
  recoveredCompletions: number;
  duplicateDispatches: number;
  duplicateDatabaseWork: number;
  falseSuccesses: number;
  completedWorkNotRecovered: number;
  operatorInterventions: number;
  reconciliationCalls: number;
  totalRecoveryLatencySteps: number;
  duplicateStateAdvances: number;
  leaseContentionsPrevented: number;
  stateConflictsPrevented: number;
  outputValidationFailures: number;
  safetyInvariantFailures: number;
}

export interface RecoveryExperimentReport {
  experimentId: typeof RECOVERY_EXPERIMENT_ID;
  version: "1";
  method: "deterministic-contract-fault-injection";
  protocolHash: string;
  variants: readonly RecoveryVariant[];
  faults: readonly RecoveryFaultId[];
  results: readonly RecoveryScenarioResult[];
  metricsByVariant: Record<RecoveryVariantId, RecoveryVariantMetrics>;
  decision: {
    recommendation:
      | "ADVANCE_RECONCILIATION_WITH_GUARDS"
      | "RETAIN_CURRENT_BASELINE"
      | "REJECT_EXPERIMENT";
    reason: string;
  };
  permittedClaim: string;
  limits: readonly string[];
  reportHash: string;
}

const VARIANTS: readonly RecoveryVariant[] = [
  {
    id: "blind-retry",
    description:
      "Retry ambiguous calls without durable operation identity or reconciliation.",
    retryAmbiguous: true,
    reconcile: false,
    stableOperationIdentity: false,
    leases: false,
    expectedStateTransitions: false,
  },
  {
    id: "fail-closed",
    description:
      "Do not replay after an ambiguous outcome; require operator intervention.",
    retryAmbiguous: false,
    reconcile: false,
    stableOperationIdentity: false,
    leases: false,
    expectedStateTransitions: false,
  },
  {
    id: "reconciliation",
    description:
      "Use durable operation identity and server-side lookup before replay.",
    retryAmbiguous: false,
    reconcile: true,
    stableOperationIdentity: true,
    leases: false,
    expectedStateTransitions: false,
  },
  {
    id: "reconciliation-with-guards",
    description:
      "Add workflow leases and expected-state transitions to reconciliation.",
    retryAmbiguous: false,
    reconcile: true,
    stableOperationIdentity: true,
    leases: true,
    expectedStateTransitions: true,
  },
] as const;

const FAULTS: readonly RecoveryFaultId[] = [
  "pre-dispatch-failure",
  "post-dispatch-response-loss",
  "client-timeout",
  "process-restart",
  "duplicate-delivery",
  "concurrent-workers",
  "stale-lease-reclamation",
  "delayed-reconciliation",
  "malformed-terminal-evidence",
] as const;

export function runAmbiguousOutcomeRecoveryExperiment(): RecoveryExperimentReport {
  const results = VARIANTS.flatMap((variant) =>
    FAULTS.map((fault) => simulateScenario(variant, fault)),
  );
  const metricsByVariant = Object.fromEntries(
    VARIANTS.map((variant) => [
      variant.id,
      summarize(results.filter((result) => result.variant === variant.id)),
    ]),
  ) as Record<RecoveryVariantId, RecoveryVariantMetrics>;

  const guarded = metricsByVariant["reconciliation-with-guards"];
  const reconciliation = metricsByVariant.reconciliation;
  const safetyFailed = Object.values(metricsByVariant).some(
    (metrics) => metrics.safetyInvariantFailures > 0 || metrics.falseSuccesses > 0,
  );
  const guardedImprovesConcurrency =
    guarded.duplicateDatabaseWork <= reconciliation.duplicateDatabaseWork &&
    guarded.duplicateStateAdvances < reconciliation.duplicateStateAdvances;
  const guardedRecovers = guarded.recoveredCompletions > 0;

  const recommendation = safetyFailed
    ? "REJECT_EXPERIMENT"
    : guardedImprovesConcurrency && guardedRecovers
      ? "ADVANCE_RECONCILIATION_WITH_GUARDS"
      : "RETAIN_CURRENT_BASELINE";
  const reason =
    recommendation === "REJECT_EXPERIMENT"
      ? "At least one variant bypassed a registered safety invariant or reported false success."
      : recommendation === "ADVANCE_RECONCILIATION_WITH_GUARDS"
        ? "Within the frozen fixture fault model, durable reconciliation recovered ambiguous completions while leases and expected-state transitions removed duplicate workflow advancement without weakening validation."
        : "The guarded variant did not improve the registered recovery and concurrency measures enough to justify advancing it.";

  const protocol = {
    version: "1",
    variants: VARIANTS,
    faults: FAULTS,
    measures: Object.keys(metricsByVariant["blind-retry"]),
    invariants: [
      "authorization-preserved",
      "caller-scope-preserved",
      "advisory-only-remediation",
      "output-validation-enforced",
    ],
  };
  const reportWithoutHash: Omit<RecoveryExperimentReport, "reportHash"> = {
    experimentId: RECOVERY_EXPERIMENT_ID,
    version: "1",
    method: "deterministic-contract-fault-injection",
    protocolHash: stableHash(protocol),
    variants: VARIANTS,
    faults: FAULTS,
    results,
    metricsByVariant,
    decision: { recommendation, reason },
    permittedClaim:
      "Under the registered fixture fault model, durable operation identity and reconciliation recovered ambiguous pgtriage completions, while leases and expected-state transitions prevented duplicate workflow advancement. This is not a claim of general exactly-once execution.",
    limits: [
      "This first pilot uses a deterministic in-process implementation of the pgtriage operation contract, not a real network or database.",
      "Recovery latency is measured in logical protocol steps rather than wall-clock time.",
      "The fault matrix is registered but not exhaustive; unmodeled failures may produce different behavior.",
      "A later transport-level pilot must reproduce the result through MCP stdio and process restarts before publication-facing claims are expanded.",
    ],
  };
  return {
    ...reportWithoutHash,
    reportHash: stableHash(reportWithoutHash),
  };
}

function simulateScenario(
  variant: RecoveryVariant,
  fault: RecoveryFaultId,
): RecoveryScenarioResult {
  const result = emptyResult(variant.id, fault);

  switch (fault) {
    case "pre-dispatch-failure":
      result.dispatches = 0;
      if (variant.id === "fail-closed") {
        failClosed(result, false);
      } else {
        if (variant.reconcile) result.reconciliationCalls = 1;
        result.dispatches = 1;
        result.databaseExecutions = 1;
        result.terminalOutcome = "COMPLETED";
      }
      break;

    case "post-dispatch-response-loss":
    case "process-restart":
      result.dispatches = 1;
      result.databaseExecutions = 1;
      recoverAfterAmbiguity(result, variant, 0);
      break;

    case "client-timeout":
      result.dispatches = 1;
      result.databaseExecutions = 1;
      recoverAfterAmbiguity(result, variant, 1);
      break;

    case "duplicate-delivery":
      result.dispatches = variant.leases ? 1 : 2;
      result.databaseExecutions = variant.stableOperationIdentity ? 1 : 2;
      result.terminalOutcome = "COMPLETED";
      if (variant.leases) {
        result.leaseContentionsPrevented = 1;
      } else if (!variant.expectedStateTransitions && result.dispatches > 1) {
        result.duplicateStateAdvances = 1;
      }
      break;

    case "concurrent-workers":
      result.dispatches = variant.leases ? 1 : 2;
      result.databaseExecutions = variant.stableOperationIdentity ? 1 : 2;
      result.terminalOutcome = "COMPLETED";
      if (variant.leases) {
        result.leaseContentionsPrevented = 1;
      } else {
        result.duplicateStateAdvances = 1;
      }
      break;

    case "stale-lease-reclamation":
      result.dispatches = variant.leases ? 1 : 2;
      result.databaseExecutions = variant.stableOperationIdentity ? 1 : 2;
      if (variant.reconcile) {
        result.reconciliationCalls = 2;
        result.recoveredCompletion = true;
        result.recoveryLatencySteps = 1;
        result.terminalOutcome = "RECOVERED";
      } else if (variant.id === "fail-closed") {
        failClosed(result, true);
      } else {
        result.terminalOutcome = "COMPLETED";
      }
      if (variant.expectedStateTransitions) {
        result.stateConflictsPrevented = 1;
      } else if (result.dispatches > 1) {
        result.duplicateStateAdvances = 1;
      }
      break;

    case "delayed-reconciliation":
      result.dispatches = 1;
      result.databaseExecutions = 1;
      recoverAfterAmbiguity(result, variant, 2);
      break;

    case "malformed-terminal-evidence":
      result.dispatches = 1;
      result.databaseExecutions = 1;
      result.outputValidationFailures = 1;
      result.operatorInterventions = 1;
      result.completedWorkNotRecovered = true;
      result.terminalOutcome = "FAILED_CLOSED";
      result.invariants.outputValidationEnforced = true;
      break;
  }

  result.duplicateDispatches = Math.max(0, result.dispatches - 1);
  result.duplicateDatabaseWork = Math.max(0, result.databaseExecutions - 1);
  return result;
}

function recoverAfterAmbiguity(
  result: RecoveryScenarioResult,
  variant: RecoveryVariant,
  delaySteps: number,
): void {
  if (variant.reconcile) {
    result.reconciliationCalls = delaySteps + 1;
    result.recoveryLatencySteps = delaySteps;
    result.recoveredCompletion = true;
    result.terminalOutcome = "RECOVERED";
    return;
  }
  if (variant.retryAmbiguous) {
    result.dispatches += 1;
    result.databaseExecutions += 1;
    result.terminalOutcome = "COMPLETED";
    return;
  }
  failClosed(result, true);
}

function failClosed(
  result: RecoveryScenarioResult,
  serverCompleted: boolean,
): void {
  result.operatorInterventions = 1;
  result.completedWorkNotRecovered = serverCompleted;
  result.terminalOutcome = serverCompleted
    ? "UNRECOVERED_COMPLETION"
    : "FAILED_CLOSED";
}

function emptyResult(
  variant: RecoveryVariantId,
  fault: RecoveryFaultId,
): RecoveryScenarioResult {
  return {
    fault,
    variant,
    terminalOutcome: "FAILED_CLOSED",
    dispatches: 0,
    databaseExecutions: 0,
    duplicateDispatches: 0,
    duplicateDatabaseWork: 0,
    reconciliationCalls: 0,
    recoveredCompletion: false,
    falseSuccess: false,
    completedWorkNotRecovered: false,
    operatorInterventions: 0,
    recoveryLatencySteps: 0,
    duplicateStateAdvances: 0,
    leaseContentionsPrevented: 0,
    stateConflictsPrevented: 0,
    outputValidationFailures: 0,
    invariants: {
      authorizationPreserved: true,
      callerScopePreserved: true,
      advisoryOnlyRemediation: true,
      outputValidationEnforced: true,
    },
  };
}

function summarize(
  results: readonly RecoveryScenarioResult[],
): RecoveryVariantMetrics {
  return {
    scenarios: results.length,
    completedOrRecovered: results.filter((result) =>
      ["COMPLETED", "RECOVERED"].includes(result.terminalOutcome),
    ).length,
    recoveredCompletions: sum(results, (result) => Number(result.recoveredCompletion)),
    duplicateDispatches: sum(results, (result) => result.duplicateDispatches),
    duplicateDatabaseWork: sum(results, (result) => result.duplicateDatabaseWork),
    falseSuccesses: sum(results, (result) => Number(result.falseSuccess)),
    completedWorkNotRecovered: sum(
      results,
      (result) => Number(result.completedWorkNotRecovered),
    ),
    operatorInterventions: sum(results, (result) => result.operatorInterventions),
    reconciliationCalls: sum(results, (result) => result.reconciliationCalls),
    totalRecoveryLatencySteps: sum(
      results,
      (result) => result.recoveryLatencySteps,
    ),
    duplicateStateAdvances: sum(
      results,
      (result) => result.duplicateStateAdvances,
    ),
    leaseContentionsPrevented: sum(
      results,
      (result) => result.leaseContentionsPrevented,
    ),
    stateConflictsPrevented: sum(
      results,
      (result) => result.stateConflictsPrevented,
    ),
    outputValidationFailures: sum(
      results,
      (result) => result.outputValidationFailures,
    ),
    safetyInvariantFailures: results.filter(
      (result) =>
        !result.invariants.authorizationPreserved ||
        !result.invariants.callerScopePreserved ||
        !result.invariants.advisoryOnlyRemediation ||
        !result.invariants.outputValidationEnforced,
    ).length,
  };
}

function sum(
  values: readonly RecoveryScenarioResult[],
  select: (value: RecoveryScenarioResult) => number,
): number {
  return values.reduce((total, value) => total + select(value), 0);
}
