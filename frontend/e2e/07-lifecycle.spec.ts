import { expect, type Page, test } from "@playwright/test";

import { choose, createIssue, login, trackConsoleErrors, USERS } from "./helpers";

async function clearBell(page: Page) {
  await page.getByRole("button", { name: /^Notifications/ }).click();
  const markAll = page.getByRole("button", { name: "Mark all as read" });
  if (await markAll.isVisible()) await markAll.click();
  await expect(page.getByTestId("bell-count")).toHaveCount(0);
  await page.keyboard.press("Escape");
}

async function openBellItem(page: Page, text: RegExp) {
  await expect(page.getByTestId("bell-count")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByTestId("notification-panel").getByRole("button", { name: text }).first().click();
}

async function moveVia(page: Page, title: string, column: string) {
  await page.getByRole("button", { name: `Move ${title}` }).click();
  await page.getByRole("menuitem", { name: `Move to ${column}` }).click();
}

test("full lifecycle: report -> notify -> work -> block -> resolve -> confirm -> audit & dashboard", async ({ browser }) => {
  test.setTimeout(180_000);
  const employee = await (await browser.newContext()).newPage();
  const lead = await (await browser.newContext()).newPage();
  const errors = [...trackConsoleErrors(employee), ...trackConsoleErrors(lead)];

  await login(lead, USERS.lead);
  await clearBell(lead);
  await login(employee, USERS.employee);
  await clearBell(employee);

  // 1. Employee reports a Critical issue (routes to Anna for Operations).
  const title = `[e2e] Lifecycle: cold-chain logger offline ${Date.now()}`;
  const id = await createIssue(employee, title, { area: "Operations", priority: "Critical", effort: "Low",
    summary: "Temperature logger in cold room 2 stopped reporting." });

  // 2. Lead gets an in-app notification and lands on the issue from the bell.
  await lead.reload();
  await openBellItem(lead, new RegExp(`New Critical issue KT-${id}`));
  await expect(lead).toHaveURL(new RegExp(`/issues\\?issue=${id}`));
  await expect(lead.getByTestId("issue-drawer").getByRole("heading", { name: title })).toBeVisible();

  // 3. Global search finds it by key.
  await lead.keyboard.press("Control+k");
  await lead.getByPlaceholder(/Search issues/).fill(`KT-${id}`);
  await expect(lead.getByRole("option", { name: new RegExp(title.slice(6, 30)) })).toBeVisible();
  await lead.keyboard.press("Escape");

  // 4. Lead plans the work and starts it.
  await lead.goto(`/work?issue=${id}`);
  await lead.getByRole("button", { name: "Apply task templates" }).click();
  await moveVia(lead, "Root cause analysis", "In Progress");
  await expect(lead.getByText(`KT-${id} moved to In Progress`)).toBeVisible();

  // 5. A blocker interrupts and is cleared.
  await lead.goto(`/issues?issue=${id}`);
  const drawer = lead.getByTestId("issue-drawer");
  await drawer.getByLabel("Blocker reason").fill("Replacement logger in transit");
  await drawer.getByRole("button", { name: "Add blocker" }).click();
  await expect(drawer.getByTestId("blocked-badge")).toBeVisible();
  await drawer.getByRole("button", { name: "Resolve" }).click();
  await expect(drawer.getByTestId("blocked-badge")).toHaveCount(0);

  // 6. Finish all tasks -> YES -> root cause -> Resolved.
  await lead.goto(`/work?issue=${id}`);
  for (const t of ["Root cause analysis", "Fix implementation", "Fix testing", "SOP update"]) await moveVia(lead, t, "Done");
  await moveVia(lead, "Training", "Done");
  await lead.getByTestId("completion-dialog").getByRole("button", { name: "Yes, resolve issue" }).click();
  await choose(lead, "Root cause", "IT/Equipment");
  await lead.getByRole("button", { name: "Mark as Resolved" }).click();
  await expect(lead.getByText(/asked to confirm/)).toBeVisible();

  // 7. Employee is asked to verify (bell) and confirms the resolution.
  await employee.goto("/issues"); // close the drawer left open by createIssue (its backdrop is modal)
  await openBellItem(employee, /please confirm the resolution/);
  await expect(employee).toHaveURL(new RegExp(`/issues\\?issue=${id}`));
  await employee.getByRole("button", { name: "Confirm Resolution" }).click();
  await expect(employee.getByTestId("closed-panel")).toContainText("confirmed by Kasia Zielinska");

  // 8. Lead is told the loop is closed; the audit log tells the whole story.
  await lead.reload();
  await openBellItem(lead, /confirmed the resolution/);
  const leadDrawer = lead.getByTestId("issue-drawer");
  await leadDrawer.getByRole("tab", { name: "Activity" }).click();
  const log = leadDrawer.getByTestId("activity-log");
  for (const line of [
    "Kasia Zielinska created the issue",
    "Anna Nowak applied task templates (5 tasks)",
    "changed status from New to In Progress",
    'added blocker: "Replacement logger in transit"',
    "resolved blocker",
    "resolved the issue (root cause: IT/Equipment)",
    "Kasia Zielinska confirmed the resolution and closed the issue",
  ]) await expect(log).toContainText(line);

  // 9. The closed issue is reflected in analytics.
  await lead.goto("/dashboard");
  const rc = lead.getByTestId("chart-root-causes");
  await rc.getByRole("tab", { name: "table" }).click();
  await expect(rc.getByRole("row", { name: /IT\/Equipment/ })).not.toContainText(/\b0$/);
  await expect(lead.getByTestId("kpi-sla-value")).not.toHaveText("—");

  expect(errors).toEqual([]);
});
