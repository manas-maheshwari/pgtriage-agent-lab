import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpToolClient } from "../adapters/tools/mcp-tool-client.js";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function fixtureMcpToolClient(): McpToolClient {
  return new McpToolClient({
    command: process.execPath,
    args: ["--import", "tsx", resolve(rootDir, "src/fixtures/mcp-server.ts")],
    cwd: rootDir,
    env: controlledRuntimeEnv(),
  });
}

export function realPgTriageToolClient(): McpToolClient {
  const connectionString = process.env.PGTRIAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("PGTRIAGE_CONNECTION_STRING is required for real pgtriage mode.");
  }
  return new McpToolClient({
    command: process.env.PGTRIAGE_COMMAND ?? "pgtriage",
    ...commandArgsConfig(process.env.PGTRIAGE_ARGS_JSON),
    ...(process.env.PGTRIAGE_CWD
      ? { cwd: process.env.PGTRIAGE_CWD }
      : {}),
    env: {
      PGTRIAGE_CONNECTION_STRING: connectionString,
      ...controlledRuntimeEnv(),
    },
  });
}

function commandArgsConfig(value: string | undefined): { args?: string[] } {
  if (value === undefined) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("PGTRIAGE_ARGS_JSON must be a JSON array of command arguments.", {
      cause: error,
    });
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length > 32 ||
    parsed.some((argument) => typeof argument !== "string" || argument.length > 4_096)
  ) {
    throw new Error(
      "PGTRIAGE_ARGS_JSON must contain at most 32 string arguments of at most 4096 characters each.",
    );
  }
  return { args: parsed };
}

function controlledRuntimeEnv(): Record<string, string> {
  return process.env.PATH ? { PATH: process.env.PATH } : {};
}
