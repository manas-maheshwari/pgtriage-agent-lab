import { describe, expect, it } from "vitest";

import { SqliteWorkflowStore } from "../../src/adapters/persistence/sqlite-workflow-store.js";
import type { AuditRequest } from "../../src/domain/index.js";

const request: AuditRequest = {
  prompt: "Audit the approved database for slow queries.",
  environment: "approved_database",
  executeChanges: false,
  idempotencyKey: "sqlite-test-key",
  caller: {
    userId: "user-1",
    tenantId: "tenant-1",
    roles: ["approved_database_auditor"],
  },
};

describe("SqliteWorkflowStore", () => {
  it("persists workflows and deduplicates by idempotency key", async () => {
    const store = new SqliteWorkflowStore();
    try {
      const first = await store.createOrGet(request);
      const second = await store.createOrGet(request);

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.workflow.workflowId).toBe(first.workflow.workflowId);
    } finally {
      await store.close();
    }
  });

  it("enforces state transitions and exclusive leases", async () => {
    const store = new SqliteWorkflowStore();
    try {
      const { workflow } = await store.createOrGet({
        ...request,
        idempotencyKey: "sqlite-lease-key",
      });

      expect(await store.acquireLease(workflow.workflowId, "worker-a", 60_000)).toBe(true);
      expect(await store.acquireLease(workflow.workflowId, "worker-b", 60_000)).toBe(false);

      const planned = await store.transition(
        workflow.workflowId,
        "RECEIVED",
        "PLANNING",
        "accepted",
      );
      expect(planned.state).toBe("PLANNING");

      await expect(
        store.transition(workflow.workflowId, "RECEIVED", "PLANNING", "stale"),
      ).rejects.toThrow("Expected 'RECEIVED' but workflow is 'PLANNING'");

      await store.releaseLease(workflow.workflowId, "worker-a");
      expect(await store.acquireLease(workflow.workflowId, "worker-b", 60_000)).toBe(true);
    } finally {
      await store.close();
    }
  });
});
