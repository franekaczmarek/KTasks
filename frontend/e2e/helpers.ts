import { expect, type Page } from "@playwright/test";

export const USERS = {
  lead: "anna.lead@ktasks.dev",
  lead2: "marek.lead@ktasks.dev",
  employee: "kasia@ktasks.dev",
  employee2: "piotr@ktasks.dev",
} as const;

/** Collects browser console errors so tests can assert a clean console. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/issues/);
}

export async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** Creates an issue through the UI and returns its numeric id (drawer is left open). */
export async function createIssue(
  page: Page,
  title: string,
  { area = "Operations", priority = "Medium", effort = "Low", summary = "", dueDate = "", dueReason = "" } = {},
): Promise<number> {
  await page.goto("/issues");
  await page.getByRole("button", { name: "Report issue" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  if (summary) await dialog.getByLabel("Summary").fill(summary);
  await choose(page, "Area", area);
  await choose(page, "Priority", priority);
  await choose(page, "Estimated effort", effort);
  if (dueDate) {
    await dialog.getByLabel(/Proposed due date/).fill(dueDate);
    await dialog.getByLabel(/Why this date/).fill(dueReason);
  }
  await dialog.getByRole("button", { name: "Submit issue" }).click();
  await expect(page).toHaveURL(/\?issue=\d+/);
  return Number(new URL(page.url()).searchParams.get("issue"));
}
