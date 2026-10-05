import { expect, type Page, test } from "@playwright/test";

import { login, trackConsoleErrors, USERS } from "./helpers";

const uniqueEmail = (tag: string) => `e2e+${tag}${Date.now()}@ktasks.dev`;

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("self-registration creates an Employee and signs them in", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/register/);

  const email = uniqueEmail("self");
  await page.getByLabel("Full name").fill("Zofia Nowicka");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Welcome#2026");
  await page.getByLabel("Confirm password").fill("Welcome#20xx");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Passwords do not match." })).toBeVisible();

  await page.getByLabel("Confirm password").fill("Welcome#2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/issues/);

  await page.getByRole("button", { name: "User menu" }).click();
  await expect(page.getByRole("menu")).toContainText("Zofia Nowicka");
  await expect(page.getByRole("menu")).toContainText("employee");
  await expect(page.getByRole("menuitem", { name: "User management" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Registering the same email again is refused.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/); // wait for the session to be cleared (proxy redirects signed-in users)
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Duplicate");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Welcome#2026");
  await page.getByLabel("Confirm password").fill("Welcome#2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already exists" })).toBeVisible();
  expect(errors.filter((e) => !e.includes("409"))).toEqual([]); // the 409 response itself is expected
});

test("lead admin panel: create, promote, deactivate and reactivate a user", async ({ page, browser }) => {
  const errors = trackConsoleErrors(page);
  await login(page, USERS.lead);
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "User management" }).click();
  await expect(page.getByRole("heading", { name: "User management" })).toBeVisible();
  await expect(page.getByTestId(`user-row-${USERS.lead}`)).toContainText("Owns Operations, Process");

  // Create an employee with a generated password.
  const email = uniqueEmail("admin");
  await page.getByRole("button", { name: "Add user" }).click();
  await page.getByLabel("Full name").fill("Tomasz Admin-Created");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Create account" }).click();
  const temp = (await page.getByTestId("temp-password").innerText()).trim();
  expect(temp.length).toBeGreaterThanOrEqual(12);
  await page.getByRole("button", { name: "Done" }).click();
  const row = page.getByTestId(`user-row-${email}`);
  await expect(row).toContainText("Employee");
  await expect(row).toContainText("Active");

  // The new person can sign in with it.
  const newbie = await (await browser.newContext()).newPage();
  await signIn(newbie, email, temp);
  await expect(newbie).toHaveURL(/\/issues/);

  // Promote to Lead.
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Make Lead" }).click();
  await expect(row).toContainText("Lead");
  await expect(page.getByText("Tomasz Admin-Created is now a Lead")).toBeVisible();

  // Deactivate: sign-in is refused.
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Deactivate" }).click();
  await expect(row).toContainText("Deactivated");
  const blocked = await (await browser.newContext()).newPage();
  await signIn(blocked, email, temp);
  await expect(blocked.getByRole("alert").filter({ hasText: /banned/i })).toBeVisible();

  // Reactivate.
  await row.getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Reactivate" }).click();
  await expect(row).toContainText("Active");

  // Area Leads can't be demoted until replaced.
  await page.getByTestId(`user-row-${USERS.lead2}`).getByRole("button", { name: /Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Make Employee" }).click();
  await expect(page.getByText(/owns Improvements/)).toBeVisible();

  // Promoted user is offered in Lead pickers (e.g. area assignment).
  await page.goto("/settings");
  await page.getByRole("combobox", { name: "Operations lead" }).click();
  await expect(page.getByRole("option", { name: "Tomasz Admin-Created · Lead" })).toBeVisible();
  await page.keyboard.press("Escape");

  expect(errors.filter((e) => !e.includes("409"))).toEqual([]);
});

test("employees cannot open the admin panel", async ({ page }) => {
  await login(page, USERS.employee);
  await page.goto("/admin/users");
  await expect(page.getByText("Only Leads and Directors can manage user accounts.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add user" })).toHaveCount(0);
});

test("signed-in user changes their own password", async ({ page }) => {
  const errors = trackConsoleErrors(page);
  const email = uniqueEmail("pw");
  await page.goto("/register");
  await page.getByLabel("Full name").fill("Password Changer");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Original#2026");
  await page.getByLabel("Confirm password").fill("Original#2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/issues/);

  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Change password" }).click();
  const dialog = page.getByTestId("change-password-dialog");
  const submit = dialog.getByRole("button", { name: "Change password" });

  // Client-side checks.
  await dialog.getByLabel("Current password").fill("Original#2026");
  await dialog.getByLabel("New password", { exact: true }).fill("Newpass#2026");
  await dialog.getByLabel("Confirm new password").fill("Newpass#2027");
  await expect(dialog.getByRole("alert")).toHaveText("Passwords do not match.");
  await expect(submit).toBeDisabled();

  // Wrong current password is rejected by the server.
  await dialog.getByLabel("Current password").fill("Wrong#2026");
  await dialog.getByLabel("Confirm new password").fill("Newpass#2026");
  await submit.click();
  await expect(dialog.getByRole("alert")).toHaveText("Current password is incorrect");

  // Correct current password: changed.
  await dialog.getByLabel("Current password").fill("Original#2026");
  await submit.click();
  await expect(page.getByText("Password changed")).toBeVisible();
  await expect(dialog).toHaveCount(0);

  // Old password no longer works, the new one does.
  await page.getByRole("button", { name: "User menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await signIn(page, email, "Original#2026");
  await expect(page.getByRole("alert").filter({ hasText: /invalid login credentials/i })).toBeVisible();
  await signIn(page, email, "Newpass#2026");
  await expect(page).toHaveURL(/\/issues/);

  expect(errors.filter((e) => !e.includes("403") && !e.includes("400"))).toEqual([]); // expected rejections
});
