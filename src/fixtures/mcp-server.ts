import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

import { FIXTURE_EVIDENCE } from "../adapters/tools/fixture-tool-client.js";

serveStdio(() => {
  const server = new McpServer({ name: "pgtriage-fixture", version: "0.3.0" });
  const auditRuns = new Map<string, Record<string, unknown>>();
  server.registerTool(
    "full_audit",
    {
      description: "Run a deterministic, read-only PostgreSQL audit fixture.",
      inputSchema: z.object({
        slow_query_limit: z.number().int().min(1).max(50).default(10),
        schema_name: z.string().optional(),
        audit_run_id: z.string().uuid().optional(),
      }),
      outputSchema: z.object({}).passthrough(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false },
    },
    async ({ schema_name, audit_run_id }) => {
      const runId = audit_run_id ?? randomUUID();
      const existing = auditRuns.get(runId);
      if (existing) {
        const existingResult = existing.result as Record<string, unknown>;
        return {
          content: [{ type: "text", text: JSON.stringify(existingResult) }],
          structuredContent: existingResult,
        };
      }
      const evidence = {
        ...FIXTURE_EVIDENCE,
        fixture_request_scope: { schema_name: schema_name ?? null },
        provenance: {
          audit_run_id: runId,
          status: "COMPLETED",
          detector_contract_version: "fixture-1",
        },
      };
      auditRuns.set(runId, {
        audit_run_id: runId,
        status: "COMPLETED",
        provenance: evidence.provenance,
        result: evidence,
        failure: null,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(evidence) }],
        structuredContent: evidence,
      };
    },
  );
  server.registerTool(
    "get_audit_run",
    {
      description: "Retrieve a previously dispatched audit fixture.",
      inputSchema: z.object({ audit_run_id: z.string().uuid() }),
      outputSchema: z.object({}).passthrough(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ audit_run_id }) => {
      const lookup = auditRuns.get(audit_run_id) ?? {
        audit_run_id,
        status: "NOT_FOUND",
        provenance: null,
        result: null,
        failure: null,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(lookup) }],
        structuredContent: lookup,
      };
    },
  );
  return server;
});
