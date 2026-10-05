import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { createIssue, login, trackConsoleErrors, USERS } from "./helpers";

test("dashboard KPIs, quick-wins matrix, table view, filters and exports", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page, USERS.lead);
  const id = await createIssue(page, `[e2e] Dashboard quick win ${Date.now()}`, { priority: "Critical", effort: "Low" });
  await page.getByLabel("Blocker reason").fill("Awaiting calibration vendor");
  await page.getByRole("button", { name: "Add blocker" }).click();
  await expect(page.getByTestId("issue-drawer").getByTestId("blocked-badge")).toBeVisible();

  await page.goto("/dashboard");
  for (const tile of ["kpi-response", "kpi-open", "kpi-sla", "kpi-blockers"]) {
    await expect(page.getByTestId(tile)).toBeVisible();
  }
  expect(Number(await page.getByTestId("kpi-open-value").innerText())).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId("kpi-open")).toContainText("blocked");

  // SLA status chart (first chart): the fresh Critical issue is active and on track; table twin.
  const sla = page.getByTestId("chart-sla-status");
  await expect(sla.getByTestId("sla-active")).toBeVisible();
  expect(Number(await sla.getByTestId("sla-active-on_track").locator("span.font-semibold").innerText())).toBeGreaterThanOrEqual(1);
  await sla.getByRole("tab", { name: "table" }).click();
  await expect(sla.getByRole("table")).toContainText("On track");

  // Quick-win cell holds the new issue; tooltip lists it on hover.
  const cell = page.getByTestId("qw-Critical-Low");
  await expect(cell).toHaveAttribute("data-quick-win", "true");
  await cell.hover();
  await expect(cell.getByRole("tooltip")).toContainText(`KT-${id}`);

  // Blocker reasons chart and its table view twin.
  const blockers = page.getByTestId("chart-blockers");
  await expect(blockers).toContainText("Awaiting calibration vendor");
  await blockers.getByRole("tab", { name: "table" }).click();
  await expect(blockers.getByRole("table")).toContainText("Awaiting calibration vendor");

  // Filters re-scope every chart: Process has none of our issues.
  await page.getByRole("combobox", { name: "Dashboard area" }).click();
  await page.getByRole("option", { name: "Process", exact: true }).click();
  await expect(cell.locator("span").first()).toHaveText("0");
  await expect(cell.getByRole("tooltip")).toHaveCount(0);

  // Exports download real files.
  for (const [item, ext, magic] of [["PDF report", "pdf", "%PDF"], ["Excel workbook", "xlsx", "PK"]] as const) {
    await page.getByRole("button", { name: "Export summary" }).click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: item }).click()]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`^ktasks-report-\\d{8}-\\d{4}\\.${ext}$`));
    const path = await download.path();
    expect(readFileSync(path).subarray(0, magic.length).toString()).toBe(magic);
  }
  expect(errors).toEqual([]);
});
