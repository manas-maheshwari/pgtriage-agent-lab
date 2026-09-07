import { mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";

import type { TraceRecorder } from "../ports/trace-recorder.js";
import type { TraceEvent } from "../ports/trace-recorder.js";

export class JsonlTraceRecorder implements TraceRecorder {
  private ready = false;

  constructor(private readonly filePath: string) {}

  async record(span: TraceEvent): Promise<void> {
    if (!this.ready) {
      await mkdir(dirname(this.filePath), { recursive: true });
      this.ready = true;
    }
    const handle = await open(this.filePath, "a");
    try {
      await handle.appendFile(`${JSON.stringify(span)}\n`, "utf8");
    } finally {
      await handle.close();
    }
  }
}
