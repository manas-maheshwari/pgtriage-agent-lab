import { describe, expect, it } from "vitest";

import { optionalPgTriageStateEnv } from "../../src/config/tool-clients.js";

describe("pgtriage child-process environment", () => {
  it("forwards only the explicit reconciliation-state settings", () => {
    expect(
      optionalPgTriageStateEnv({
        PGTRIAGE_AUDIT_STORE_PATH: "/tmp/private/audit.sqlite3",
        PGTRIAGE_AUDIT_RETENTION_HOURS: "12",
        PGTRIAGE_AUDIT_TOMBSTONE_HOURS: "48",
        ANTHROPIC_API_KEY: "must-not-cross-the-boundary",
        UNRELATED_SECRET: "must-not-cross-the-boundary",
      }),
    ).toEqual({
      PGTRIAGE_AUDIT_STORE_PATH: "/tmp/private/audit.sqlite3",
      PGTRIAGE_AUDIT_RETENTION_HOURS: "12",
      PGTRIAGE_AUDIT_TOMBSTONE_HOURS: "48",
    });
  });
});
