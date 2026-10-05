import { expect, type Page, test } from "@playwright/test";

import { choose, createIssue, login, trackConsoleErrors, USERS } from "./helpers";

const DIRECTOR = "director@ktasks.dev";
const OLA = "ola@ktasks.dev";

async function setDirectorBackup(page: Page, name: string) {
  await page.goto("/settings");
  await choose(page, "Dorota Wisniewska backup", name);
  await expect(page.getByText("Lead updated")).toBeVisible();
}

async function issueRow(page: Page, id: number) {
  await page.goto("/issues");
  await choose(page, "Status filter", "Any status");
  return page.getByTestId(`issue-row-${id}`);
}

test("employee reports to Management; the Director hides it from other employees", async ({ browser }) => {
  const pages = await Promise.all([0, 1, 2, 3, 4].map(async () => (await browser.newContext()).newPage()));
  const [kasia, director, piotr, anna, ola] = pages;
  const errors = pages.flatMap((p) => trackConsoleErrors(p));

  // Kasia reports to Management: it routes to the Director.
  await login(kasia, USERS.employee);
  const title = `[e2e] Director confidential ${Date.now()}`;
  const id = await createIssue(kasia, title, { area: "Management (Director)" });
  await expect(kasia.getByText(new RegExp(`KT-${id} created and routed to Dorota Wisniewska`))).toBeVisible();

  await login(director, DIRECTOR);
  try {
    await setDirectorBackup(director, "Ola Kaminska · Employee");

    // The Director hides it.
    await director.goto(`/issues?issue=${id}`);
    const drawer = director.getByTestId("issue-drawer");
    await expect(drawer.getByText("Lead controls", { exact: true })).toBeVisible();
    await drawer.getByLabel("Hide from employees").click();
    await expect(drawer.getByLabel("Hide from employees")).toBeChecked();
    await expect(drawer.getByTestId("hidden-badge")).toBeVisible();
    await expect(drawer.getByTestId("visibility-controls")).toContainText("(Ola Kaminska)");

    // Another employee doesn't see it at all; the reporter still does.
    await login(piotr, USERS.employee2);
    await expect(await issueRow(piotr, id)).toHaveCount(0);
    await expect(piotr.getByRole("combobox", { name: "Visibility filter" })).toHaveCount(0);
    await expect((await issueRow(kasia, id)).getByTestId("hidden-badge")).toBeVisible();

    // A Lead finds it with the staff-only visibility filter.
    await login(anna, USERS.lead);
    await anna.goto("/issues");
    await choose(anna, "Status filter", "Any status");
    await choose(anna, "Visibility filter", "Hidden only");
    await expect(anna.getByTestId(`issue-row-${id}`).getByTestId("hidden-badge")).toBeVisible();

    // The employee backup sees it only once the Director opens it to them.
    await login(ola, OLA);
    await expect(await issueRow(ola, id)).toHaveCount(0);
    await drawer.getByLabel("Visible to backup").click();
    await expect(drawer.getByLabel("Visible to backup")).toBeChecked();
    await expect(director.getByText("Issue updated").first()).toBeVisible();
    await expect(await issueRow(ola, id)).toBeVisible();

    await drawer.getByRole("tab", { name: "Activity" }).click();
    await expect(drawer.getByTestId("activity-log")).toContainText("hid the issue from employees");
    await expect(drawer.getByTestId("activity-log")).toContainText("visible to the owner's backup");
  } finally {
    await setDirectorBackup(director, "Anna Nowak · Lead");
  }
  expect(errors).toEqual([]);
});
