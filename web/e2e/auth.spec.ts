import { test, expect } from "@playwright/test";

const EMAIL = `e2e-${Date.now()}@test.knect.dev`;
const PASSWORD = "e2epassword1";
const NAME = "E2E Customer";

test.describe("Auth flow", () => {
  test.beforeEach(({ page }) => {
    page.on("console", (msg) => {
      console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
    });
  });

  test("registers a new customer account and is redirected to map", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.fill('input[name="display_name"]', NAME);
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
    // Header or home link should be visible
    await expect(page.locator("header")).toContainText("Knect");
  });

  test("redirects to /login if not authenticated on a protected page", async ({ page }) => {
    await page.goto("/jobs");
    await page.waitForURL("/login");
    await expect(page.locator("h1")).toContainText("Sign in");
  });

  test("logs in with existing credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
    await expect(page.locator("nav")).toContainText("My jobs");
  });

  test("signs out and redirects to /login", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // Click user dropdown first to make Sign out visible
    await page.click("button:has-text('E2E')");
    await page.click("text=Sign out");
    await page.waitForURL("/login");
    await expect(page.locator("h1")).toContainText("Sign in");
  });
});
