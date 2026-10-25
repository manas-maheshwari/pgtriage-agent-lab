import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { McpToolClient } from "../../src/adapters/tools/mcp-tool-client.js";

const clients: McpToolClient[] = [];
afterEach(async () => Promise.all(clients.splice(0).map((client) => client.close())));

describe("McpToolClient", () => {
  it("discovers and invokes the fixture through real MCP stdio", async () => {
    const script = fileURLToPath(new URL("../../src/fixtures/mcp-server.ts", import.meta.url));
    const client = new McpToolClient({ command: process.execPath, args: ["--import", "tsx", script] });
    clients.push(client);

    const tools = await client.listTools();
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "full_audit",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
        }),
      ]),
    );
    const auditRunId = randomUUID();
    const result = await client.callTool(
      {
        tool: "full_audit",
        arguments: { slowQueryLimit: 10, schemaName: "pgtriage_demo" },
        reason: "test",
      },
      { workflowId: auditRunId, timeoutMs: 5_000 },
    );
    expect(result.summary.total_findings).toBe(1);
    expect(
      (result as unknown as { fixture_request_scope: { schema_name: string } })
        .fixture_request_scope.schema_name,
    ).toBe("pgtriage_demo");
    const recovered = await client.getAuditRun(auditRunId, 5_000);
    expect(recovered.status).toBe("COMPLETED");
    expect(recovered.result?.summary.total_findings).toBe(1);
  });
});
