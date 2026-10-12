import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const changeTitle = (figure: Locator) => figure.locator('.anatomy-change-title');
const button = (figure: Locator, name: string) => figure.getByRole('button', { name, exact: true });
const hops = (figure: Locator) => figure.locator('.netpod-hops li');

async function deleteAndStepTo(figure: Locator, stepCount: number) {
  await button(figure, 'Delete api Pod').click();
  for (let step = 0; step < stepCount; step++) await button(figure, 'Step pod setup').click();
}

test('replacing the api Pod walks one owner boundary per step and assigns the new address only at networking', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-networking-cni');
  const step = button(figure, 'Step pod setup');
  await button(figure, 'Delete api Pod').click();
  await expect(changeTitle(figure)).toHaveText('api u2 deleted');
  await expect(figure.locator('.netpod-ledger')).toContainText('10.244.2.7');

  await step.click();
  await expect(changeTitle(figure)).toHaveText('Replacement api u3 created');
  await step.click();
  await expect(changeTitle(figure)).toHaveText('Scheduler bound api u3 to node-b');
  await step.click();
  await expect(changeTitle(figure)).toHaveText('Sandbox created on node-b');
  await step.click();
  await expect(changeTitle(figure)).toHaveText('CNI plugin gave api u3 10.244.2.8');
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'podIP: 10.244.2.8' })).toHaveCount(1);
  await step.click();
  await expect(changeTitle(figure)).toHaveText('api u3 Running on 10.244.2.8');
  await expect(figure.locator('.netpod-track li[data-stage="ready"]')).toHaveAttribute('data-state', 'todo');
  await step.click();
  await expect(changeTitle(figure)).toHaveText('api u3 Ready');
  await expect(step).toBeDisabled();
});

test('a Running Pod answers direct Pod-IP traffic but not Service traffic until Ready; kube-proxy fails only the Service path', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-networking-cni');
  await deleteAndStepTo(figure, 5);
  await expect(changeTitle(figure)).toHaveText('api u3 Running on 10.244.2.8');

  await button(figure, 'Send request to api Pod IP').click();
  await expect(changeTitle(figure)).toHaveText('Request reached api at 10.244.2.8');
  await expect(hops(figure).nth(4)).toHaveAttribute('data-verdict', 'pass');

  await button(figure, 'Send request to api Service 10.96.0.20').click();
  await expect(changeTitle(figure)).toHaveText('Request stopped at ready endpoint');
  await expect(figure.locator('.netpod-hops li[data-verdict="stop"]')).toContainText('ready endpoint');
  await expect(figure.locator('.netpod-hops li[data-verdict="skip"]')).toHaveCount(3);

  await button(figure, 'Stop kube-proxy on node-a').click();
  await expect(changeTitle(figure)).toHaveText('kube-proxy stopped on node-a');
  await button(figure, 'Send request to api Pod IP').click();
  await expect(changeTitle(figure)).toHaveText('Request reached api at 10.244.2.8');
  await button(figure, 'Send request to api Service 10.96.0.20').click();
  await expect(changeTitle(figure)).toHaveText('Request stopped at Service 10.96.0.20:80 rule');
});

test('a NetworkPolicy blocks traffic only where the installed CNI enforces it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-networking-cni');
  await button(figure, 'Create api-deny-ingress policy').click();
  await expect(changeTitle(figure)).toHaveText('NetworkPolicy api-deny-ingress created');
  await expect(figure.locator('.netpod-gate-tag')).toContainText('enforced');
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'name: api-deny-ingress' })).toHaveCount(1);

  await button(figure, 'Send request to api Pod IP').click();
  await expect(changeTitle(figure)).toHaveText('Request stopped at NetworkPolicy');
  await expect(figure.locator('.netpod-hops li[data-verdict="stop"]')).toContainText('Installed CNI enforcement');

  await figure.getByRole('combobox', { name: 'Installed CNI', exact: true }).selectOption('no');
  await expect(changeTitle(figure)).toHaveText('Installed CNI does not enforce NetworkPolicy');
  await expect(figure.locator('.netpod-gate-tag')).toContainText('object only');
  await button(figure, 'Send request to api Pod IP').click();
  await expect(changeTitle(figure)).toHaveText('Request reached api at 10.244.2.7');
});

test('a missing CNI plugin on node-b blocks the next setup step without giving the Pod an address', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-networking-cni');
  await deleteAndStepTo(figure, 3);
  await expect(changeTitle(figure)).toHaveText('Sandbox created on node-b');

  await button(figure, 'Remove CNI plugin from node-b').click();
  await button(figure, 'Step pod setup').click();
  await expect(changeTitle(figure)).toHaveText('Network setup failed on node-b');
  await expect(figure.locator('.netpod-track li[data-stage="sandbox"]')).toHaveAttribute('data-state', 'current');
  await expect(figure.locator('.netpod-status')).toContainText('Next step blocked');

  await button(figure, 'Install CNI plugin on node-b').click();
  await button(figure, 'Step pod setup').click();
  await expect(changeTitle(figure)).toHaveText('CNI plugin gave api u3 10.244.2.8');
});

test('keyboard activates the delete control and the step control', async ({ page }) => {
  const figure = await open(page, 'pod-networking-cni');
  const remove = button(figure, 'Delete api Pod');
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('api u2 deleted');
  const step = button(figure, 'Step pod setup');
  await expect(step).toBeEnabled({ timeout: 5000 });
  await step.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('Replacement api u3 created');
});

test('390px phone shows the request result and status without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-networking-cni');
  await button(figure, 'Send request to api Pod IP').click();
  await expect(changeTitle(figure)).toHaveText('Request reached api at 10.244.2.7');
  await expect(figure.locator('.netpod-hops')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
