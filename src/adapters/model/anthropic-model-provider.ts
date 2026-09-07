import Anthropic from "@anthropic-ai/sdk";

import {
  RemediationPlanSchema,
  ToolPlanSchema,
  type AuditEvidence,
  type AuditRequest,
  type RemediationPlan,
  type ToolPlan,
} from "../../domain/index.js";
import type { RetrievedChunk } from "../../domain/retrieval.js";
import type { ModelProvider, ModelResult, ModelUsage } from "../../ports/model-provider.js";
import { AgentRuntimeError } from "../../runtime/errors.js";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface AnthropicModelConfig {
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

export class AnthropicModelProvider implements ModelProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(config: AnthropicModelConfig = {}) {
    this.client = new Anthropic({ apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY });
    this.model = config.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
    this.maxTokens = config.maxTokens ?? 1200;
  }

  async proposePlan(request: AuditRequest): Promise<ModelResult<ToolPlan>> {
    const schemaProperties: Record<string, unknown> = {
      slowQueryLimit: { type: "integer", minimum: 1, maximum: 50 },
    };
    const requiredArguments = ["slowQueryLimit"];
    if (request.schemaName !== undefined) {
      schemaProperties.schemaName = {
        type: "string",
        const: request.schemaName,
        description: "Caller-authorized schema scope. It must not be changed.",
      };
      requiredArguments.push("schemaName");
    }

    const message = await this.callMessages({
      system:
        "You are a planning service for a database audit agent. Select exactly one read-only MCP tool. Do not request execution of database changes. Schema scope is authorization-sensitive caller context: copy it exactly when provided and never infer one from free text.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            prompt: request.prompt,
            environment: request.environment,
            authorizedSchemaName: request.schemaName ?? null,
            availableTools: ["full_audit"],
          }),
        },
      ],
      tools: [
        {
          name: "select_pgtriage_tool",
          description: "Select the pgtriage MCP tool and bounded arguments.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["tool", "arguments", "reason"],
            properties: {
              tool: { type: "string", enum: ["full_audit"] },
              arguments: {
                type: "object",
                additionalProperties: false,
                required: requiredArguments,
                properties: schemaProperties,
              },
              reason: { type: "string", minLength: 1, maxLength: 500 },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "select_pgtriage_tool" },
    });

    return {
      value: ToolPlanSchema.parse(extractToolInput(message.content, "select_pgtriage_tool")),
      model: message.model,
      requestId: message.id,
      usage: usageFromMessage(message),
    };
  }

  async synthesize(
    request: AuditRequest,
    evidence: AuditEvidence,
    retrievedChunks: readonly RetrievedChunk[],
  ): Promise<ModelResult<RemediationPlan>> {
    const message = await this.callMessages({
      system:
        "You write advisory-only database remediation plans. Never claim that a change was executed. Every finding must require human review.",
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            request: request.prompt,
            auditEvidence: evidence,
            retrievedChunks,
            constraints: [
              "Return only advisory recommendations.",
              "Include citations only from retrievedChunks.",
              "Do not say the agent applied, ran, created, dropped, or updated anything.",
            ],
          }),
        },
      ],
      tools: [
        {
          name: "submit_remediation_plan",
          description: "Submit the final advisory remediation plan.",
          input_schema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "findings"],
            properties: {
              summary: { type: "string", minLength: 1 },
              findings: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "severity",
                    "category",
                    "evidence",
                    "recommendation",
                    "citations",
                    "confidence",
                    "requiresHumanReview",
                    "validationPlan",
                    "rollbackPlan",
                  ],
                  properties: {
                    severity: {
                      type: "string",
                      enum: ["critical", "high", "medium", "low", "info"],
                    },
                    category: { type: "string", minLength: 1 },
                    evidence: { type: "object" },
                    recommendation: { type: "string", minLength: 1 },
                    citations: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["document", "section", "url"],
                        properties: {
                          document: { type: "string", minLength: 1 },
                          section: { type: "string", minLength: 1 },
                          url: { type: "string", format: "uri" },
                        },
                      },
                    },
                    confidence: { type: "number", minimum: 0, maximum: 1 },
                    requiresHumanReview: { type: "boolean" },
                    validationPlan: { type: "string", minLength: 1 },
                    rollbackPlan: { type: "string", minLength: 1 },
                  },
                },
              },
            },
          },
        },
      ],
      tool_choice: { type: "tool", name: "submit_remediation_plan" },
    });

    return {
      value: RemediationPlanSchema.parse(
        extractToolInput(message.content, "submit_remediation_plan"),
      ),
      model: message.model,
      requestId: message.id,
      usage: usageFromMessage(message),
    };
  }

  private async callMessages(params: Record<string, unknown>) {
    try {
      return await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        ...params,
      } as never);
    } catch (error) {
      const retryable =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (Number((error as { status?: unknown }).status) === 429 ||
          Number((error as { status?: unknown }).status) >= 500);
      throw new AgentRuntimeError(
        "MODEL_PROVIDER_ERROR",
        error instanceof Error ? error.message : "Anthropic model request failed.",
        retryable,
      );
    }
  }
}

function extractToolInput(content: unknown, name: string): unknown {
  const blocks = Array.isArray(content) ? content : [];
  const toolUse = blocks.find(
    (block): block is ToolUseBlock =>
      typeof block === "object" &&
      block !== null &&
      (block as { type?: unknown }).type === "tool_use" &&
      (block as { name?: unknown }).name === name,
  );
  if (!toolUse) {
    throw new AgentRuntimeError(
      "MODEL_TOOL_OUTPUT_MISSING",
      `Model response did not include required tool '${name}'.`,
      true,
    );
  }
  return toolUse.input;
}

function usageFromMessage(message: {
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number | null;
  };
}): ModelUsage {
  const inputTokens = message.usage?.input_tokens ?? 0;
  const outputTokens = message.usage?.output_tokens ?? 0;
  const cacheReadTokens = message.usage?.cache_read_input_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    estimatedCostUsd: 0,
  };
}
