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
