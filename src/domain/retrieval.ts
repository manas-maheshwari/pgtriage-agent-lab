import { z } from "zod";

export const RetrievedChunkSchema = z
  .object({
    chunkId: z.string().min(1),
    document: z.string().min(1),
    section: z.string().min(1),
    url: z.url(),
    text: z.string().min(1),
    score: z.number().min(0),
  })
  .strict();

export type RetrievedChunk = z.infer<typeof RetrievedChunkSchema>;
