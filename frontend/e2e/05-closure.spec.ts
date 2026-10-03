import { expect, test } from "@playwright/test";

import { choose, createIssue, login, trackConsoleErrors, USERS } from "./helpers";

test("lead resolves, only the reporter can confirm; closure is attributed", async ({ browser }) => {
  const reporter = await (await browser.newContext()).newPage();
  const lead = await (await browser.newContext()).newPage();
  const errors = [...trackConsoleErrors(reporter), ...trackConsoleErrors(lead)];

  await login(reporter, USERS.employee);
  const id = await createIssue(reporter, `[e2e] Closure loop ${Date.now()}`);

  // Lead: single task straight to Done -> starts the issue and prompts completion.
  await login(lead, USERS.lead);
  await lead.goto(`/work?issue=${id}`);
  await lead.getByRole("button", { name: "New task" }).click();
  await lead.getByLabel("Task title").fill("Swap faulty relay");
  await lead.getByRole("button", { name: "Add task" }).click();
  await lead.getByRole("button", { name: "Move Swap faulty relay" }).click();
  await lead.getByRole("menuitem", { name: "Move to Done" }).click();
  await lead.getByTestId("completion-dialog").getByRole("button", { name: "Yes, resolve issue" }).click();
  await choose(lead, "Root cause", "IT/Equipment");
  await lead.getByRole("button", { name: "Mark as Resolved" }).click();
  await expect(lead.getByText(/asked to confirm/)).toBeVisible();

  // Lead sees the pending verification but cannot confirm it.
  await lead.goto(`/issues?issue=${id}`);
  const leadPanel = lead.getByTestId("resolution-panel");
  await expect(leadPanel).toContainText("Awaiting confirmation");
  await expect(leadPanel).toContainText("IT/Equipment");
  await expect(leadPanel.getByTestId("auto-close-at")).not.toHaveText("—");
  await expect(leadPanel.getByRole("button", { name: "Confirm Resolution" })).toHaveCount(0);

  // Reporter confirms.
  await reporter.goto(`/issues?issue=${id}`);
  await reporter.getByTestId("resolution-panel").getByRole("button", { name: "Confirm Resolution" }).click();
  await expect(reporter.getByText(`KT-${id} closed: thank you for confirming`)).toBeVisible();
  const closed = reporter.getByTestId("closed-panel");
  await expect(closed).toContainText("resolution confirmed by Kasia Zielinska");
  const drawer = reporter.getByTestId("issue-drawer");
  await drawer.getByRole("tab", { name: "Activity" }).click();
  await expect(drawer.getByTestId("activity-log")).toContainText("Kasia Zielinska confirmed the resolution and closed the issue");

  // Closed issues leave the default (open) list.
  await reporter.keyboard.press("Escape");
  await expect(reporter.getByTestId(`issue-row-${id}`)).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("lead can trigger the auto-close check from settings", async ({ page }) => {
  await login(page, USERS.lead);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Run auto-close check" }).click();
  await expect(page.getByText(/No issues due for auto-close|Auto-closed KT-/)).toBeVisible();
});
