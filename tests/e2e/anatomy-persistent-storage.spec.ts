import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const button = (figure: Locator, name: string) => figure.getByRole('button', { name, exact: true });
const select = (figure: Locator, name: RegExp) => figure.getByRole('combobox', { name });
const highlighted = (figure: Locator, text: string) => figure.locator('.anatomy-manifest mark', { hasText: text });
const title = (figure: Locator) => figure.locator('.anatomy-change-title');
const settled = (figure: Locator) => expect(figure.locator('.anatomy-change')).toHaveAttribute('aria-busy', 'false', { timeout: 10_000 });

interface Box { id: string | null; left: number; right: number; top: number; bottom: number }

/** Boxes of the overlay tags that are actually visible, in CSS pixels. */
async function visibleTagBoxes(figure: Locator): Promise<Box[]> {
  return figure.locator('.pv-tag:visible').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.getAttribute('data-tag'), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  }));
}

function overlapping(boxes: Box[]): Array<[string | null, string | null]> {
  const pairs: Array<[string | null, string | null]> = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pairs.push([a.id, b.id]);
    }
  }
  return pairs;
}

test('an Immediate claim binds a volume before any Pod exists, with one live region', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await expect(figure.locator('[aria-live]')).toHaveCount(1);
  await button(figure, 'Create claim').click();
  const report = figure.locator('.anatomy-change');
  await expect(title(figure)).toHaveText('PVC ledger Bound to pvc-4f2a');
  await expect(report.locator('dd').nth(1)).toContainText('fast-zonal provisioner');
  await expect(report.locator('dt', { hasText: 'Not yet' })).toBeVisible();
  await expect(figure.locator('.pv-objects')).toContainText('Bound to pvc-4f2a');
  await expect(highlighted(figure, 'volumeName: pvc-4f2a')).toHaveCount(1);
});

test('a Pod cannot be placed on a node outside the bound volume zone, and its node choice is fixed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await button(figure, 'Create claim').click();
  await select(figure, /Next Pod node/).selectOption('node-b');
  await button(figure, 'Create writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-1 stays Pending');
  await expect(figure.locator('.pv-objects')).toContainText('Pending: volume in zone a excludes node-b');
  await expect(figure.locator('.anatomy-manifest')).not.toContainText('nodeName:');
  await expect(highlighted(figure, 'kubernetes.io/hostname: node-b')).toHaveCount(1);
  await expect(select(figure, /Next Pod node/)).toBeDisabled();
  await expect(button(figure, 'Writer appends a row')).toBeDisabled();
});

test('WaitForFirstConsumer leaves the claim Pending until the Pod picks the zone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await select(figure, /Volume binding mode/).selectOption('WaitForFirstConsumer');
  await expect(title(figure)).toHaveText('Scenario reset for a new claim');
  await button(figure, 'Create claim').click();
  await expect(title(figure)).toHaveText('PVC ledger Pending by design');
  await expect(figure.locator('.pv-objects')).toContainText('Pending: no volume yet');
  await select(figure, /Next Pod node/).selectOption('node-b');
  await button(figure, 'Create writer Pod').click();
  await expect(title(figure)).toHaveText('node-b chosen; pvc-4f2a created in zone b');
  await expect(figure.locator('.pv-objects')).toContainText('Assigned to node-b · volume mounted · not Running');
});

test('the application appends a row only from a mounted Pod, and a replacement Pod still sees it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await button(figure, 'Create claim').click();
  await button(figure, 'Create writer Pod').click();
  await button(figure, 'Writer appends a row').click();
  await expect(title(figure)).toHaveText('Row 1 appended to pvc-4f2a');
  await expect(figure.locator('.anatomy-change').locator('dd').nth(1)).toContainText('not Kubernetes');
  await button(figure, 'Delete writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-1 deleted; claim and data stay');
  await button(figure, 'Create writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-2 assigned to node-a; volume mounted');
  await expect(figure.locator('.anatomy-change').locator('dd').nth(0)).toContainText('with 1 row already on it');
});

