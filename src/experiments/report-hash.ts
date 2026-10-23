import { stableHash } from "../util/hash.js";

const VOLATILE_KEYS = new Set([
  "generatedAt",
  "reportHash",
  "latencyMs",
  "averageLatencyMs",
  "p95LatencyMs",
  "latencyDeltaMs",
]);

export function hashExperimentReport(report: unknown): string {
  return stableHash(stripVolatileFields(report));
}

function stripVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatileFields);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !VOLATILE_KEYS.has(key))
      .map(([key, nested]) => [key, stripVolatileFields(nested)]),
  );
}
