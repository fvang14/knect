import { test, expect } from "@playwright/test";

const BASE_EMAIL = `e2e-settings-${Date.now()}@test.knect.dev`;
const INITIAL_PASSWORD = "e2epassword1";
const NEW_PASSWORD = "e2epassword2";
const INITIAL_NAME = "E2E User";
const UPDATED_NAME = "E2E ChangedName";
const UPDATED_EMAIL = `e2e-updated-${Date.now()}@test.knect.dev`;

// A 1x1 transparent PNG file buffer
const mockAvatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("Settings and Locked Map E2E Flow", () => {
  test("full settings lifecycle", async ({ page }) => {
    // 1. Unauthenticated landing: Verify locked map preview is shown
    await page.goto("/");
    await expect(page.locator('[data-testid="locked-map-container"]')).toBeVisible();
    await expect(page.locator("text=Sign in to view live map")).toBeVisible();

    // 2. Registration
    await page.goto("/register");
    await page.fill('input[name="display_name"]', INITIAL_NAME);
    await page.fill('input[name="email"]', BASE_EMAIL);
    await page.fill('input[name="password"]', INITIAL_PASSWORD);
    await page.click('button[type="submit"]');

    // Should redirect to homepage (authenticated)
    await page.waitForURL("/");
    await expect(page.locator("nav")).toContainText("My jobs");

    // 3. Navigate to Settings page via user dropdown
    // Dropdown button has the user's first name
    const userButton = page.locator('button:has-text("E2E")');
    await userButton.click();
    await page.click('text=Settings');
    await page.waitForURL("/settings");

    // Verify settings panels are visible
    await expect(page.locator("h2:has-text('Profile Settings')")).toBeVisible();
    await expect(page.locator("h2:has-text('Email Address')")).toBeVisible();
    await expect(page.locator("h2:has-text('Change Password')")).toBeVisible();
    await expect(page.locator("h2:has-text('Danger Zone')")).toBeVisible();

    // 4. Update Profile Display Name
    const profileForm = page.locator("form:has-text('Display Name')");
    await profileForm.locator("input[type='text']").fill(UPDATED_NAME);
    await profileForm.locator("button:has-text('Save changes')").click();
    await expect(page.locator("text=Profile updated successfully")).toBeVisible();

    // 5. Upload Avatar
    await page.setInputFiles("#avatar-upload", {
      name: "avatar.png",
      mimeType: "image/png",
      buffer: mockAvatarPng,
    });
    await expect(page.locator("text=Avatar uploaded successfully")).toBeVisible();
    // Verify "Remove" button is visible
    const removeBtn = page.locator("button:has-text('Remove')");
    await expect(removeBtn).toBeVisible();

    // 6. Delete Avatar
    await removeBtn.click();
    await expect(page.locator("text=Avatar removed successfully")).toBeVisible();
    await expect(removeBtn).not.toBeVisible();

    // 7. Update Email Address
    await page.fill('input[type="email"]', UPDATED_EMAIL);
    // Find the save changes button in the email form specifically
    const emailForm = page.locator("form:has-text('Email Address')");
    await emailForm.locator("button:has-text('Save changes')").click();
    await expect(page.locator("text=Email updated successfully")).toBeVisible();

    // 8. Change Password
    const passwordForm = page.locator("form:has-text('Current Password')");
    await passwordForm.locator('input[type="password"]').first().fill(INITIAL_PASSWORD);
    await passwordForm.locator('input[type="password"]').nth(1).fill(NEW_PASSWORD);
    await passwordForm.locator("button:has-text('Change password')").click();
    await expect(page.locator("text=Password changed successfully")).toBeVisible();

    // 9. Sign Out
    await userButton.click();
    await page.click('text=Sign out');
    await page.waitForURL("/login");

    // 10. Log back in with the updated credentials
    await page.fill('input[name="email"]', UPDATED_EMAIL);
    await page.fill('input[name="password"]', NEW_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");

    // 11. Navigate back to Settings to delete account
    await userButton.click();
    await page.click('text=Settings');
    await page.waitForURL("/settings");

    // Click Delete Account to open dialog
    await page.click("button:has-text('Delete Account')");
    await expect(page.locator("h2:has-text('Delete Account')")).toBeVisible();

    // Fill confirm email and submit
    await page.fill('input[placeholder="' + UPDATED_EMAIL + '"]', UPDATED_EMAIL);
    await page.click("button:has-text('Delete permanently')");

    // Should redirect to register page upon successful deletion
    await page.waitForURL("/register");

    // 12. Verify that we can register again with the same email address
    await page.fill('input[name="display_name"]', INITIAL_NAME);
    await page.fill('input[name="email"]', UPDATED_EMAIL);
    await page.fill('input[name="password"]', INITIAL_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL("/");
    await expect(page.locator("nav")).toContainText("My jobs");
  });
});
