import { randomUUID } from "node:crypto";

import type {
  TraceEventKind,
  TraceRecorder,
} from "../ports/trace-recorder.js";

export async function traced<T>(
  recorder: TraceRecorder,
  input: {
    workflowId: string;
    kind: TraceEventKind;
    name: string;
    attributes?: Record<string, string | number | boolean>;
  },
  operation: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const spanId = randomUUID();

  try {
    const result = await operation();
    const end = Date.now();
    await recorder.record({
      workflowId: input.workflowId,
      spanId,
      kind: input.kind,
      name: input.name,
      startedAt,
      endedAt: new Date(end).toISOString(),
      durationMs: end - start,
      status: "ok",
      attributes: input.attributes ?? {},
    });
    return result;
  } catch (error) {
    const end = Date.now();
    await recorder.record({
      workflowId: input.workflowId,
      spanId,
      kind: input.kind,
      name: input.name,
      startedAt,
      endedAt: new Date(end).toISOString(),
      durationMs: end - start,
      status: "error",
      attributes: input.attributes ?? {},
    });
    throw error;
  }
}
