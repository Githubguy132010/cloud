import { test, expect } from '@chromatic-com/playwright';

test.describe('Customer Source Survey', () => {
  test('survey page renders with title and form elements', async ({ page }) => {
    await page.goto('/customer-source-survey');

    // Should show the survey question
    await expect(page.getByText('Where did you hear about Kilo Code?')).toBeVisible();

    // Should have a textarea with placeholder
    const textarea = page.getByPlaceholder('Example: A YouTube video from Theo');
    await expect(textarea).toBeVisible();

    // Should have a skip link and a disabled submit button
    await expect(page.getByRole('link', { name: 'Skip' })).toBeVisible();
    const submitButton = page.getByRole('button', { name: 'Submit' });
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeDisabled();
  });

  test('submit button enables when text is entered', async ({ page }) => {
    await page.goto('/customer-source-survey');

    const textarea = page.getByPlaceholder('Example: A YouTube video from Theo');
    const submitButton = page.getByRole('button', { name: 'Submit' });

    // Initially disabled
    await expect(submitButton).toBeDisabled();

    // Type something
    await textarea.fill('A friend told me about it');
    await expect(submitButton).toBeEnabled();

    // Clear it — should be disabled again
    await textarea.fill('   ');
    await expect(submitButton).toBeDisabled();
  });

  test('skip link navigates to get-started', async ({ page }) => {
    await page.goto('/customer-source-survey');

    await page.getByRole('link', { name: 'Skip' }).click();
    await page.waitForURL(url => url.pathname === '/get-started', { timeout: 10000 });
  });

  test('skip link respects callbackPath', async ({ page }) => {
    await page.goto('/customer-source-survey?callbackPath=%2Fprofile');

    const skipLink = page.getByRole('link', { name: 'Skip' });
    await expect(skipLink).toHaveAttribute('href', '/profile');
  });

  test('submitting response redirects to get-started', async ({ page }) => {
    await page.goto('/customer-source-survey');

    const textarea = page.getByPlaceholder('Example: A YouTube video from Theo');
    await textarea.fill('Twitter / X');

    await page.getByRole('button', { name: 'Submit' }).click();

    // Should redirect after submit
    await page.waitForURL(url => url.pathname === '/get-started', { timeout: 10000 });
  });

  test('already-answered users are redirected past survey', async ({ page }) => {
    // First, submit a response
    await page.goto('/customer-source-survey');
    const textarea = page.getByPlaceholder('Example: A YouTube video from Theo');
    await textarea.fill('Reddit');
    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForURL(url => url.pathname === '/get-started', { timeout: 10000 });

    // Now revisit the survey — should redirect past it
    await page.goto('/customer-source-survey');
    await page.waitForURL(url => url.pathname === '/get-started', { timeout: 10000 });
  });
});
