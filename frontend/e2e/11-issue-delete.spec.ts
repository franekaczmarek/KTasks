import { expect, test } from "@playwright/test";

import { createIssue, login, trackConsoleErrors, USERS } from "./helpers";

test("only the reporter and the assigned Lead can delete; deletion hides the issue and notifies", async ({ browser }) => {
  const reporter = await (await browser.newContext()).newPage();
  const lead = await (await browser.newContext()).newPage();
  const otherLead = await (await browser.newContext()).newPage();
  const bystander = await (await browser.newContext()).newPage();
  const errors = [...trackConsoleErrors(reporter), ...trackConsoleErrors(lead)];

  await login(reporter, USERS.employee);
  const title = `[e2e] Delete flow ${Date.now()}`;
  const id = await createIssue(reporter, title, { area: "Operations" }); // assigned to Anna

  // Not allowed: a Lead who isn't assigned, and an unrelated employee.
  for (const [page, who] of [[otherLead, USERS.lead2], [bystander, USERS.employee2]] as const) {
    await login(page, who);
    await page.goto(`/issues?issue=${id}`);
    await expect(page.getByTestId("issue-drawer").getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete issue" })).toHaveCount(0);
  }

  // The assigned Lead sees the option.
  await login(lead, USERS.lead);
  await lead.goto(`/issues?issue=${id}`);
  await expect(lead.getByTestId("danger-zone")).toBeVisible();
  await lead.goto("/issues"); // close the drawer so the bell is reachable later

  // Reporter deletes with a reason.
  await reporter.goto(`/issues?issue=${id}`);
  await reporter.getByTestId("danger-zone").getByRole("button", { name: "Delete issue" }).click();
  const dialog = reporter.getByTestId("delete-issue-dialog");
  await expect(dialog).toContainText(title);
  await dialog.getByLabel("Reason (optional)").fill("Reported by mistake");
  await dialog.getByRole("button", { name: "Delete issue" }).click();
  await expect(reporter.getByText(`KT-${id} deleted`)).toBeVisible();
  await expect(reporter.getByTestId("issue-drawer")).toHaveCount(0);
  await expect(reporter).not.toHaveURL(/issue=/);
  await expect(reporter.getByTestId(`issue-row-${id}`)).toHaveCount(0);

  // Gone from search, and a direct link shows nothing.
  await reporter.keyboard.press("Control+k");
  await reporter.getByPlaceholder(/Search issues/).fill(`KT-${id}`);
  await expect(reporter.getByText("No results found.")).toBeVisible();
  await reporter.keyboard.press("Escape");

  // Assigned Lead is notified with the reason.
  await lead.reload();
  await expect(lead.getByTestId("bell-count")).toBeVisible({ timeout: 30_000 });
  await lead.getByRole("button", { name: /^Notifications/ }).click();
  await expect(lead.getByTestId("notification-panel"))
    .toContainText(`KT-${id} "${title}" was deleted by Kasia Zielinska: Reported by mistake`);

  expect(errors).toEqual([]);
});
