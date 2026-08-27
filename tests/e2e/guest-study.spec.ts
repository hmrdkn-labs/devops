import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('guest completes the question-first study flow without persistence', async ({ page }) => {
  await page.goto('/learn/processes-and-resources');
  await expect(page.getByRole('heading', { name: 'Processes and finite resources' })).toBeVisible();
  await expect(page.getByText('Concise model')).toBeHidden();

  await page.getByLabel('Your explanation').fill('A running process has an identity and consumes finite resources.');
  await page.getByRole('button', { name: 'Save privately & reveal' }).click();
  await expect(page.getByText('Concise model')).toBeVisible();
  await page.getByRole('button', { name: 'Good' }).click();
  await expect(page.getByRole('status')).toContainText('Guest answer kept in memory');
  await page.getByRole('button', { name: 'Next question' }).click();

  await page.getByLabel('Your explanation').fill('CPU time, memory, file descriptors, and I/O are finite.');
  await page.getByRole('button', { name: 'Save privately & reveal' }).click();
  await page.getByRole('button', { name: 'Hard' }).click();
  await page.getByRole('button', { name: 'Open the lesson' }).click();
  await expect(page.getByText('Lesson revealed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apply the model safely' })).toBeVisible();
});

test('public search finds exact canonical content', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('searchbox').fill('container network');
  await expect(page.getByRole('link', { name: /Container networking and storage/ })).toBeVisible();
});

test('primary public pages have no serious automated accessibility violations', async ({ page }) => {
  for (const route of ['/', '/paths/from-process-to-pod', '/map', '/library', '/search']) {
    await page.goto(route);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  }
});
