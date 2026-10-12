import { expect, test } from '@playwright/test';
import { open } from './anatomy/helpers';

const CLIENT_EGRESS = 'Apply client-egress (selects role=frontend)';
const WEB_INGRESS = 'Apply web-ingress (selects app=web)';
const ENFORCE = 'CNI enforces NetworkPolicy';

test('a probe result appears only after it is sent, and names the gate that stopped it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'network-policy');
  const report = figure.locator('.anatomy-change');
  await expect(report).toContainText('Ready: every Pod is non-isolated');
  await expect(report).not.toContainText('Dropped at');
  await figure.getByRole('checkbox', { name: CLIENT_EGRESS, exact: true }).check();
  await expect(report).toContainText('client isolated for Egress');
  await figure.getByRole('combobox', { name: /^Probe/ }).selectOption('client-db');
  await expect(report).toContainText('Probe selected; nothing sent');
  await expect(figure.locator('.np-ledger')).toContainText('not run yet');
  await expect(figure.locator('.np-ledger')).not.toContainText('dropped here');
  await figure.getByRole('button', { name: 'Send probe', exact: true }).click();
  await expect(report).toContainText('Dropped at client egress');
  await expect(figure.locator('.np-ledger li').nth(0)).toContainText('dropped here');
  await expect(figure.locator('.np-ledger li').nth(1)).toContainText('not reached');
  await expect(figure.locator('.anatomy-manifest mark').first()).toContainText('role=frontend');
});

test('a probe is still in progress until the cartridge stops, then reports its result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, 'network-policy');
  const report = figure.locator('.anatomy-change');
  await figure.getByRole('button', { name: 'Send probe', exact: true }).click();
  await expect(report).toContainText('Probe in progress');
  await expect(report).not.toContainText('Connection delivered');
  await expect(report).toContainText('Connection delivered', { timeout: 15000 });
  await expect(figure.locator('.np-ledger li:has-text("no policy applies")')).toHaveCount(3);
  await expect(figure.locator('.np-ledger')).not.toContainText('admitted');
});

test('keyboard operates a policy control and the probe, and each change updates the live report', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'network-policy');
  const report = figure.locator('.anatomy-change');
  const webIngress = figure.getByRole('checkbox', { name: WEB_INGRESS, exact: true });
  await webIngress.focus();
  await page.keyboard.press('Space');
  await expect(webIngress).toBeChecked();
  await expect(report).toContainText('web Pods isolated for Ingress');
  const send = figure.getByRole('button', { name: 'Send probe', exact: true });
  await send.focus();
  await page.keyboard.press('Enter');
  await expect(report).toContainText('Connection delivered');
});

test('naming the Service port 80 in web-ingress drops the Service probe at the web ingress gate; naming 8080 delivers it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'network-policy');
  const report = figure.locator('.anatomy-change');
  await figure.getByRole('checkbox', { name: WEB_INGRESS, exact: true }).check();
  await figure.getByRole('combobox', { name: /^web-ingress port/ }).selectOption('80');
  await expect(report).toContainText('The rule now compares against 80');
  await figure.getByRole('button', { name: 'Send probe', exact: true }).click();
  await expect(report).toContainText('Dropped at web-7c9d4-x2kq8 ingress');
  await expect(report).toContainText('client → web-7c9d4-x2kq8:8080 via Service web:80 was dropped at web-7c9d4-x2kq8 ingress');
  await expect(report).toContainText('DNS lookup and client egress were not policed');
  await expect(figure.locator('.np-ledger')).toContainText('dropped here');
  await expect(figure.locator('.np-card[data-pod="web-a"]')).toContainText(/dropped at this Pod.s ingress gate/);
  await figure.getByRole('combobox', { name: /^web-ingress port/ }).selectOption('8080');
  await figure.getByRole('button', { name: 'Send probe', exact: true }).click();
  await expect(report).toContainText('Connection delivered');
  await expect(report).toContainText('Service translated port 80 to 8080');
});

test('a stored policy on a plugin that does not enforce it reports what it would have blocked', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'network-policy');
  const report = figure.locator('.anatomy-change');
  await figure.getByRole('checkbox', { name: WEB_INGRESS, exact: true }).check();
  await figure.getByRole('combobox', { name: /^web-ingress port/ }).selectOption('80');
  await figure.getByRole('checkbox', { name: ENFORCE, exact: true }).uncheck();
  await expect(report).toContainText('Policies stored, not enforced');
  await figure.getByRole('button', { name: 'Send probe', exact: true }).click();
  await expect(report).toContainText('Delivered; a policy would have blocked it');
  await expect(figure.locator('.np-card[data-pod="web-a"]')).toContainText('stored, not enforced');
  await figure.getByRole('checkbox', { name: ENFORCE, exact: true }).check();
  await expect(report).toContainText('Policies now enforced');
});

test('the figure fits a 390px phone with controls, the change report and per-Pod status readable together', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const figure = await open(page, 'network-policy');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(figure.locator('.anatomy-change')).toBeVisible();
  await expect(figure.locator('.np-card').first()).toBeVisible();
  await expect(figure.getByRole('button', { name: 'Send probe', exact: true })).toBeVisible();
});

test('reset returns to the ready state with no applied policy', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'network-policy');
  const report = figure.locator('.anatomy-change');
  await figure.getByRole('checkbox', { name: CLIENT_EGRESS, exact: true }).check();
  await expect(report).toContainText('client isolated for Egress');
  await figure.getByRole('button', { name: 'Reset fixture', exact: true }).click();
  await expect(report).toContainText('Fixture reset');
  await expect(figure.getByRole('checkbox', { name: CLIENT_EGRESS, exact: true })).not.toBeChecked();
});
