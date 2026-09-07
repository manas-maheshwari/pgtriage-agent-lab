import { AgentRuntimeError } from "./errors.js";

export interface RuntimeBudgetConfig {
  maxModelCalls: number;
  maxToolCalls: number;
  maxRetriesPerOperation: number;
  maxElapsedMs: number;
  toolTimeoutMs: number;
}

export const DEFAULT_BUDGETS: RuntimeBudgetConfig = {
  maxModelCalls: 3,
  maxToolCalls: 2,
  maxRetriesPerOperation: 1,
  maxElapsedMs: 30_000,
  toolTimeoutMs: 10_000,
};

export class RuntimeBudget {
  readonly startedAt = Date.now();
  private modelCalls = 0;
  private toolCalls = 0;

  constructor(readonly config: RuntimeBudgetConfig = DEFAULT_BUDGETS) {}

  consumeModelCall(): void {
    this.assertTime();
    this.modelCalls += 1;
    if (this.modelCalls > this.config.maxModelCalls) {
      throw new AgentRuntimeError(
        "MODEL_BUDGET_EXCEEDED",
        "The workflow exceeded its model-call budget.",
        false,
      );
    }
  }

  consumeToolCall(): void {
    this.assertTime();
    this.toolCalls += 1;
    if (this.toolCalls > this.config.maxToolCalls) {
      throw new AgentRuntimeError(
        "TOOL_BUDGET_EXCEEDED",
        "The workflow exceeded its tool-call budget.",
        false,
      );
    }
  }

  assertTime(): void {
    if (Date.now() - this.startedAt > this.config.maxElapsedMs) {
      throw new AgentRuntimeError(
        "WORKFLOW_TIMEOUT",
        "The workflow exceeded its elapsed-time budget.",
        false,
      );
    }
  }

  snapshot(): { modelCalls: number; toolCalls: number; elapsedMs: number } {
    return {
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      elapsedMs: Date.now() - this.startedAt,
    };
  }
}
