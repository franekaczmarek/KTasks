import { expect, type Locator, type Page, test } from "@playwright/test";

import { choose, createIssue, login, trackConsoleErrors, USERS } from "./helpers";

/** Real pointer drag (dnd-kit needs intermediate pointer moves). */
async function drag(page: Page, handle: Locator, target: Locator) {
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 40, { steps: 15 });
  await page.mouse.up();
}

async function moveVia(page: Page, title: string, column: string) {
  await page.getByRole("button", { name: `Move ${title}` }).click();
  await page.getByRole("menuitem", { name: `Move to ${column}` }).click();
}

test("templates, drag to start, last Done -> YES + root cause resolves the issue", async ({ page, browser }) => {
  const errors = trackConsoleErrors(page);
  // Employee reports; lead works the board.
  const reporter = await (await browser.newContext()).newPage();
  await login(reporter, USERS.employee);
  const id = await createIssue(reporter, `[e2e] Kanban resolve flow ${Date.now()}`);

  await login(page, USERS.lead);
  await page.goto(`/work?issue=${id}`);
  await page.getByRole("button", { name: "Apply task templates" }).click();
  const todo = page.getByTestId("column-board-ToDo");
  await expect(todo.locator("[data-testid^=task-]")).toHaveCount(5);

  // Drag the first task into In Progress -> issue auto-starts.
  await drag(page, page.getByRole("button", { name: "Drag Root cause analysis" }), page.getByTestId("column-board-InProgress"));
  await expect(page.getByTestId("column-board-InProgress")).toContainText("Root cause analysis");
  await expect(page.getByText(`KT-${id} moved to In Progress`)).toBeVisible();
  await expect(page.getByText("In Progress", { exact: true }).first()).toBeVisible();

  // Finish everything; the last one triggers the completion modal.
  for (const t of ["Root cause analysis", "Fix implementation", "Fix testing", "SOP update"]) await moveVia(page, t, "Done");
  await expect(page.getByTestId("completion-dialog")).toHaveCount(0);
  await moveVia(page, "Training", "Done");
  const dialog = page.getByTestId("completion-dialog");
  await expect(dialog).toContainText("Are all works on this issue");
  await dialog.getByRole("button", { name: "Yes, resolve issue" }).click();
  await expect(dialog.getByRole("button", { name: "Mark as Resolved" })).toBeDisabled(); // root cause required
  await choose(page, "Root cause", "Vendor");
  await dialog.getByRole("button", { name: "Mark as Resolved" }).click();
  await expect(page.getByText(/resolved: the reporter has been asked to confirm/)).toBeVisible();
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Move / })).toHaveCount(0); // board locked

  // Audit trail shows the automatic transitions.
  await page.goto(`/issues?issue=${id}`);
  await page.getByTestId("issue-drawer").getByRole("tab", { name: "Activity" }).click();
  const log = page.getByTestId("activity-log");
  await expect(log).toContainText("applied task templates (5 tasks)");
  await expect(log).toContainText("changed status from New to In Progress");
  await expect(log).toContainText("resolved the issue (root cause: Vendor)");
  expect(errors).toEqual([]);
});

test("NO branch without a new task raises the red alert; adding a task clears it", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page, USERS.lead);
  const id = await createIssue(page, `[e2e] Kanban red alert ${Date.now()}`);
  await page.goto(`/work?issue=${id}`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task title").fill("Replace filter");
  await page.getByRole("button", { name: "Add task" }).click();
  await moveVia(page, "Replace filter", "In Progress");
  await moveVia(page, "Replace filter", "Done");

  await page.getByTestId("completion-dialog").getByRole("button", { name: "No, more work needed" }).click();
  await expect(page.getByRole("dialog")).toContainText("Plan the remaining work");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByTestId("red-alert")).toBeVisible();

  await page.goto("/issues");
  const row = page.getByTestId(`issue-row-${id}`);
  await expect(row).toHaveAttribute("data-red-alert", "true");
  await expect(row).toContainText("No scheduled tasks in progress");

  await page.goto(`/work?issue=${id}`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task title").fill("Verify airflow after replacement");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByTestId("red-alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("global view groups tasks into swimlanes by assignee", async ({ page }) => {
  await login(page, USERS.lead);
  const id = await createIssue(page, `[e2e] Kanban swimlanes ${Date.now()}`);
  await page.goto(`/work?issue=${id}`);
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task title").fill("Swimlane task for Piotr");
  await choose(page, "Assignee", "Piotr Lewandowski");
  await page.getByRole("button", { name: "Add task" }).click();

  await page.getByRole("tab", { name: "Global" }).click();
  await expect(page).toHaveURL(/view=global/);
  const lane = page.locator("[data-testid^=lane-]").filter({ has: page.getByRole("heading", { name: /Piotr Lewandowski/ }) });
  await expect(lane).toContainText("Swimlane task for Piotr");
  await expect(lane).toContainText(`KT-${id}`);
  await expect(page.locator("[data-testid=lane-unassigned]")).toBeVisible();
});
