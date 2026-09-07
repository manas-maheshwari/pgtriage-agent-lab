export type TraceEventKind =
  | "workflow"
  | "model"
  | "policy"
  | "tool"
  | "retrieval"
  | "retry";

export interface TraceEvent {
  workflowId: string;
  spanId: string;
  parentSpanId?: string;
  kind: TraceEventKind;
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  status: "ok" | "error" | "denied";
  attributes: Record<string, string | number | boolean>;
}

export interface TraceRecorder {
  record(event: TraceEvent): Promise<void>;
}
