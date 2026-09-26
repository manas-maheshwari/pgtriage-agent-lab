import { WorkflowRecordSchema, canTransition, type AuditRequest, type WorkflowRecord, type WorkflowState } from "../src/domain/index.js";
import type { WorkflowPatch, WorkflowStore } from "../src/ports/workflow-store.js";
import { stableHash } from "../src/util/hash.js";

/** One bounded investigation lives in this object's SQLite-backed KV storage. */
export class DurableWorkflowStore implements WorkflowStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  async createOrGet(request: AuditRequest) {
    return this.storage.transaction(async (tx) => {
      const key = `request:${request.idempotencyKey}`;
      const id = await tx.get<string>(key);
      if (id) {
        const workflow = WorkflowRecordSchema.parse(await tx.get(`workflow:${id}`));
        if (stableHash(workflow.request) !== stableHash(request)) throw new Error("Idempotency payload mismatch");
        return { workflow, created: false };
      }
      const now = new Date().toISOString();
      const workflow = WorkflowRecordSchema.parse({ workflowId: crypto.randomUUID(),
        idempotencyKey: request.idempotencyKey, request, state: "RECEIVED", attempt: 0,
        createdAt: now, updatedAt: now, transitions: [] });
      await tx.put({ [key]: workflow.workflowId, [`workflow:${workflow.workflowId}`]: workflow });
      return { workflow, created: true };
    });
  }

  async get(id: string): Promise<WorkflowRecord | undefined> {
    const value = await this.storage.get(`workflow:${id}`);
    return value === undefined ? undefined : WorkflowRecordSchema.parse(value);
  }

  async transition(id: string, from: WorkflowState, to: WorkflowState, reason: string, patch: WorkflowPatch = {}) {
    return this.storage.transaction(async (tx) => {
      const current = WorkflowRecordSchema.parse(await tx.get(`workflow:${id}`));
      if (current.state !== from || !canTransition(from, to)) throw new Error("Invalid workflow transition");
      const now = new Date().toISOString();
      const { error, ...rest } = patch;
      const candidate = { ...current, ...rest, state: to, updatedAt: now,
        transitions: [...current.transitions, { from, to, at: now, reason }] };
      if (error === null) delete candidate.error;
      else if (error !== undefined) candidate.error = error;
      const next = WorkflowRecordSchema.parse(candidate);
      await tx.put(`workflow:${id}`, next);
      return next;
    });
  }

  async acquireLease(id: string, owner: string, ttlMs: number) {
    return this.storage.transaction(async (tx) => {
      const key = `lease:${id}`;
      const lease = await tx.get<{ owner: string; expires: number }>(key);
      if (lease && lease.expires > Date.now()) return false;
      await tx.put(key, { owner, expires: Date.now() + ttlMs });
      return true;
    });
  }
  async releaseLease(id: string, owner: string) {
    await this.storage.transaction(async (tx) => {
      const key = `lease:${id}`;
      if ((await tx.get<{ owner: string }>(key))?.owner === owner) await tx.delete(key);
    });
  }
  async close() { /* Durable storage belongs to the object, not one request. */ }
}
