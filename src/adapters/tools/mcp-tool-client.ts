import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import {
  AuditEvidenceSchema,
  AuditRunLookupSchema,
  type ToolPlan,
} from "../../domain/index.js";
import type { ToolCallContext, ToolClient, ToolDescriptor } from "../../ports/tool-client.js";
import {
  AgentRuntimeError,
  AmbiguousToolDispatchError,
  PreDispatchToolError,
} from "../../runtime/errors.js";

export interface McpStdioConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export class McpToolClient implements ToolClient {
  private client: Client | undefined;
  private connected = false;

  constructor(private readonly config: McpStdioConfig) {}

  private async connect(): Promise<Client> {
    if (this.connected && this.client) return this.client;

    const client = new Client({ name: "pgtriage-agent-lab", version: "0.4.0" });
    const transport = new StdioClientTransport({ ...this.config, stderr: "pipe" });
    try {
      await client.connect(transport);
      this.client = client;
      this.connected = true;
      return client;
    } catch (error) {
      await safelyClose(client);
      throw new PreDispatchToolError(
        "MCP_STARTUP_FAILED",
        error instanceof Error ? error.message : "The MCP server failed to start.",
        { cause: error },
      );
    }
  }

  async listTools(): Promise<readonly ToolDescriptor[]> {
    const client = await this.connect();
    try {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        inputSchema: tool.inputSchema,
        ...(tool.annotations?.readOnlyHint === undefined
          ? {}
          : { readOnlyHint: tool.annotations.readOnlyHint }),
        ...(tool.annotations?.destructiveHint === undefined
          ? {}
          : { destructiveHint: tool.annotations.destructiveHint }),
        ...(tool.annotations?.idempotentHint === undefined
          ? {}
          : { idempotentHint: tool.annotations.idempotentHint }),
      }));
    } catch (error) {
      await this.resetConnection();
      throw new PreDispatchToolError(
        "MCP_CAPABILITY_DISCOVERY_FAILED",
        error instanceof Error ? error.message : "MCP capability discovery failed.",
        { cause: error },
      );
    }
  }

  async callTool(plan: ToolPlan, context: ToolCallContext) {
    const client = await this.connect();
    if (plan.tool !== "full_audit") {
      throw new AgentRuntimeError("TOOL_NOT_ALLOWED", `Tool '${plan.tool}' is not allowed.`, false);
    }

    let result: Awaited<ReturnType<Client["callTool"]>>;
    try {
      result = await client.callTool(
        {
          name: plan.tool,
          arguments: toMcpArguments(plan, context.workflowId),
        },
        { timeout: context.timeoutMs },
      );
    } catch (error) {
      await this.resetConnection();
      throw new AmbiguousToolDispatchError(
        isTimeoutError(error)
          ? "TOOL_TIMEOUT"
          : "MCP_AMBIGUOUS_TRANSPORT_FAILURE",
        error instanceof Error
          ? error.message
          : "The MCP call failed after it may have been dispatched.",
        { cause: error },
      );
    }
    if (result.isError) {
      throw new AgentRuntimeError(
        "MCP_TOOL_ERROR",
        "The MCP server returned a tool error.",
        false,
      );
    }

    const payload = extractPayload(result);
    const parsed = AuditEvidenceSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AgentRuntimeError(
        "MCP_INVALID_RESULT",
        "The MCP result failed structural or summary-consistency validation.",
        false,
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  async getAuditRun(auditRunId: string, timeoutMs: number) {
    const client = await this.connect();
    let result: Awaited<ReturnType<Client["callTool"]>>;
    try {
      result = await client.callTool(
        {
          name: "get_audit_run",
          arguments: { audit_run_id: auditRunId },
        },
        { timeout: timeoutMs },
      );
    } catch (error) {
      await this.resetConnection();
      throw new PreDispatchToolError(
        "AUDIT_RECONCILIATION_UNAVAILABLE",
        error instanceof Error
          ? error.message
          : "The audit reconciliation lookup failed.",
        { cause: error },
      );
    }
    if (result.isError) {
      throw new AgentRuntimeError(
        "AUDIT_RECONCILIATION_TOOL_ERROR",
        "The MCP server could not reconcile the audit operation.",
        false,
      );
    }
    const parsed = AuditRunLookupSchema.safeParse(extractPayload(result));
    if (!parsed.success) {
      throw new AgentRuntimeError(
        "AUDIT_RECONCILIATION_INVALID",
        "The audit reconciliation response failed runtime validation.",
        false,
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  async close(): Promise<void> {
    await this.resetConnection();
  }

  private async resetConnection(): Promise<void> {
    if (this.client) await safelyClose(this.client);
    this.client = undefined;
    this.connected = false;
  }
}

export function toMcpArguments(
  plan: ToolPlan,
  auditRunId?: string,
): Record<string, unknown> {
  return {
    slow_query_limit: plan.arguments.slowQueryLimit,
    ...(auditRunId === undefined ? {} : { audit_run_id: auditRunId }),
    ...(plan.arguments.schemaName === undefined
      ? {}
      : { schema_name: plan.arguments.schemaName }),
  };
}

function extractPayload(
  result: Awaited<ReturnType<Client["callTool"]>>,
): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content.find((item) => item.type === "text");
  if (!text || text.type !== "text") {
    throw new AgentRuntimeError(
      "MCP_INVALID_RESULT",
      "The MCP result contained no structured JSON.",
      false,
    );
  }
  try {
    return JSON.parse(text.text) as unknown;
  } catch (error) {
    throw new AgentRuntimeError(
      "MCP_INVALID_RESULT",
      "The MCP result text was not valid JSON.",
      false,
      { cause: error },
    );
  }
}

async function safelyClose(client: Client): Promise<void> {
  try {
    await client.close();
  } catch {
    // Connection cleanup is best-effort and must not replace the original error.
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /timed?\s*out|timeout/i.test(`${error.name} ${error.message}`)
  );
}
