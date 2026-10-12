import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('replica replacement gets a fresh identity and rollout respects surge and availability', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'replica-reconciliation');
  const desired = figure.getByRole('combobox', { name: 'Desired replicas', exact: true });
  const readout = figure.locator('.anatomy-readout');
  const identities = figure.locator('.replica-ledger li strong');
  const originalIds = await identities.allTextContents();
  const initialDesired = Number(await desired.inputValue());
  await expect(readout).toContainText(`Deployment desired ${initialDesired}`);
  const removed = originalIds[1]!;
  await figure.getByRole('combobox', { name: 'Pod identity', exact: true }).selectOption(removed.slice(1));
  await figure.getByRole('button', { name: 'Delete selected Pod', exact: true }).click();
  await expect(identities.filter({ hasText: new RegExp(`^${removed}$`) })).toHaveCount(0);
  await expect(readout).toContainText(`Observed non-terminating Pods ${initialDesired - 1}`);
  const step = figure.getByRole('button', { name: 'Step reconciliation', exact: true });
  await step.click();
  const replacements = (await identities.allTextContents()).filter((id) => !originalIds.includes(id));
  expect(replacements).toHaveLength(1);
  expect(replacements[0]).not.toBe(removed);
  await expect(readout).toContainText(`Ready ${initialDesired - 1}`);
  await step.click();
  await expect(readout).toContainText(`Ready ${initialDesired}`);
  await desired.selectOption('4');
  for (let i = 0; i < 12 && !(await readout.locator('strong').textContent())?.startsWith('Converged'); i++) await step.click();
  await expect(readout).toContainText('Observed non-terminating Pods 4 · Ready 4');
  await figure.getByRole('button', { name: 'Change template to app:v2', exact: true }).click();
  for (let i = 0; i < 40 && !(await readout.locator('strong').textContent())?.startsWith('Converged'); i++) {
    await step.click();
    expect(await figure.locator('.replica-ledger li').count()).toBeLessThanOrEqual(5);
    const readyCount = (await readout.textContent())!.match(/\bReady (\d+)/);
    expect(Number(readyCount?.[1])).toBeGreaterThanOrEqual(4);
  }
  await expect(readout.locator('strong')).toHaveText('Converged');
  await expect(readout).toContainText('RS-v1 target 0 / observed 0');
  await expect(readout).toContainText('RS-v2 target 4 / observed 4');
  await expect(figure.locator('.replica-ledger li')).toHaveCount(4);
});
