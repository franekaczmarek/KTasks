import { expect, test } from "@playwright/test";

import { choose, createIssue, login, trackConsoleErrors, USERS } from "./helpers";

test("lead rejects an issue with a reason; reporter sees why", async ({ browser }) => {
  const employee = await (await browser.newContext()).newPage();
  const lead = await (await browser.newContext()).newPage();
  const errors = [...trackConsoleErrors(employee), ...trackConsoleErrors(lead)];

  await login(employee, USERS.employee);
  const title = `[e2e] Reject flow ${Date.now()}`;
  const id = await createIssue(employee, title);

  await login(lead, USERS.lead);
  await lead.goto(`/issues?issue=${id}`);
  await lead.getByRole("button", { name: "Reject issue" }).click();
  const dialog = lead.getByTestId("reject-dialog");
  const submit = dialog.getByRole("button", { name: "Reject issue" });
  await expect(submit).toBeDisabled();                       // reason is mandatory
  await dialog.getByLabel(/Rejection reason/).fill("abc");
  await expect(dialog.getByText("Please give at least 5 characters.")).toBeVisible();
  await expect(submit).toBeDisabled();
  const reason = "Expected behaviour: alarm threshold is defined in SOP-114, not a defect.";
  await dialog.getByLabel(/Rejection reason/).fill(reason);
  await submit.click();
  await expect(lead.getByText(`KT-${id} rejected: the reporter has been notified`)).toBeVisible();

  const drawer = lead.getByTestId("issue-drawer");
  await expect(drawer.getByTestId("rejected-panel")).toContainText("Rejected by Anna Nowak");
  await expect(drawer.getByTestId("rejected-reason")).toHaveText(reason);
  await expect(drawer.getByText("Rejected", { exact: true }).first()).toBeVisible();
  await expect(drawer.getByText("Lead controls")).toHaveCount(0);      // terminal: no more edits
  await drawer.getByRole("tab", { name: "Activity" }).click();
  await expect(drawer.getByTestId("activity-log")).toContainText(`Anna Nowak rejected the issue: "${reason}"`);

  // Rejected issues leave the default open list but are findable by status.
  await lead.keyboard.press("Escape");
  await expect(lead.getByTestId(`issue-row-${id}`)).toHaveCount(0);
  await choose(lead, "Status filter", "Rejected");
  await expect(lead.getByTestId(`issue-row-${id}`)).toContainText("Rejected");
  await expect(lead.getByTestId(`issue-row-${id}`).getByTestId("sla-badge")).toHaveText("N/A");

  // Reporter is notified and sees the reason.
  await employee.goto("/issues");
  await expect(employee.getByTestId("bell-count")).toBeVisible({ timeout: 30_000 });
  await employee.getByRole("button", { name: /^Notifications/ }).click();
  await employee.getByTestId("notification-panel").getByRole("button", { name: new RegExp(`KT-${id} was rejected`) }).click();
  await expect(employee.getByTestId("rejected-reason")).toHaveText(reason);

  expect(errors).toEqual([]);
});
