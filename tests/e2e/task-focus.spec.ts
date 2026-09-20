import { expect, test } from '@playwright/test';

for (const response of [{ index: 1, verdict: 'Correct' }, { index: 0, verdict: 'Not quite' }]) {
  test(`mobile checked ${response.verdict.toLowerCase()} feedback is focused and clear of actions`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile sticky feedback contract');
    await page.goto('/lesson/kcna-kubernetes-resources');
    const option = page.locator('.lesson-option').nth(response.index);
    await expect(option).toBeEnabled();
    await option.focus();
    await option.press('Space');
    const check = page.getByTestId('lesson-check');
    await check.focus();
    await check.press('Enter');
    const feedback = page.getByTestId('lesson-feedback');
    const verdict = feedback.locator('.lesson-verdict');
    await expect(verdict).toBeFocused();
    await expect(verdict.locator('strong')).toHaveText(response.verdict);
    await expect(page.getByTestId('lesson-continue')).toBeInViewport();
    const bar = await page.locator('.lesson-actionbar').boundingBox();
    const header = await page.locator('.lesson-player-topbar').boundingBox();
    for (const content of [verdict, feedback.locator(':scope > h2'), feedback.locator(':scope > p')]) {
      await expect(content).toBeInViewport({ ratio: 1 });
      const box = await content.boundingBox();
      expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
      expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
    }
    if (response.index === 0) {
      await page.getByTestId('lesson-retry').click();
      await expect(page.getByTestId('lesson-active-task').locator(':scope > h1')).toBeFocused();
      await expect(feedback).toBeHidden();
    }
  });
}

test('initial lesson actions follow the response without a viewport-sized gap', async ({ page }) => {
  await page.goto('/lesson/kcna-kubernetes-resources');
  const task = page.getByTestId('lesson-active-task');
  await expect(task).toBeVisible();
  expect(await task.evaluate((element) => getComputedStyle(element).minHeight)).toBe('0px');
  expect(await page.locator('.lesson-actionbar').evaluate((element) => getComputedStyle(element).position)).toBe('static');
  const interaction = await page.getByTestId('lesson-interaction').boundingBox();
  const actions = await page.locator('.lesson-actionbar').boundingBox();
  expect(actions!.y - (interaction!.y + interaction!.height)).toBeLessThan(50);
  const models = page.getByTestId('mental-model-links');
  if (await models.count()) {
    await expect(models.locator('summary')).toHaveText('Explore this concept');
    expect(await models.evaluate((element) => element.hasAttribute('open'))).toBe(false);
    expect((await models.boundingBox())!.y).toBeGreaterThan((await task.boundingBox())!.y);
  }
});

test('MCQ starts with the task and explicitly exposes session configuration', async ({ page }) => {
  await page.goto('/practice/kcna');
  await expect(page.locator('#mcq-question-title')).toBeVisible();
  await expect(page.getByRole('button', { name: 'All 63', exact: true })).toBeHidden();
  const options = page.locator('.mcq-session-options');
  await options.locator('summary').click();
  await page.getByRole('button', { name: 'All 63', exact: true }).click();
  await expect(page.locator('.mcq-progress-row')).toContainText('Question 1 / 63');
  await expect(page.locator('#mcq-question-title')).toBeFocused();
  await page.getByRole('button', { name: 'Quick 12', exact: true }).click();
  await page.getByRole('button', { name: 'New mix', exact: true }).click();
  await expect(page.locator('.mcq-progress-row')).toContainText('Question 1 / 12');
});

test('guest review offers public learning and practice destinations', async ({ page }) => {
  await page.route('**/api/review?**', (route) => route.fulfill({ status: 401, body: '{}' }));
  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Review what you learned' })).toBeVisible();
  const guest = page.locator('.review-deck .empty-state');
  await expect(guest.getByRole('link', { name: 'start learning' })).toHaveAttribute('href', '/');
  await expect(guest.getByRole('link', { name: 'practice without signing in' })).toHaveAttribute('href', '/practice');
});

test('unit progress is explicit and does not remount a recall draft', async ({ page }) => {
  await page.goto('/learn/kcna-kubernetes-resources-review');
  const answer = page.locator('#private-answer');
  await expect(answer).toBeEnabled();
  await answer.fill('A draft that should remain mounted.');
  const status = page.getByTestId('learning-status-slot');
  await expect(status.locator('.unit-learning-status')).toBeHidden();
  await status.locator('summary').click();
  await expect(status.getByRole('region', { name: 'Session progress' })).toBeVisible();
  await expect(answer).toHaveValue('A draft that should remain mounted.');
  await status.locator('summary').click();
  await expect(page.getByRole('button', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read lesson', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notes', exact: true })).toBeVisible();
});