test('Retain keeps a Released volume with its row, and a new claim does not reuse it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await select(figure, /Reclaim policy/).selectOption('Retain');
  await button(figure, 'Create claim').click();
  await button(figure, 'Create writer Pod').click();
  await button(figure, 'Writer appends a row').click();
  await button(figure, 'Delete writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-1 deleted; claim and data stay');
  await button(figure, 'Delete claim').click();
  await expect(title(figure)).toHaveText('ledger removed; pvc-4f2a Released');
  await expect(figure.locator('.pv-ledger')).toContainText('Volumes: 0 Bound · 1 Released');
  await button(figure, 'Create claim').click();
  await expect(title(figure)).toHaveText('PVC ledger Bound to pvc-52e1');
  await expect(figure.locator('.pv-ledger')).toContainText('Volumes: 1 Bound · 1 Released');
  await button(figure, 'Reset fixture').click();
  await expect(title(figure)).toHaveText('Empty fixture');
});

test('claim removal waits for its Pod, then Delete reclaims the volume and its rows', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await button(figure, 'Create claim').click();
  await button(figure, 'Create writer Pod').click();
  await button(figure, 'Delete claim').click();
  await expect(title(figure)).toHaveText('ledger is Terminating, not removed');
  await expect(figure.locator('.pv-objects')).toContainText('Terminating: waits until no Pod uses it');
  await button(figure, 'Delete writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-1 deleted; ledger finalized');
  await expect(figure.locator('.pv-ledger')).toContainText('Volumes: 0 Bound · 0 Released');
});

test('keyboard actions run the same transitions, waiting for each report to settle', async ({ page }) => {
  const figure = await open(page, 'persistent-storage');
  const claim = button(figure, 'Create claim');
  await claim.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('PVC ledger Bound to pvc-4f2a');
  await settled(figure);
  const pod = button(figure, 'Create writer Pod');
  await expect(pod).toBeEnabled();
  await pod.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('ledger-writer-1 assigned to node-a; volume mounted');
  await settled(figure);
  const append = button(figure, 'Writer appends a row');
  await expect(append).toBeEnabled();
  await append.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('Row 1 appended to pvc-4f2a');
  await settled(figure);
  await expect(figure.locator('.anatomy-change')).toHaveAttribute('aria-busy', 'false');
});

test('desktop stage tags never overlap in the wrong-zone and assigned states', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await button(figure, 'Create claim').click();
  await select(figure, /Next Pod node/).selectOption('node-b');
  await button(figure, 'Create writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-1 stays Pending');
  expect(overlapping(await visibleTagBoxes(figure))).toEqual([]);
  await button(figure, 'Delete writer Pod').click();
  await select(figure, /Next Pod node/).selectOption('node-a');
  await button(figure, 'Create writer Pod').click();
  await expect(title(figure)).toHaveText('ledger-writer-2 assigned to node-a; volume mounted');
  expect(overlapping(await visibleTagBoxes(figure))).toEqual([]);
});

test('phone: overlay tags are replaced by a visible identity strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await button(figure, 'Create claim').click();
  await button(figure, 'Create writer Pod').click();
  await expect(figure.locator('.pv-tag:visible')).toHaveCount(0);
  await expect(figure.locator('.pv-identity')).toBeVisible();
  await expect(figure.locator('.pv-identity')).toContainText('Pod ledger-writer-1');
  await expect(figure.locator('.pv-identity')).toContainText('PV pvc-4f2a');
});

test('phone reach: the change report stays near the top of the screen after each named action', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  const report = figure.locator('.anatomy-change');
  for (const action of ['Create claim', 'Create writer Pod', 'Writer appends a row']) {
    await button(figure, action).click();
    const box = await report.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(560);
  }
});

test('phone: no horizontal overflow with the settings in a two-column grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'persistent-storage');
  await button(figure, 'Create claim').click();
  await button(figure, 'Create writer Pod').click();
  await expect(title(figure)).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflows).toBe(false);
});

