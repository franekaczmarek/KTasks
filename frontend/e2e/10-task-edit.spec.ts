import { expect, type Page, test } from "@playwright/test";

import { choose, createIssue, login, trackConsoleErrors, USERS } from "./helpers";

async function addTask(page: Page, title: string, assignee?: string) {
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Task title").fill(title);
  if (assignee) await choose(page, "Assignee", assignee);
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByTestId("column-board-ToDo")).toContainText(title);
}

async function taskAction(page: Page, title: string, action: "Edit task" | "Delete task") {
  await page.getByRole("button", { name: `Task actions ${title}` }).click();
  await page.getByRole("menuitem", { name: action }).click();
}

test("edit (rename + reassign) and delete tasks, with audit trail and permissions", async ({ page, browser }) => {
  const errors = trackConsoleErrors(page);
  await login(page, USERS.lead);
  const id = await createIssue(page, `[e2e] Task editing ${Date.now()}`);
  await page.goto(`/work?issue=${id}`);
  await addTask(page, "Calibrte senosr", "Kasia Zielinska");
  await addTask(page, "Order spare part");

  // Rename + reassign.
  await taskAction(page, "Calibrte senosr", "Edit task");
  const dialog = page.getByTestId("edit-task-dialog");
  await expect(dialog.getByLabel("Task title")).toHaveValue("Calibrte senosr");
  await dialog.getByLabel("Task title").fill("Calibrate sensor");
  await dialog.getByLabel("Details").fill("Use calibration kit B");
  await choose(page, "Task assignee", "Piotr Lewandowski");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Task updated")).toBeVisible();
  const card = page.getByTestId("column-board-ToDo").locator("[data-testid^=task-]").filter({ hasText: "Calibrate sensor" });
  await expect(card).toContainText("Piotr Lewandowski");
  await expect(card).toContainText("Use calibration kit B");

  // Assignee (Piotr) can edit his task but not delete it.
  const piotr = await (await browser.newContext()).newPage();
  await login(piotr, USERS.employee2);
  await piotr.goto(`/work?issue=${id}`);
  await piotr.getByRole("button", { name: "Task actions Calibrate sensor" }).click();
  await expect(piotr.getByRole("menuitem", { name: "Edit task" })).toBeVisible();
  await expect(piotr.getByRole("menuitem", { name: "Delete task" })).toHaveCount(0);
  await piotr.keyboard.press("Escape");
  await expect(piotr.getByRole("button", { name: "Task actions Order spare part" })).toHaveCount(0); // not his task

  // Lead deletes a task (with confirmation).
  await taskAction(page, "Order spare part", "Delete task");
  await page.getByTestId("delete-task-dialog").getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByText('Task "Order spare part" deleted')).toBeVisible();
  await expect(page.getByTestId("column-board-ToDo")).not.toContainText("Order spare part");

  // Audit log tells the story.
  await page.goto(`/issues?issue=${id}`);
  const drawer = page.getByTestId("issue-drawer");
  await drawer.getByRole("tab", { name: "Activity" }).click();
  const log = drawer.getByTestId("activity-log");
  await expect(log).toContainText('Anna Nowak renamed task "Calibrte senosr" to "Calibrate sensor"');
  await expect(log).toContainText('reassigned task "Calibrate sensor" from Kasia Zielinska to Piotr Lewandowski');
  await expect(log).toContainText('Anna Nowak deleted task "Order spare part"');

  expect(errors).toEqual([]);
});

test("deleting the last open task asks whether all works are completed", async ({ page }) => {
  await login(page, USERS.lead);
  const id = await createIssue(page, `[e2e] Delete prompt ${Date.now()}`);
  await page.goto(`/work?issue=${id}`);
  await addTask(page, "Finished work");
  await addTask(page, "Obsolete step");
  await page.getByRole("button", { name: "Move Finished work" }).click();
  await page.getByRole("menuitem", { name: "Move to Done" }).click();
  await expect(page.getByTestId("column-board-Done")).toContainText("Finished work");

  await taskAction(page, "Obsolete step", "Delete task");
  await page.getByTestId("delete-task-dialog").getByRole("button", { name: "Delete task" }).click();
  await expect(page.getByTestId("completion-dialog")).toContainText("Are all works on this issue");
});
