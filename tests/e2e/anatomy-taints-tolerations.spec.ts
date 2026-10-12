import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('tolerations only permit a candidate; capacity and other candidates still matter', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'taints-tolerations');
  const attempt = () => figure.getByRole('button', { name: /^(Attempt|Replay) placement$/ });
  const readout = figure.locator('.anatomy-readout');
  await attempt().click();
  await expect(readout).toContainText('Unscheduled');
  await figure.getByRole('combobox', { name: 'Toleration profile', exact: true }).selectOption('equal');
  await attempt().click();
  await expect(readout).toContainText('Assigned: node-a');
  await expect(readout).toContainText('not proof of Running');
  await figure.getByRole('checkbox', { name: 'Node A: enough CPU', exact: true }).uncheck();
  await attempt().click();
  await expect(readout).toContainText('Unscheduled');
  await figure.getByRole('checkbox', { name: 'Node B: available (higher fixture score)', exact: true }).check();
  await figure.getByRole('checkbox', { name: 'Node A: enough CPU', exact: true }).check();
  await attempt().click();
  await expect(readout).toContainText('Assigned: node-b');
  await expect(figure.locator('.tt-facts')).toContainText('taint permits');
});
