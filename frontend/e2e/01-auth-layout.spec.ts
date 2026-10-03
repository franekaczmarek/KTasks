import { expect, test } from "@playwright/test";

import { login, trackConsoleErrors, USERS } from "./helpers";

test("unauthenticated users are redirected to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
});

test("wrong password shows an error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USERS.employee);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Next.js renders its own empty role="alert" route announcer, so match by text.
  await expect(page.getByRole("alert").filter({ hasText: /invalid login credentials/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("employee: login, navigate tabs, command palette, no lead settings", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page, USERS.employee);

  const nav = page.getByRole("navigation", { name: "Main" });
  for (const tab of ["Discussions", "Dashboard", "Work", "Issues"]) {
    await nav.getByRole("link", { name: tab }).click();
    await expect(page.getByRole("heading", { level: 1, name: tab })).toBeVisible();
    await expect(nav.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page");
  }

  // Ctrl+K opens the palette; selecting a navigation entry routes there.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  await expect(palette.getByPlaceholder(/Search issues/)).toBeVisible();
  await palette.getByRole("option", { name: "Dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(palette).toBeHidden();

  // Typing runs a server search (no matches yet -> empty state).
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Search issues/).fill("zzz-no-such-thing");
  await expect(page.getByText("No results found.")).toBeVisible();
  await page.keyboard.press("Escape");

  // Employees don't get the Lead settings menu entry.
  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Lead settings" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  expect(errors).toEqual([]);
});

test("lead: mark absent routes area to backup, then restore", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await login(page, USERS.lead2); // Marek manages Anna's absence
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Lead settings" }).click();
  await expect(page.getByRole("heading", { name: "Lead settings" })).toBeVisible();

  const ops = page.getByTestId("area-Operations");
  const anna = page.getByTestId(`lead-${USERS.lead}`);
  await expect(ops.getByTestId("effective-lead")).toHaveText("Anna Nowak");

  await anna.getByRole("button", { name: "Mark absent" }).click();
  await expect(ops.getByTestId("effective-lead")).toHaveText("Marek Wilk");
  await expect(ops.getByText("Backup active")).toBeVisible();

  await anna.getByRole("button", { name: "Mark available" }).click();
  await expect(ops.getByTestId("effective-lead")).toHaveText("Anna Nowak");

  expect(errors).toEqual([]);
});
