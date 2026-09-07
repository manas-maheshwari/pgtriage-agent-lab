import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("credential-free demo modes", () => {
  it.each(["fixture", "mcp-fixture"])(
    "runs the %s demo without an API key or production database",
    async (mode) => {
      const { stdout } = await execFileAsync(
        process.execPath,
        ["--import", "tsx", "src/cli.ts", `--mode=${mode}`, "--output=concise"],
        {
          cwd: process.cwd(),
          env: process.env.PATH ? { PATH: process.env.PATH } : {},
          timeout: 20_000,
        },
      );

      expect(stdout).toContain("Final state: COMPLETED");
      expect(stdout).toContain("Output policy: PASSED");
    },
  );
});
