import { expect, test } from "@playwright/test";

import { createIssue, login, trackConsoleErrors, USERS } from "./helpers";

const iso = (daysAhead: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toLocaleDateString("en-CA");
};

test("reporter proposes a due date; the Lead sets another one with a comment; history on hover", async ({ browser }) => {
  const employee = await (await browser.newContext()).newPage();
  const lead = await (await browser.newContext()).newPage();
  const errors = [...trackConsoleErrors(employee), ...trackConsoleErrors(lead)];
  const proposalReason = "Batch release is planned for that week";
  const comment = "Vendor needs two more weeks for the part";

  // The report dialog asks for a reason once a date is proposed.
  await login(employee, USERS.employee);
  await employee.goto("/issues");
  await employee.getByRole("button", { name: "Report issue" }).click();
  const form = employee.getByRole("dialog");
  await form.getByLabel(/Proposed due date/).fill(iso(20));
  await expect(form.getByLabel(/Why this date/)).toBeVisible();
  await employee.screenshot({ path: test.info().outputPath("report-dialog.png") });
  await form.getByRole("button", { name: "Cancel" }).click();

  const id = await createIssue(employee, `[e2e] Due date proposal ${Date.now()}`,
    { dueDate: iso(20), dueReason: proposalReason });
  const own = employee.getByTestId("due-date-request-banner");
  await expect(own).toContainText("You proposed");
  await expect(own).toContainText("Waiting for Anna");
  await expect(employee.getByTestId("sla-breakdown")).toContainText("target 10 bd (Medium)");

  // The Lead sees the proposal and its reason, and sets a different date with a required comment.
  await login(lead, USERS.lead);
  await lead.goto(`/issues?issue=${id}`);
  const drawer = lead.getByTestId("issue-drawer");
  const banner = drawer.getByTestId("due-date-request-banner");
  await expect(banner.getByTestId("due-date-request-reason")).toContainText(proposalReason);
  await expect(banner.getByRole("button", { name: /^Accept/ })).toBeVisible();
  await lead.screenshot({ path: test.info().outputPath("proposal-banner.png") });
  await banner.getByRole("button", { name: "Set a different date" }).click();
  const dialog = lead.getByTestId("due-date-counter-dialog");
  const submit = dialog.getByRole("button", { name: "Set due date" });
  await dialog.getByLabel("New due date").fill(iso(34));
  await dialog.getByLabel(/Reason/).fill("no");
  await expect(submit).toBeDisabled();
  await dialog.getByLabel(/Reason/).fill(comment);
  await submit.click();
  await expect(banner).toHaveCount(0);
  await expect(drawer.getByTestId("agreed-due-date")).toBeVisible();
  await expect(drawer.getByTestId("sla-breakdown")).toContainText("(agreed)");

  // Hovering the due date shows the history with the proposal reason and the Lead's comment.
  await drawer.getByTestId("due-date-control").getByTestId("due-date-history-trigger").hover();
  const history = lead.getByTestId("due-date-history");
  await expect(history).toContainText(`proposed the due date`);
  await expect(history).toContainText(proposalReason);
  await expect(history).toContainText("instead of the proposed");
  await expect(history).toContainText(comment);
  await lead.screenshot({ path: test.info().outputPath("history-tooltip.png") });

  // The reporter was told, without having to approve anything.
  await employee.goto(`/issues?issue=${id}`);
  await expect(employee.getByTestId("due-date-request-banner")).toHaveCount(0);
  await expect(employee.getByTestId("issue-drawer").getByText("(agreed)").first()).toBeVisible();

  expect(errors).toEqual([]);
});
