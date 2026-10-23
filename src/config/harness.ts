import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  ActiveHarnessConfigurationSchema,
  HarnessConfigurationSchema,
  type HarnessConfiguration,
} from "../domain/index.js";

export async function loadActiveHarnessConfiguration(
  configDir: string,
): Promise<HarnessConfiguration> {
  const active = ActiveHarnessConfigurationSchema.parse(
    JSON.parse(await readFile(resolve(configDir, "active.json"), "utf8")) as unknown,
  );
  const config = HarnessConfigurationSchema.parse(
    JSON.parse(
      await readFile(resolve(configDir, `${active.activeConfigId}.json`), "utf8"),
    ) as unknown,
  );
  if (config.id !== active.activeConfigId) {
    throw new Error("The active harness record does not match its configuration.");
  }
  return config;
}
