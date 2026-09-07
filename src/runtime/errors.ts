export class AgentRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentRuntimeError";
  }
}

export class PreDispatchToolError extends AgentRuntimeError {
  readonly dispatchState = "not_dispatched" as const;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, true, options);
    this.name = "PreDispatchToolError";
  }
}

export class AmbiguousToolDispatchError extends AgentRuntimeError {
  readonly dispatchState = "possibly_dispatched" as const;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(code, message, true, options);
    this.name = "AmbiguousToolDispatchError";
  }
}

export function normalizeError(error: unknown): AgentRuntimeError {
  if (error instanceof AgentRuntimeError) {
    return error;
  }

  if (error instanceof Error) {
    return new AgentRuntimeError("UNEXPECTED_ERROR", error.message, false, {
      cause: error,
    });
  }

  return new AgentRuntimeError(
    "UNEXPECTED_ERROR",
    "An unknown runtime error occurred.",
    false,
  );
}
