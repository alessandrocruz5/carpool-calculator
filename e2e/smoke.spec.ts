import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  const response = await page.goto("/");
  // Unauthenticated visitors get redirected to /auth/login, so a 2xx/3xx
  // response chain is fine — we just want the app to be alive.
  expect(response, "navigation response").not.toBeNull();
  expect(response!.status(), "final response status").toBeLessThan(500);
  await expect(page).toHaveURL(/\/(auth\/login)?$/);
});
