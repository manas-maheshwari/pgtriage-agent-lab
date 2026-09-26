import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { TextCorpusRetriever } from "./text-corpus-retriever.js";

export class MarkdownCorpusRetriever extends TextCorpusRetriever {
  constructor(corpusDir: string) {
    super(async () => {
      const files = (await readdir(corpusDir)).filter((file) => file.endsWith(".md"));
      return Object.fromEntries(await Promise.all(files.map(async (file) =>
        [file, await readFile(join(corpusDir, file), "utf8")] as const)));
    });
  }
}
