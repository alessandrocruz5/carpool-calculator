import { test, expect } from "./fixtures";

const hasSupabaseCreds =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
  !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

test.describe("golden path", () => {
  test.skip(
    !hasSupabaseCreds,
    "Needs Supabase dev branch creds (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"
  );

  test("unauthenticated → login redirect", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("new user can create a group, log a trip, and settle a payment", async ({
    authedPage: page,
  }) => {
    // 1. Authed visit → fresh user has no group → onboarding/groups.
    await page.goto("/");
    await expect(page).toHaveURL(/\/(onboarding|groups)/);

    // 2. Create the group.
    const groupName = `Test Group ${Date.now()}`;
    const nameInput = page.getByLabel(/group name/i).or(page.getByPlaceholder(/group name/i));
    await nameInput.fill(groupName);
    await page.getByRole("button", { name: /create( group)?/i }).click();
    await expect(page.getByText(groupName)).toBeVisible({ timeout: 10_000 });

    // 3. Log a trip with self as driver + 1 passenger.
    await page.goto("/log");
    await page.getByRole("button", { name: /new trip|add trip|log trip/i }).first().click();
    // Add a passenger row — exact UI varies; we rely on role-based selectors.
    await page
      .getByRole("button", { name: /add passenger|add rider/i })
      .first()
      .click();
    await page.getByRole("button", { name: /save|create|submit/i }).first().click();

    // 4. Verify it appears in /payments as outstanding.
    await page.goto("/payments");
    const outstanding = page.getByTestId("outstanding-payments").or(
      page.getByRole("region", { name: /outstanding/i })
    );
    await expect(outstanding).toBeVisible({ timeout: 10_000 });

    // 5. Mark the first outstanding payment as paid.
    const firstPaidButton = page
      .getByRole("button", { name: /mark as paid|paid/i })
      .first();
    await firstPaidButton.click();

    // 6. It should disappear from outstanding.
    await expect(firstPaidButton).toBeHidden({ timeout: 10_000 });
  });
});
