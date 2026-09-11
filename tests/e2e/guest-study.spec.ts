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

test('new learners can learn first or use reference mode without faking recall', async ({ page }) => {
  await page.goto('/learn/ip-subnets');

  const reveal = page.getByRole('button', { name: 'Save privately & reveal' });
  await expect(reveal).toBeDisabled();

  await page.getByRole('button', { name: 'Give me a hint' }).click();
  await expect(page.getByText('Directional hint')).toBeVisible();
  await expect(reveal).toBeDisabled();

  await page.getByRole('button', { name: "I haven't learned this yet" }).click();
  await expect(page.getByRole('heading', { name: 'Build the model first.' })).toBeVisible();
  await expect(page.getByLabel('Your explanation')).toBeHidden();
  await page.getByRole('button', { name: 'Try the question now' }).click();
  await expect(page.getByLabel('Your explanation')).toBeVisible();

  await page.getByRole('button', { name: 'Reference', exact: true }).click();
  await expect(page.getByText('Reference lesson')).toBeVisible();
  await expect(page.getByLabel('Your explanation')).toBeHidden();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await expect(page.getByLabel('Your explanation')).toBeVisible();
});

test('public search finds exact canonical content', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('searchbox').fill('container network');
  await expect(page.getByRole('link', { name: /Container networking and storage/ })).toBeVisible();
});

test('primary public pages have no serious automated accessibility violations', async ({ page }) => {
  const routes = ['/', '/kcna', '/paths/kcna', '/learn/kcna-kubernetes-resources-review', '/review', '/map', '/library', '/search'];

  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((nextTheme) => localStorage.setItem('hmrdkn-theme', nextTheme), theme);

    for (const route of routes) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? '')),
        `${route} (${theme}) should have no serious or critical automated accessibility violations`,
      ).toEqual([]);
    }
  }
});
