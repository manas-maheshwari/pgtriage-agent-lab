import { randomUUID } from "node:crypto";

import {
  WorkflowRecordSchema,
  canTransition,
  type AuditRequest,
  type WorkflowRecord,
  type WorkflowState,
} from "../../domain/index.js";
import type {
  CreateWorkflowResult,
  WorkflowPatch,
  WorkflowStore,
} from "../../ports/workflow-store.js";
import { AgentRuntimeError } from "../../runtime/errors.js";

interface Lease {
  ownerId: string;
  expiresAt: number;
}

export class MemoryWorkflowStore implements WorkflowStore {
  private readonly workflows = new Map<string, WorkflowRecord>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly leases = new Map<string, Lease>();

  async createOrGet(request: AuditRequest): Promise<CreateWorkflowResult> {
    const existingId = this.idempotencyIndex.get(request.idempotencyKey);
    if (existingId) {
      const existing = this.workflows.get(existingId);
      if (!existing) {
        throw new AgentRuntimeError(
          "STORE_CORRUPTION",
          "The idempotency index points to a missing workflow.",
          false,
        );
      }
      return { workflow: structuredClone(existing), created: false };
    }

    const now = new Date().toISOString();
    const workflow = WorkflowRecordSchema.parse({
      workflowId: randomUUID(),
      idempotencyKey: request.idempotencyKey,
      request,
      state: "RECEIVED",
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      transitions: [],
    });

    this.workflows.set(workflow.workflowId, workflow);
    this.idempotencyIndex.set(workflow.idempotencyKey, workflow.workflowId);
    return { workflow: structuredClone(workflow), created: true };
  }

  async get(workflowId: string): Promise<WorkflowRecord | undefined> {
    const workflow = this.workflows.get(workflowId);
    return workflow ? structuredClone(workflow) : undefined;
  }

  async transition(
    workflowId: string,
    expectedFrom: WorkflowState,
    to: WorkflowState,
    reason: string,
    patch: WorkflowPatch = {},
  ): Promise<WorkflowRecord> {
    const current = this.workflows.get(workflowId);
    if (!current) {
      throw new AgentRuntimeError(
        "WORKFLOW_NOT_FOUND",
        `Workflow '${workflowId}' was not found.`,
        false,
      );
    }
    if (current.state !== expectedFrom) {
      throw new AgentRuntimeError(
        "STATE_CONFLICT",
        `Expected '${expectedFrom}' but workflow is '${current.state}'.`,
        false,
      );
    }
    if (!canTransition(expectedFrom, to)) {
      throw new AgentRuntimeError(
        "ILLEGAL_TRANSITION",
        `Transition '${expectedFrom}' -> '${to}' is not allowed.`,
        false,
      );
    }

    const now = new Date().toISOString();
    const { error, ...rest } = patch;
    const candidate: Record<string, unknown> = {
      ...current,
      ...rest,
      state: to,
      updatedAt: now,
      transitions: [
        ...current.transitions,
        { from: expectedFrom, to, at: now, reason },
      ],
    };
    if (error === null) {
      delete candidate.error;
    } else if (error !== undefined) {
      candidate.error = error;
    }

    const next = WorkflowRecordSchema.parse(candidate);
    this.workflows.set(workflowId, next);
    return structuredClone(next);
  }

  async acquireLease(
    workflowId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    if (!this.workflows.has(workflowId)) {
      return false;
    }
    const now = Date.now();
    const lease = this.leases.get(workflowId);
    if (lease && lease.ownerId !== ownerId && lease.expiresAt > now) {
      return false;
    }
    this.leases.set(workflowId, { ownerId, expiresAt: now + ttlMs });
    return true;
  }

  async releaseLease(workflowId: string, ownerId: string): Promise<void> {
    const lease = this.leases.get(workflowId);
    if (lease?.ownerId === ownerId) {
      this.leases.delete(workflowId);
    }
  }

  async close(): Promise<void> {
    this.workflows.clear();
    this.idempotencyIndex.clear();
    this.leases.clear();
  }
}
