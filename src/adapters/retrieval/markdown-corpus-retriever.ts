import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import type { PgTriageFinding } from "../../domain/index.js";
import { RetrievedChunkSchema, type RetrievedChunk } from "../../domain/retrieval.js";
import type { Retriever } from "../../ports/retriever.js";
import { stableHash } from "../../util/hash.js";

interface CorpusDocument {
  title: string;
  url: string;
  text: string;
  fileName: string;
}

interface IndexedChunk {
  chunk: RetrievedChunk;
  tokens: Map<string, number>;
  vector: number[];
}

const VECTOR_SIZE = 64;
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "with",
]);

export class MarkdownCorpusRetriever implements Retriever {
  private index?: Promise<readonly IndexedChunk[]>;

  constructor(private readonly corpusDir: string) {}

  async retrieve(
    finding: PgTriageFinding,
    limit: number,
  ): Promise<readonly RetrievedChunk[]> {
    const indexed = await this.loadIndex();
    const queryText = [
      finding.category,
      finding.detail,
      finding.table,
      finding.index,
      finding.query,
      finding.suggested_fix,
      JSON.stringify(finding.evidence),
    ]
      .filter(Boolean)
      .join(" ");
    const queryTokens = tokenize(queryText);
    const queryVector = vectorize(queryTokens);

    return indexed
      .map((entry) => ({
        ...entry.chunk,
        score:
          lexicalScore(queryTokens, entry.tokens) * 0.7 +
          cosine(queryVector, entry.vector) * 0.3,
      }))
      .filter((chunk) => chunk.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((chunk) => RetrievedChunkSchema.parse(chunk));
  }

  private async loadIndex(): Promise<readonly IndexedChunk[]> {
    this.index ??= buildIndex(this.corpusDir);
    return this.index;
  }
}

async function buildIndex(corpusDir: string): Promise<readonly IndexedChunk[]> {
  const files = (await readdir(corpusDir)).filter((file) => file.endsWith(".md")).sort();
  const documents = await Promise.all(
    files.map(async (file) => parseDocument(file, await readFile(join(corpusDir, file), "utf8"))),
  );

  return documents.flatMap((document) =>
    chunkDocument(document).map((chunk) => {
      const tokens = tokenize(chunk.text);
      return { chunk, tokens, vector: vectorize(tokens) };
    }),
  );
}

function parseDocument(fileName: string, raw: string): CorpusDocument {
  const frontMatter = raw.match(/^---\n(?<body>[\s\S]*?)\n---\n(?<text>[\s\S]*)$/);
  if (!frontMatter?.groups) {
    throw new Error(`Corpus document '${fileName}' is missing front matter.`);
  }
  const body = frontMatter.groups.body;
  const text = frontMatter.groups.text;
  if (!body || !text) {
    throw new Error(`Corpus document '${fileName}' has incomplete front matter.`);
  }
  const metadata = Object.fromEntries(
    body
      .split("\n")
      .map((line) => {
        const separator = line.indexOf(":");
        if (separator === -1) return ["", ""];
        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      })
      .filter(([key, value]) => key && value),
  );
  const title = metadata.title;
  const url = metadata.url;
  if (!title || !url) {
    throw new Error(`Corpus document '${fileName}' must include title and url.`);
  }
  return { title, url, text: text.trim(), fileName };
}

function chunkDocument(document: CorpusDocument): readonly RetrievedChunk[] {
  const paragraphs = document.text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const section = paragraphs[0]?.replace(/^#\s+/, "") ?? document.title;
  return paragraphs.slice(1).map((paragraph, index) =>
    RetrievedChunkSchema.parse({
      chunkId: stableHash({ file: document.fileName, index }),
      document: basename(document.fileName, ".md"),
      section,
      url: document.url,
      text: paragraph,
      score: 0,
    }),
  );
}

function tokenize(text: string): Map<string, number> {
  const tokens = new Map<string, number>();
  for (const token of text.toLowerCase().match(/[a-z0-9_]+/g) ?? []) {
    if (token.length < 2 || STOP_WORDS.has(token)) continue;
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  return tokens;
}

function lexicalScore(query: Map<string, number>, candidate: Map<string, number>): number {
  let overlap = 0;
  let total = 0;
  for (const [token, count] of query) {
    total += count;
    overlap += Math.min(count, candidate.get(token) ?? 0);
  }
  return total === 0 ? 0 : overlap / total;
}

function vectorize(tokens: Map<string, number>): number[] {
  const vector = Array.from({ length: VECTOR_SIZE }, () => 0);
  for (const [token, count] of tokens) {
    const slot = parseInt(stableHash(token).slice(0, 8), 16) % VECTOR_SIZE;
    vector[slot] = (vector[slot] ?? 0) + count;
  }
  return vector;
}

function cosine(left: readonly number[], right: readonly number[]): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < VECTOR_SIZE; i += 1) {
    dot += (left[i] ?? 0) * (right[i] ?? 0);
    leftNorm += (left[i] ?? 0) ** 2;
    rightNorm += (right[i] ?? 0) ** 2;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
