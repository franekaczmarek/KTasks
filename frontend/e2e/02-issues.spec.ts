import { expect, test } from "@playwright/test";

import { choose, login, trackConsoleErrors, USERS } from "./helpers";

const TITLE = `[e2e] Conveyor belt sensor misreads pallets ${Date.now()}`;


test.describe.serial("Issues tab", () => {
  let issueId: string;

  test("employee reports an issue with an attachment; it routes to the area lead", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await login(page, USERS.employee);
    await page.getByRole("button", { name: "Report issue" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(TITLE);
    await dialog.getByLabel("Summary").fill("Sensor on line 2 reports empty pallets as full.");
    await choose(page, "Area", "Operations");
    await choose(page, "Priority", "High");
    await choose(page, "Estimated effort", "Medium");
    await dialog.getByLabel(/Attachments/).setInputFiles({
      name: "sensor-log.txt", mimeType: "text/plain", buffer: Buffer.from("err 42"),
    });
    await dialog.getByRole("button", { name: "Submit issue" }).click();

    await expect(page.getByText(/created and routed to Anna Nowak/)).toBeVisible();
    await expect(page).toHaveURL(/\?issue=\d+/);
    issueId = new URL(page.url()).searchParams.get("issue")!;

    const drawer = page.getByTestId("issue-drawer");
    await expect(drawer.getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(drawer.getByTestId("sla-breakdown")).toContainText("target 5 bd");
    await expect(drawer.getByTestId("attachments")).toContainText("sensor-log.txt");
    await drawer.getByRole("tab", { name: "Activity" }).click();
    await expect(drawer.getByTestId("activity-log")).toContainText("Kasia Zielinska created the issue");
    await page.keyboard.press("Escape");

    const row = page.getByTestId(`issue-row-${issueId}`);
    await expect(row).toContainText("Anna Nowak");
    await expect(row.getByTestId("sla-badge")).toContainText("On track");
    expect(errors).toEqual([]);
  });

  test("anti-duplicate guard suggests joining the existing thread", async ({ page }) => {
    await login(page, USERS.employee2);
    await page.getByRole("button", { name: "Report issue" }).click();
    await page.getByRole("dialog").getByLabel("Title").fill("conveyor belt sensor misreads");
    const guard = page.getByTestId("duplicate-guard");
    await expect(guard).toContainText(TITLE);
    await guard.getByRole("listitem").filter({ hasText: TITLE }).getByRole("button", { name: "Join thread" }).click();
    await expect(page).toHaveURL(new RegExp(`/discussions\\?issue=${issueId}`));
  });

  test("creator adds and resolves a blocker; BLOCKED badge follows", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await login(page, USERS.employee);
    await page.goto(`/issues?issue=${issueId}`);
    const drawer = page.getByTestId("issue-drawer");
    await drawer.getByLabel("Blocker reason").fill("Waiting for replacement sensor from vendor");
    await drawer.getByRole("button", { name: "Add blocker" }).click();
    await expect(drawer.getByTestId("blocked-badge")).toBeVisible();
    await expect(drawer.getByTestId("blockers")).toContainText("ongoing");
    await expect(page.getByTestId(`issue-row-${issueId}`).getByTestId("blocked-badge")).toBeVisible();

    await drawer.getByRole("button", { name: "Resolve" }).click();
    await expect(drawer.getByTestId("blocked-badge")).toHaveCount(0);
    await expect(drawer.getByTestId("blockers")).toContainText("Resolved");
    await drawer.getByRole("tab", { name: "Activity" }).click();
    await expect(drawer.getByTestId("activity-log")).toContainText('added blocker: "Waiting for replacement sensor');
    await expect(drawer.getByTestId("activity-log")).toContainText("resolved blocker");
    expect(errors).toEqual([]);
  });

  test("lead reassigns and changes priority; audit log attributes the user", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await login(page, USERS.lead);
    await page.goto(`/issues?issue=${issueId}`);
    const drawer = page.getByTestId("issue-drawer");
    await choose(page, "Change priority", "Critical");
    await expect(drawer.getByText("Critical").first()).toBeVisible();
    await choose(page, "Reassign lead", "Marek Wilk");
    await expect(page.getByTestId(`issue-row-${issueId}`)).toContainText("Marek Wilk");

    await drawer.getByRole("tab", { name: "Activity" }).click();
    const log = drawer.getByTestId("activity-log");
    await expect(log).toContainText("Anna Nowak changed priority from High to Critical");
    await expect(log).toContainText("Anna Nowak reassigned the issue from Anna Nowak to Marek Wilk");
    expect(errors).toEqual([]);
  });

  test("employees see no lead controls", async ({ page }) => {
    await login(page, USERS.employee2);
    await page.goto(`/issues?issue=${issueId}`);
    await expect(page.getByTestId("issue-drawer").getByRole("heading", { name: TITLE })).toBeVisible();
    await expect(page.getByText("Lead controls")).toHaveCount(0);
    await expect(page.getByLabel("Blocker reason")).toHaveCount(0); // not creator, not lead
  });
});
