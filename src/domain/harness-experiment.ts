import { z } from "zod";

export const HarnessConfigurationSchema = z
  .object({
    version: z.literal("1"),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    surface: z.literal("retrieval_limit"),
    retrievalLimit: z.number().int().min(1).max(5),
    description: z.string().min(1),
  })
  .strict();

export const ActiveHarnessConfigurationSchema = z
  .object({
    version: z.literal("1"),
    activeConfigId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    adoptedAt: z.iso.datetime(),
    approvedBy: z.string().min(1),
    evidence: z.string().min(1),
  })
  .strict();

export type HarnessConfiguration = z.infer<typeof HarnessConfigurationSchema>;
export type ActiveHarnessConfiguration = z.infer<
  typeof ActiveHarnessConfigurationSchema
>;
