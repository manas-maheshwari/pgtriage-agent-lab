import type {
  TraceEvent,
  TraceRecorder,
} from "../ports/trace-recorder.js";

export class MemoryTraceRecorder implements TraceRecorder {
  readonly events: TraceEvent[] = [];

  async record(event: TraceEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }
}
