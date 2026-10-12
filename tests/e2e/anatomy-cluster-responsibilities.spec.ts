import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('cluster checkpoints separate API objects, assignment and node-side execution', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'cluster-responsibilities');
  const next = figure.getByRole('button', { name: 'Next checkpoint', exact: true });
  const value = (label: string) => figure.locator('.cc-state > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
  for (let i = 0; i < 4; i++) await next.click();
  await expect(value('Pod objects')).toHaveText('1');
  await expect(value('Assigned node')).toHaveText('unassigned');
  await expect(value('Running containers')).toHaveText('0');
  await next.click();
  await expect(value('Assigned node')).toHaveText('node-a');
  await expect(value('Running containers')).toHaveText('0');
  await next.click();
  await expect(value('Running containers')).toHaveText('0');
  await next.click();
  await expect(value('Running containers')).toHaveText('1');
  await expect(value('API Pod status')).toHaveText('Running reported');
  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(value('Pod objects')).toHaveText('0');
  await expect(value('Running containers')).toHaveText('0');
});

test('inspection moves a real drawer by keyboard without changing workload state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, 'cluster-responsibilities');
  const drawer = figure.locator('.cc-assembly[data-selected="true"]');
  const before = await drawer.boundingBox();
  const inspect = figure.getByRole('button', { name: 'Open inspection drawer', exact: true });
  await inspect.focus();
  await inspect.press('Enter');
  await expect(figure.getByRole('button', { name: 'Close inspection drawer', exact: true })).toBeEnabled();
  await expect.poll(async () => (await drawer.boundingBox())!.x).not.toBe(before!.x);
  await expect(figure.locator('.cc-state > div').filter({ has: page.locator('dt', { hasText: 'Running containers' }) }).locator('dd')).toHaveText('0');
  await expect(figure.locator('.cc-state > div').filter({ has: page.locator('dt', { hasText: 'Pod objects' }) }).locator('dd')).toHaveText('0');
});
