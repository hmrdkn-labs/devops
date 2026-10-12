import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('resource widgets agree with the model and failed feasibility cannot be scored', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'scheduling-placement');
  const cpu = figure.getByRole('combobox', { name: 'CPU request', exact: true });
  const memory = figure.getByRole('combobox', { name: 'Memory request', exact: true });
  const assertRequest = async () => {
    const shown = `${await cpu.inputValue()}m / ${await memory.inputValue()}Mi`;
    for (const node of await figure.locator('.capacity-node').all()) {
      await expect(node.locator('dd').last()).toHaveText(shown);
    }
  };
  await assertRequest();
  await figure.getByRole('button', { name: '1 · Filter budgets', exact: true }).click();
  await figure.getByRole('button', { name: '2 · Score eligible nodes', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('nodeName still empty');
  await figure.getByRole('button', { name: '3 · Record assignment', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('nodeName node-c · containers not started');
  await cpu.selectOption('1500');
  await assertRequest();
  await figure.getByRole('button', { name: '1 · Filter budgets', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('Unscheduled');
  await expect(figure.locator('.anatomy-readout')).toContainText('nodeName empty');
  await expect(figure.getByRole('button', { name: '2 · Score eligible nodes', exact: true })).toBeDisabled();
  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  await assertRequest();
});
