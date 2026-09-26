import missing from "../corpus/missing-indexes.md";
import scans from "../corpus/sequential-scans.md";
import bloat from "../corpus/bloat.md";
import connections from "../corpus/connection-pressure.md";
import { TextCorpusRetriever } from "../src/adapters/retrieval/text-corpus-retriever.js";

export function bundledRetriever() {
  return new TextCorpusRetriever(async () => ({
    "missing-indexes.md": missing,
    "sequential-scans.md": scans,
    "bloat.md": bloat,
    "connection-pressure.md": connections,
  }));
}
