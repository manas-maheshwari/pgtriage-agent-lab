import type { PgTriageFinding } from "../domain/index.js";
import type { RetrievedChunk } from "../domain/retrieval.js";

export interface Retriever {
  retrieve(
    finding: PgTriageFinding,
    limit: number,
  ): Promise<readonly RetrievedChunk[]>;
}

export class NoopRetriever implements Retriever {
  async retrieve(): Promise<readonly RetrievedChunk[]> {
    return [];
  }
}
