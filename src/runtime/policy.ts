import type {
  AuditRequest,
  RemediationPlan,
  ToolPlan,
} from "../domain/index.js";
import type { ToolDescriptor } from "../ports/tool-client.js";
import { AgentRuntimeError } from "./errors.js";

const EXECUTION_REQUEST =
  /\b(execute|apply|run)\b.{0,30}\b(change|changes|ddl|fix|remediation|drop|delete|update|alter|create)\b/i;
const CLAIMS_EXECUTION =
  /\b(i|we|the agent|the system)\s+(executed|applied|ran|dropped|deleted|updated|altered|created)\b/i;
const HIGH_RISK_SQL =
  /\b(drop\s+(index|table)|vacuum\s+full|alter\s+system|truncate|delete\s+from|update\s+\S+\s+set)\b/i;

export class PolicyEngine {
  validateRequest(request: AuditRequest): void {
    if (request.executeChanges || EXECUTION_REQUEST.test(request.prompt)) {
      throw new AgentRuntimeError(
        "EXECUTION_NOT_ALLOWED",
        "This POC can audit and recommend changes but cannot execute them.",
        false,
      );
    }

    if (
      request.environment === "approved_database" &&
      !request.caller.roles.includes("approved_database_auditor")
    ) {
      throw new AgentRuntimeError(
        "ENVIRONMENT_NOT_AUTHORIZED",
        "The caller is not authorized to audit an approved database.",
        false,
      );
    }
  }

  validatePlanScope(request: AuditRequest, plan: ToolPlan): void {
    if (plan.arguments.schemaName !== request.schemaName) {
      throw new AgentRuntimeError(
        "SCHEMA_SCOPE_MISMATCH",
        "The model-generated plan changed the caller-authorized schema scope.",
        false,
      );
    }
  }

  authorizeTool(plan: ToolPlan, tools: readonly ToolDescriptor[]): ToolDescriptor {
    const tool = tools.find((candidate) => candidate.name === plan.tool);
    if (!tool) {
      throw new AgentRuntimeError(
        "TOOL_NOT_ALLOWED",
        `Tool '${plan.tool}' is not present in the allowlisted registry.`,
        false,
      );
    }

    if (tool.readOnlyHint !== true) {
      throw new AgentRuntimeError(
        "WRITE_TOOL_NOT_ALLOWED",
        `Tool '${plan.tool}' is missing readOnlyHint: true.`,
        false,
      );
    }

    if (tool.destructiveHint === true) {
      throw new AgentRuntimeError(
        "DESTRUCTIVE_TOOL_NOT_ALLOWED",
        `Tool '${plan.tool}' is marked destructive.`,
        false,
      );
    }

    return tool;
  }

  validateOutput(plan: RemediationPlan): void {
    for (const finding of plan.findings) {
      if (CLAIMS_EXECUTION.test(finding.recommendation)) {
        throw new AgentRuntimeError(
          "OUTPUT_CLAIMS_EXECUTION",
          "The generated plan claims that a change was executed.",
          false,
        );
      }

      const combined = `${finding.recommendation}\n${finding.rollbackPlan}`;
      if (HIGH_RISK_SQL.test(combined) && !finding.requiresHumanReview) {
        throw new AgentRuntimeError(
          "HUMAN_REVIEW_REQUIRED",
          "A high-risk recommendation was not marked for human review.",
          false,
        );
      }

      if (!finding.requiresHumanReview) {
        throw new AgentRuntimeError(
          "ADVISORY_REVIEW_REQUIRED",
          "All MVP recommendations must require human review.",
          false,
        );
      }

      if (
        finding.citations.length === 0 &&
        !/insufficient evidence/i.test(`${finding.recommendation}\n${finding.validationPlan}`)
      ) {
        throw new AgentRuntimeError(
          "UNGROUNDED_RECOMMENDATION",
          "Uncited findings must be presented as insufficient evidence.",
          false,
        );
      }
    }
  }
}
