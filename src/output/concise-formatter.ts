import type { WorkflowRecord } from "../domain/index.js";
import { toMcpArguments } from "../adapters/tools/mcp-tool-client.js";

export function formatConciseWorkflow(workflow: WorkflowRecord): string {
  const transitions = [
    "RECEIVED",
    ...workflow.transitions.map((transition) => transition.to),
  ].join(" -> ");
  const authorization = workflow.authorizedTool
    ? [
        "ALLOWED",
        workflow.authorizedTool.name,
        `readOnlyHint=${workflow.authorizedTool.readOnlyHint}`,
        `destructiveHint=${workflow.authorizedTool.destructiveHint ?? "unspecified"}`,
        `idempotentHint=${workflow.authorizedTool.idempotentHint ?? "unspecified"}`,
      ].join(" | ")
    : workflow.error
      ? `NOT ALLOWED OR NOT REACHED | ${workflow.error.code}`
      : "NOT REACHED";
  const invocation = workflow.plan
    ? `${workflow.plan.tool}(${JSON.stringify(toMcpArguments(workflow.plan))})`
    : "not invoked";
  const scopePolicy = workflow.plan
    ? workflow.plan.arguments.schemaName === workflow.request.schemaName
      ? "PASSED | plan matches caller-authorized scope"
      : "FAILED | plan changed caller-authorized scope"
    : workflow.error?.code === "SCHEMA_SCOPE_MISMATCH"
      ? "FAILED | model attempted to change caller-authorized scope"
      : "NOT REACHED";
  const citations = uniqueCitations(workflow);
  const policyResult = workflow.transitions.some(
    (transition) => transition.to === "POLICY_CHECKED",
  )
    ? "PASSED | advisory-only output requires human review"
    : workflow.error
      ? `NOT PASSED OR NOT REACHED | ${workflow.error.code}`
      : "NOT REACHED";
  const recommendations = workflow.result?.findings.length
    ? workflow.result.findings
        .map(
          (finding, index) =>
            `${index + 1}. [${finding.severity.toUpperCase()}] ${finding.category}: ${truncate(finding.recommendation, 240)}`,
        )
        .join("\n")
    : "none";

  return [
    "pgtriage Agent Lab",
    `Final state: ${workflow.state}`,
    `State transitions: ${transitions}`,
    `Schema scope: ${workflow.request.schemaName ?? "all non-system schemas"}`,
    `Scope policy: ${scopePolicy}`,
    `Authorization: ${authorization}`,
    `MCP invocation: ${invocation}`,
    `Evidence: ${workflow.toolEvidence?.findings.length ?? 0} finding(s) | SHA-256 ${workflow.toolResultHash ?? "not available"}`,
    "Retrieved citations:",
    ...(citations.length > 0
      ? citations.map(
          (citation, index) =>
            `  ${index + 1}. ${citation.document} / ${citation.section} (${citation.url})`,
        )
      : ["  none"]),
    `Output policy: ${policyResult}`,
    "Final advisory recommendations:",
    recommendations,
    "",
  ].join("\n");
}

function uniqueCitations(workflow: WorkflowRecord) {
  const citations = new Map<string, { document: string; section: string; url: string }>();
  for (const finding of workflow.result?.findings ?? []) {
    for (const citation of finding.citations) {
      citations.set(
        `${citation.document}:${citation.section}:${citation.url}`,
        citation,
      );
    }
  }
  return [...citations.values()];
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
