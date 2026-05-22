import { test, expect } from "@playwright/test";

// Uses the same credentials created in auth.spec.ts
// In CI, run auth.spec.ts first or use a shared state file.
const EMAIL = "e2e-fixture@test.knect.dev"; // pre-seeded fixture account
const PASSWORD = "e2epassword1";

test.describe("Job history page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
  });

  test("navigates to /jobs and shows job list or empty state", async ({
    page,
  }) => {
    await page.click("text=My jobs");
    await page.waitForURL("/jobs");
    await expect(page.locator("h1")).toContainText("My jobs");
    // Either a list or empty state is rendered
    const hasJobs = await page.locator("li").count();
    const hasEmpty = await page.locator("text=No jobs in this category.").count();
    expect(hasJobs + hasEmpty).toBeGreaterThan(0);
  });
});
