import { expect, test } from "@playwright/test";

test("protected staging shutdown control uses DELETE and disables further submissions (mock API)", async ({ page }) => {
  let enabled = true;
  let shutdownCalls = 0;
  await page.route("**/api/investigation", route => route.fulfill({ json: {
    modelMode: "workers-ai", inferenceEnabled: enabled, turns: [],
  } }));
  await page.route("**/api/inference", route => {
    if (route.request().method() === "DELETE") { enabled = false; shutdownCalls++; }
    return route.fulfill({ json: { enabled, used: 3, limit: 20 } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Investigate", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Disable live inference for this test" }).click();
  await expect(page.locator("#inference-status")).toHaveText("Live model attempts: 3/20 · inference disabled");
  await expect(page.getByRole("button", { name: "Investigate", exact: true })).toBeDisabled();
  await expect(page.locator("#mode")).toContainText("LIVE INFERENCE DISABLED");
  expect(shutdownCalls).toBe(1);
});

test("synthetic label, refresh restoration, evidence-based follow-up, and session reset", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("SYNTHETIC DATA ONLY", { exact: true })).toBeVisible();
  await expect(page.locator("#mode")).toContainText("LOCAL TEST MODEL");
  await expect(page.getByRole("button", { name: "Investigate", exact: true })).toBeEnabled();
  await page.getByLabel("Your question about this synthetic incident").fill("Why is the orders table slow?");
  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  await expect(page.locator(".answer")).toContainText("18250 sequential scans");
  const initial = await page.locator("#chat").innerText();
  const evidence = await page.locator("#evidence").innerText();
  const hash = await page.locator("#evidence-status").innerText();
  await page.reload();
  await expect(page.locator("#chat")).toHaveText(initial, { useInnerText: true });
  await expect(page.locator("#evidence")).toHaveText(evidence);
  await expect(page.locator("#evidence-status")).toHaveText(hash);
  await page.getByLabel("Your question about this synthetic incident").fill("What should I validate first?");
  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  await expect(page.locator(".answer")).toHaveCount(2);
  await expect(page.locator(".answer").last()).toContainText("18250 sequential scans");
  const followupText = await page.locator(".answer").last().innerText();
  expect(followupText).toContain("Observed: Saved table counters: 18250 sequential scans and 41 index scans; live-row estimate: 2000000");
  expect(followupText).toContain("No scan ratio or query-slowness cause is established");
  expect(followupText.indexOf("Observed:")).toBeLessThan(followupText.indexOf("Possible causes (unconfirmed):"));
  expect(followupText.indexOf("Possible causes (unconfirmed):")).toBeLessThan(followupText.indexOf("Check next:"));
  expect(followupText).not.toMatch(/post[- ]change|after creation|Only if a change is later approved|CREATE INDEX|high sequential.scan ratio/i);
  expect(followupText).not.toContain("HIGH · missing index");
  expect(followupText).toContain("Missing: the exact proposed change");
  expect(followupText).toContain("object definition and dependencies");
  expect(followupText).not.toContain("<index_name>");
  expect(followupText).not.toMatch(/DROP\s+INDEX/i);
  await expect(page.locator("#evidence-status")).toHaveText(hash);
  await expect(page.locator(".evidence-ref").last()).toHaveText(await page.locator(".evidence-ref").first().innerText());
  await page.getByRole("button", { name: "New investigation" }).click();
  await expect(page.locator(".answer")).toHaveCount(0);
  await expect(page.locator("#evidence")).toBeEmpty();
});

test("renders user input as text, never executable HTML", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Investigate", exact: true })).toBeEnabled();
  await page.getByLabel("Your question about this synthetic incident").fill('<img src=x onerror="window.pwned=true"> Explain scan counts.');
  await page.getByRole("button", { name: "Investigate", exact: true }).click();
  await expect(page.locator(".user")).toContainText("<img src=x");
  await expect(page.locator("#chat img")).toHaveCount(0);
  expect(await page.evaluate(() => "pwned" in window)).toBe(false);
});
