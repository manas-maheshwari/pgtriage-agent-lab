import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { FIXTURE_EVIDENCE } from "../adapters/tools/fixture-tool-client.js";

serveStdio(() => {
  const server = new McpServer({ name: "pgtriage-fixture", version: "0.1.0" });
  server.registerTool(
    "full_audit",
    {
      description: "Run a deterministic, read-only PostgreSQL audit fixture.",
      inputSchema: z.object({
        slow_query_limit: z.number().int().min(1).max(50).default(10),
        schema_name: z.string().optional(),
      }),
      outputSchema: z.object({}).passthrough(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    },
    async ({ schema_name }) => {
      const evidence = {
        ...FIXTURE_EVIDENCE,
        fixture_request_scope: { schema_name: schema_name ?? null },
      };
      return {
        content: [{ type: "text", text: JSON.stringify(evidence) }],
        structuredContent: evidence,
      };
    },
  );
  return server;
});
