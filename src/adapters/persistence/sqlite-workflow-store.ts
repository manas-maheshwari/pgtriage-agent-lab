import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

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

interface WorkflowRow {
  workflow_id: string;
  idempotency_key: string;
  payload: string;
  state: WorkflowState;
  lease_owner: string | null;
  lease_expires_at: number | null;
}

export class SqliteWorkflowStore implements WorkflowStore {
  private readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        workflow_id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        payload TEXT NOT NULL,
        state TEXT NOT NULL,
        lease_owner TEXT,
        lease_expires_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_workflows_state ON workflows(state);
    `);
  }

  async createOrGet(request: AuditRequest): Promise<CreateWorkflowResult> {
    const existing = this.getByIdempotencyKey(request.idempotencyKey);
    if (existing) {
      return { workflow: existing, created: false };
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

    try {
      this.db
        .prepare(
          `INSERT INTO workflows (workflow_id, idempotency_key, payload, state)
           VALUES (?, ?, ?, ?)`,
        )
        .run(
          workflow.workflowId,
          workflow.idempotencyKey,
          JSON.stringify(workflow),
          workflow.state,
        );
      return { workflow, created: true };
    } catch (error) {
      const raced = this.getByIdempotencyKey(request.idempotencyKey);
      if (raced) return { workflow: raced, created: false };
      throw error;
    }
  }

  async get(workflowId: string): Promise<WorkflowRecord | undefined> {
    const row = this.db
      .prepare("SELECT * FROM workflows WHERE workflow_id = ?")
      .get(workflowId) as WorkflowRow | undefined;
    return row ? this.parseRow(row) : undefined;
  }

  async transition(
    workflowId: string,
    expectedFrom: WorkflowState,
    to: WorkflowState,
    reason: string,
    patch: WorkflowPatch = {},
  ): Promise<WorkflowRecord> {
    const current = await this.get(workflowId);
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
    const result = this.db
      .prepare(
        `UPDATE workflows
         SET payload = ?, state = ?
         WHERE workflow_id = ? AND state = ?`,
      )
      .run(JSON.stringify(next), next.state, workflowId, expectedFrom);
    if (result.changes !== 1) {
      throw new AgentRuntimeError(
        "STATE_CONFLICT",
        "The workflow state changed before the transition could be written.",
        true,
      );
    }
    return next;
  }

  async acquireLease(
    workflowId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const result = this.db
      .prepare(
        `UPDATE workflows
         SET lease_owner = ?, lease_expires_at = ?
         WHERE workflow_id = ?
           AND (lease_owner IS NULL OR lease_owner = ? OR lease_expires_at <= ?)`,
      )
      .run(ownerId, now + ttlMs, workflowId, ownerId, now);
    return result.changes === 1;
  }

  async releaseLease(workflowId: string, ownerId: string): Promise<void> {
    this.db
      .prepare(
        `UPDATE workflows
         SET lease_owner = NULL, lease_expires_at = NULL
         WHERE workflow_id = ? AND lease_owner = ?`,
      )
      .run(workflowId, ownerId);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  private getByIdempotencyKey(idempotencyKey: string): WorkflowRecord | undefined {
    const row = this.db
      .prepare("SELECT * FROM workflows WHERE idempotency_key = ?")
      .get(idempotencyKey) as WorkflowRow | undefined;
    return row ? this.parseRow(row) : undefined;
  }

  private parseRow(row: WorkflowRow): WorkflowRecord {
    return WorkflowRecordSchema.parse(JSON.parse(row.payload) as unknown);
  }
}
