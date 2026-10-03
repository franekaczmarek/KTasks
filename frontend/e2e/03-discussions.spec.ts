import { expect, test } from "@playwright/test";

import { createIssue, login, trackConsoleErrors, USERS } from "./helpers";

test("employee and lead chat; unread badge, author-only edits, notifications", async ({ browser }) => {
  const employeeCtx = await browser.newContext();
  const leadCtx = await browser.newContext();
  const employee = await employeeCtx.newPage();
  const lead = await leadCtx.newPage();
  const errors = [...trackConsoleErrors(employee), ...trackConsoleErrors(lead)];

  // Employee reports an issue and starts the thread.
  await login(employee, USERS.employee);
  const title = `[e2e] Chat about cleanroom humidity ${Date.now()}`;
  const id = await createIssue(employee, title, { area: "Operations" });
  await employee.goto(`/discussions?issue=${id}`);
  await expect(employee.getByTestId("thread-title")).toHaveText(title);
  await employee.getByLabel("Message", { exact: true }).fill("Humidity alarm triggered twice today.");
  await employee.getByLabel("Message", { exact: true }).press("Enter");
  await expect(employee.getByTestId("chat-messages")).toContainText("Humidity alarm triggered twice today.");

  // Lead (assigned) sees the thread with an unread badge and preview.
  await login(lead, USERS.lead);
  await lead.goto("/discussions");
  const thread = lead.getByTestId(`thread-${id}`);
  await expect(thread).toContainText("Kasia Zielinska: Humidity alarm triggered twice today.");
  await expect(thread.getByTestId("unread-badge")).toHaveText("1");
  await thread.click();
  await expect(thread.getByTestId("unread-badge")).toHaveCount(0);

  // Lead cannot edit the employee's message, but can reply.
  await expect(lead.getByTestId("chat-messages").getByRole("button", { name: "Edit message" })).toHaveCount(0);
  await lead.getByLabel("Message", { exact: true }).fill("Checking the HVAC logs now.");
  await lead.getByRole("button", { name: "Send" }).click();
  await expect(lead.getByTestId("chat-messages")).toContainText("Checking the HVAC logs now.");

  // Employee receives the reply (polling) and edits their own message only.
  await expect(employee.getByTestId("chat-messages")).toContainText("Checking the HVAC logs now.", { timeout: 15_000 });
  const editButtons = employee.getByTestId("chat-messages").getByRole("button", { name: "Edit message" });
  await expect(editButtons).toHaveCount(1);
  await editButtons.first().click({ force: true });
  await employee.getByLabel("Edit message").fill("Humidity alarm triggered three times today.");
  await employee.getByRole("button", { name: "Save" }).click();
  await expect(employee.getByTestId("chat-messages")).toContainText("Humidity alarm triggered three times today.");
  await expect(employee.getByTestId("chat-messages")).toContainText("(edited)");

  // Lead sees the edit.
  await lead.reload();
  await expect(lead.getByTestId("chat-messages")).toContainText("three times today.");
  await expect(lead.getByTestId("chat-messages")).toContainText("(edited)");

  expect(errors).toEqual([]);
  await employeeCtx.close();
  await leadCtx.close();
});
