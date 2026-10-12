import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const booth = (figure: Locator, n: number) => figure.getByRole('group', { name: new RegExp(`^Booth ${n}:`) });
const report = (figure: Locator) => figure.locator('.anatomy-change');
const readout = (figure: Locator) => figure.locator('.anatomy-readout');
const send = (figure: Locator) => figure.getByRole('button', { name: /^Send request/ });
const readiness = (row: Locator) => row.getByRole('checkbox', { name: /Readiness probe passes/ });
const sliceRow = (figure: Locator, slot: number) => figure.locator('.sv-slice-row').nth(slot - 1);

test('a failing probe removes one ready endpoint and says what did not happen', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  await expect(readout(figure)).toContainText('3 of 3 Pods are ready endpoints');
  await readiness(booth(figure, 2)).uncheck();
  await expect(report(figure)).toContainText('Endpoint not ready: web-7c9d4-m4l7q');
  await expect(report(figure)).toContainText('stays in the EndpointSlice with ready=false');
  await expect(report(figure)).toContainText('kubelet');
  await expect(report(figure)).toContainText('Running is not Ready');
  await expect(readout(figure)).toContainText('2 of 3 Pods are ready endpoints');
  await expect(readout(figure)).toContainText('ClusterIP 10.96.40.12 unchanged');
  await expect(booth(figure, 2)).toContainText('In EndpointSlice, ready=false');
  await expect(sliceRow(figure, 2)).toContainText('ready=false');
  await expect(sliceRow(figure, 2)).toContainText('slat down');
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'status: "False"' })).toBeVisible();
});

test('row badges follow each change instead of the state at first render', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  await expect(booth(figure, 2)).toContainText('Ready endpoint');
  await readiness(booth(figure, 2)).uncheck();
  await expect(booth(figure, 2)).toContainText('NotReady');
  await expect(booth(figure, 2)).toContainText('In EndpointSlice, ready=false');
  await expect(booth(figure, 2)).not.toContainText('Ready endpoint');
  await readiness(booth(figure, 2)).check();
  await expect(booth(figure, 2)).toContainText('Ready endpoint');
  await booth(figure, 2).getByRole('checkbox', { name: /Label app=web/ }).uncheck();
  await expect(booth(figure, 2)).toContainText('Label app=web-canary: no match');
  await expect(booth(figure, 2)).toContainText('Not in EndpointSlice');
});

test('a request reaches only a ready endpoint, and the booth it reached stays marked', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  await expect(readout(figure)).toContainText('No request sent yet');
  await readiness(booth(figure, 2)).uncheck();
  await send(figure).click();
  await expect(report(figure)).toContainText('Request forwarded to web-7c9d4-k2x8p:8080');
  await expect(figure.locator('.sv-booth').nth(0)).toHaveAttribute('data-served', 'true');
  await send(figure).click();
  await expect(report(figure)).toContainText('Request forwarded to web-7c9d4-r9t2z:8080');
  await expect(figure.locator('.sv-booth').nth(2)).toHaveAttribute('data-served', 'true');
  await expect(figure.locator('.sv-booth[data-served="true"]')).toHaveCount(1);
  await send(figure).click();
  await expect(report(figure)).toContainText('Request forwarded to web-7c9d4-k2x8p:8080');
  await expect(report(figure)).not.toContainText('m4l7q');

  await figure.getByRole('combobox', { name: /Service selector/ }).selectOption('web-next');
  await expect(report(figure)).toContainText('Service selector is now app=web-next');
  await expect(report(figure)).toContainText('No Pod carries app=web-next');
  await expect(readout(figure)).toContainText('0 of 3 Pods are ready endpoints');
  await expect(figure.locator('.sv-booth[data-served="true"]')).toHaveCount(0);
  await send(figure).click();
  await expect(report(figure)).toContainText('No ready endpoint: request not forwarded');
});

test('replacing a Pod gives a fresh name in the same booth and keeps it out of the roster until Ready', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  await figure.getByRole('button', { name: 'Delete Pod web-7c9d4-r9t2z' }).click();
  await expect(report(figure)).toContainText('Replaced web-7c9d4-r9t2z with web-7c9d4-p7w4d');
  await expect(report(figure)).toContainText('was a ready endpoint');
  await expect(report(figure)).toContainText('not an endpoint until its readiness probe passes');
  await expect(readout(figure)).toContainText('2 of 3 Pods are ready endpoints');
  await expect(booth(figure, 3)).toContainText('NotReady');
  await expect(booth(figure, 3)).toContainText('In EndpointSlice, ready=false');
  await expect(booth(figure, 3)).not.toContainText('Ready endpoint');
  await expect(sliceRow(figure, 3)).toContainText('p7w4d');
  await expect(sliceRow(figure, 3)).toContainText('ready=false');
  await readiness(booth(figure, 3)).check();
  await expect(report(figure)).toContainText('Ready endpoint added: web-7c9d4-p7w4d');
  await expect(booth(figure, 3)).toContainText('Ready endpoint');
  await expect(sliceRow(figure, 3)).toContainText('ready=true');
  await expect(readout(figure)).toContainText('3 of 3 Pods are ready endpoints');
  await expect(readout(figure)).toContainText('ClusterIP 10.96.40.12 unchanged');
});

test('a label change moves one Pod out of the roster without touching its readiness', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  await booth(figure, 1).getByRole('checkbox', { name: /Label app=web/ }).uncheck();
  await expect(report(figure)).toContainText('Label changed to app=web-canary: web-7c9d4-k2x8p');
  await expect(report(figure)).toContainText('not recorded in the EndpointSlice');
  await expect(report(figure)).toContainText('does not model the ReplicaSet');
  await expect(booth(figure, 1)).toContainText('Ready');
  await expect(booth(figure, 1)).toContainText('Label app=web-canary: no match');
  await expect(sliceRow(figure, 1)).toContainText('absent');
  await expect(readout(figure)).toContainText('2 of 3 Pods are ready endpoints');
});

test('controls work from the keyboard and the result follows the action', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  await readiness(booth(figure, 2)).focus();
  await page.keyboard.press('Space');
  await expect(report(figure)).toContainText('Endpoint not ready: web-7c9d4-m4l7q');
  await send(figure).focus();
  await page.keyboard.press('Enter');
  await expect(report(figure)).toContainText('Request forwarded to');
});

test('reduced motion shows the result and leaves the request dot stopped', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'service-endpoints');
  await send(figure).click();
  await expect(report(figure)).toContainText('Request forwarded to');
  await expect(figure.locator('.sv-bead')).toHaveAttribute('data-active', 'false');
});

test('wide screens show three non-overlapping booth tags', async ({ page }) => {
  const figure = await open(page, 'service-endpoints');
  const width = page.viewportSize()?.width ?? 0;
  test.skip(width < 560, 'booth tags are hidden below 560px');
  const tags = figure.locator('.sv-tag');
  await expect(tags).toHaveCount(3);
  const boxes = await tags.evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      expect(overlap).toBe(false);
    }
  }
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('controls, result, status and EndpointSlice rows stay usable at 390px with no horizontal overflow', async ({ page }) => {
    const figure = await open(page, 'service-endpoints');
    await expect(figure.locator('.sv-tag').first()).toBeHidden();
    await readiness(booth(figure, 2)).uncheck();
    await expect(report(figure)).toBeVisible();
    await expect(send(figure)).toBeVisible();
    await expect(sliceRow(figure, 2)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
