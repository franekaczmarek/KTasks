import { expect, test } from "@playwright/test";

import { createIssue, login, trackConsoleErrors, USERS } from "./helpers";

const iso = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toLocaleDateString("en-CA");
};

test("lead agrees a due date once; a change applies only after the reporter accepts", async ({ browser }) => {
  const employee = await (await browser.newContext()).newPage();
  const lead = await (await browser.newContext()).newPage();
  const errors = [...trackConsoleErrors(employee), ...trackConsoleErrors(lead)];

  await login(employee, USERS.employee);
  const id = await createIssue(employee, `[e2e] Due date flow ${Date.now()}`, { priority: "Critical" });
  await expect(employee.getByTestId("sla-breakdown")).toContainText("target 2 bd (Critical)");

  // Lead sets the agreed date: the SLA is now measured against it.
  await login(lead, USERS.lead);
  await lead.goto(`/issues?issue=${id}`);
  const drawer = lead.getByTestId("issue-drawer");
  await drawer.getByLabel("Expected end date").fill(iso(30));
  await drawer.getByRole("button", { name: "Set", exact: true }).click();
  await expect(drawer.getByTestId("agreed-due-date")).toBeVisible();
  await expect(drawer.getByTestId("sla-breakdown")).toContainText("(agreed)");
  await expect(drawer.getByTestId("sla-badge")).toContainText("On track");

  // Changing it needs a reason and goes to the reporter.
  await drawer.getByRole("button", { name: "Request change" }).click();
  const dialog = lead.getByTestId("due-date-request-dialog");
  const send = dialog.getByRole("button", { name: "Send for approval" });
  await dialog.getByLabel("New due date").fill(iso(45));
  await expect(send).toBeDisabled();
  const reason = "Spare part from the vendor arrives in six weeks";
  await dialog.getByLabel(/Reason/).fill(reason);
  await send.click();
  await expect(drawer.getByTestId("due-date-request-banner")).toContainText("Waiting for Kasia");
  await expect(drawer.getByTestId("due-date-control")).toContainText("awaiting reporter");

  // Reporter is notified, reads the reason and accepts.
  await employee.goto("/issues");
  await expect(employee.getByTestId("bell-count")).toBeVisible({ timeout: 30_000 });
  await employee.getByRole("button", { name: /^Notifications/ }).click();
  await employee.getByTestId("notification-panel")
    .getByRole("button", { name: new RegExp(`move the due date of KT-${id}`) }).first().click();
  const banner = employee.getByTestId("due-date-request-banner");
  await expect(banner.getByTestId("due-date-request-reason")).toContainText(reason);
  await banner.getByRole("button", { name: "Accept new date" }).click();
  await expect(employee.getByText("New due date accepted")).toBeVisible();
  await expect(banner).toHaveCount(0);

  await employee.getByTestId("issue-drawer").getByRole("tab", { name: "Activity" }).click();
  const log = employee.getByTestId("activity-log");
  await expect(log).toContainText("asked to move the due date");
  await expect(log).toContainText("accepted the due date change");

  expect(errors).toEqual([]);
});
