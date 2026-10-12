import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('a Service name answers only from an existing Service, and results wait for the press', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'dns-ingress');
  const title = figure.locator('.anatomy-change-title');
  await expect(title).toHaveText('Nothing has run yet');
  await expect(figure.locator('[data-object="client-resolver"]')).toContainText('Not run');

  await figure.getByRole('combobox', { name: 'Name the client asks for', exact: true }).selectOption('ledger');
  await expect(figure.locator('[data-object="client-resolver"]')).toContainText('Not run');
  await figure.getByRole('button', { name: 'Resolve name from client Pod', exact: true }).click();
  await expect(title).toHaveText('No DNS answer for this name');
  await expect(figure.locator('.anatomy-change')).toContainText('ledger.shop.svc.cluster.local');

  await figure.getByRole('combobox', { name: 'Name the client asks for', exact: true }).selectOption('ledger.billing');
  await figure.getByRole('button', { name: 'Resolve name from client Pod', exact: true }).click();
  await expect(title).toHaveText('Name answered by Service ledger');
  await expect(figure.locator('.anatomy-change dt')).toHaveText(['Changed', 'Who', 'Why', 'Not yet']);
});

test('a name can answer while the Service has no Ready endpoint', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'dns-ingress');
  const title = figure.locator('.anatomy-change-title');
  await figure.getByRole('checkbox', { name: 'web-7c9d4-k2xqp Ready', exact: true }).uncheck();
  await expect(title).toHaveText('web-7c9d4-k2xqp Not Ready');
  await figure.getByRole('checkbox', { name: 'web-7c9d4-w8mvn Ready', exact: true }).uncheck();
  await expect(title).toHaveText('web-7c9d4-w8mvn Not Ready');
  await expect(figure.locator('.anatomy-readout')).toContainText('Ready endpoints for web: 0 of 2');

  await figure.getByRole('button', { name: 'Send in-cluster request', exact: true }).click();
  await expect(title).toHaveText('No ready endpoint for Service web');
  await expect(figure.locator('.anatomy-change')).toContainText('10.96.20.10');
  await expect(figure.locator('[data-object="service-web"]')).toContainText('ready endpoints 0 of 2');
  await expect(figure.locator('[data-object="web-7c9d4-k2xqp"]')).toContainText('Not Ready');
});

test('an external request stops at the TLS gate, and the card and trail show where it rested', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'dns-ingress');
  const svg = figure.locator('svg.nw-svg');
  const title = figure.locator('.anatomy-change-title');
  const checks = figure.locator('[aria-label="Checks from the last runs"]');

  await figure.getByRole('checkbox', { name: 'Secret shop-tls present', exact: true }).uncheck();
  await figure.getByRole('button', { name: 'Send external HTTP request', exact: true }).click();
  await expect(title).toHaveText('No certificate for shop.example.com at the gate');
  await expect(checks).toContainText('not reached');
  await expect(svg).toHaveAttribute('data-run-outcome', 'stopped');
  await expect(svg).toHaveAttribute('data-run-stop', 'gate');
  await expect(svg.locator('.nw-stop')).toHaveCount(1);
  await expect(figure.locator('[data-seg="outside-gate"]')).toHaveAttribute('data-passed', 'true');
  await expect(figure.locator('[data-seg="gate-web"]')).toHaveAttribute('data-passed', 'false');
  await expect(figure.locator('[data-object="service-web"]')).toContainText('ready endpoints 2 of 2');
  await expect(figure.locator('.anatomy-change dt')).toHaveText(['Changed', 'Who', 'Why', 'Not yet']);

  await figure.getByRole('checkbox', { name: 'Secret shop-tls present', exact: true }).check();
  await figure.getByRole('checkbox', { name: 'Edge controller running for class edge-proxy', exact: true }).uncheck();
  await expect(title).toHaveText('Edge controller stopped');
  await figure.getByRole('button', { name: 'Send external HTTP request', exact: true }).click();
  await expect(title).toHaveText('Nothing answers at the edge address');
  await expect(svg).toHaveAttribute('data-run-stop', 'outside');
  await expect(figure.locator('[data-seg="outside-gate"]')).toHaveAttribute('data-passed', 'false');
});

test('keyboard sends a request through to a Ready Pod, and Reset returns the start state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'dns-ingress');
  const svg = figure.locator('svg.nw-svg');
  const title = figure.locator('.anatomy-change-title');
  await figure.getByRole('button', { name: 'Send external HTTP request', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(title).toHaveText('Request forwarded to web-7c9d4-k2xqp:8080 by the controller');
  await expect(figure.locator('[aria-label="Checks from the last runs"]')).toContainText('Ready endpoint behind web');
  await expect(svg).toHaveAttribute('data-run-outcome', 'delivered');
  await expect(svg).toHaveAttribute('data-run-stop', 'web-7c9d4-k2xqp');
  await expect(svg.locator('.nw-stop')).toHaveCount(0);
  await expect(figure.locator('[data-seg="gate-web"]')).toHaveAttribute('data-passed', 'true');

  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(title).toHaveText('Nothing has run yet');
  await expect(svg).toHaveAttribute('data-run-outcome', 'idle');
  await expect(figure.locator('.anatomy-readout')).toContainText('Ready endpoints for web: 2 of 2');
});

test('phone width keeps controls and the change report on screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'dns-ingress');
  await expect(figure.locator('[aria-live]')).toHaveCount(1);
  await figure.getByRole('button', { name: 'Resolve name from client Pod', exact: true }).click();
  await expect(figure.locator('.anatomy-change-title')).toHaveText('Name answered by Service web');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
