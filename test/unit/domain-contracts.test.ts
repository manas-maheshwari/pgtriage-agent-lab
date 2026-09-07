import { describe, expect, it } from "vitest";

import {
  AuditRequestSchema,
  RemediationPlanSchema,
  ToolPlanSchema,
  WorkflowRecordSchema,
  canTransition,
} from "../../src/domain/index.js";

const validRequest = {
  prompt: "Audit this database and produce an advisory remediation plan.",
  idempotencyKey: "request-12345678",
  environment: "fixture",
  caller: {
    tenantId: "tenant-1",
    userId: "user-1",
    roles: ["database_auditor"],
  },
};

describe("AuditRequestSchema", () => {
  it("defaults execution to false", () => {
    const request = AuditRequestSchema.parse(validRequest);

    expect(request.executeChanges).toBe(false);
  });

  it("rejects a request that enables change execution", () => {
    const result = AuditRequestSchema.safeParse({
      ...validRequest,
      executeChanges: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown fields instead of silently dropping them", () => {
    const result = AuditRequestSchema.safeParse({
      ...validRequest,
      databasePassword: "do-not-accept-this",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a caller-provided user schema scope", () => {
    const request = AuditRequestSchema.parse({
      ...validRequest,
      schemaName: "pgtriage_demo",
    });

    expect(request.schemaName).toBe("pgtriage_demo");
  });

  it.each(["", "   ", "pg_catalog", "pg_toast", "information_schema"])(
    "rejects invalid or protected schema scope %j before tool execution",
    (schemaName) => {
      expect(
        AuditRequestSchema.safeParse({ ...validRequest, schemaName }).success,
      ).toBe(false);
    },
  );
});

describe("ToolPlanSchema", () => {
  it("accepts the one tool in the first vertical slice", () => {
    const result = ToolPlanSchema.safeParse({
      tool: "full_audit",
      arguments: { schemaName: "pgtriage_demo" },
      reason: "Collect evidence before making recommendations.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.arguments.schemaName).toBe("pgtriage_demo");
    }
  });

  it("rejects a generic SQL execution tool", () => {
    const result = ToolPlanSchema.safeParse({
      tool: "run_sql",
      arguments: { sql: "DROP TABLE accounts" },
      reason: "Execute the requested change.",
    });

    expect(result.success).toBe(false);
  });
});

describe("RemediationPlanSchema", () => {
  it("accepts a structured advisory finding", () => {
    const result = RemediationPlanSchema.safeParse({
      summary: "One query requires investigation.",
      findings: [
        {
          severity: "high",
          category: "missing_index",
          evidence: { queryId: "query-1", meanExecutionMs: 1500 },
          recommendation: "Review a composite index in a maintenance window.",
          citations: [],
          confidence: 0.9,
          requiresHumanReview: true,
          validationPlan: "Compare EXPLAIN plans on a production-like fixture.",
          rollbackPlan: "Drop the candidate index concurrently if regressions appear.",
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects confidence outside the zero-to-one range", () => {
    const result = RemediationPlanSchema.safeParse({
      summary: "Invalid confidence.",
      findings: [
        {
          severity: "high",
          category: "missing_index",
          evidence: {},
          recommendation: "Review the index.",
          citations: [],
          confidence: 1.1,
          requiresHumanReview: true,
          validationPlan: "Test it.",
          rollbackPlan: "Remove it.",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("workflow contracts", () => {
  it("accepts a well-formed workflow record", () => {
    const result = WorkflowRecordSchema.safeParse({
      workflowId: "7aa6f0b7-b618-4d4f-a1b1-0249d5a61a20",
      idempotencyKey: "request-12345678",
      request: validRequest,
      state: "RECEIVED",
      attempt: 0,
      createdAt: "2026-08-27T12:00:00.000Z",
      updatedAt: "2026-08-27T12:00:00.000Z",
      transitions: [],
    });

    expect(result.success).toBe(true);
  });

  it("allows only explicit transitions", () => {
    expect(canTransition("RECEIVED", "PLANNING")).toBe(true);
    expect(canTransition("RECEIVED", "COMPLETED")).toBe(false);
    expect(canTransition("COMPLETED", "PLANNING")).toBe(false);
  });
});
