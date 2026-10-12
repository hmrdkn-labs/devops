import { test, expect, type Locator, type Page } from '@playwright/test';
import { open } from './anatomy/helpers';

const changeTitle = (figure: Locator) => figure.locator('.anatomy-change-title');
const rung = (figure: Locator, name: string) => figure.getByRole('button', { name, exact: true });
const applyFix = (figure: Locator) => figure.getByRole('button', { name: 'Apply fix', exact: true });
const deletePod = (figure: Locator) => figure.getByRole('button', { name: 'Delete Pod', exact: true });
const reconcile = (figure: Locator) => figure.getByRole('button', { name: 'Let owners reconcile once', exact: true });
const symptom = (figure: Locator) => figure.getByRole('combobox', { name: 'Symptom fixture', exact: true });
const ledgerItems = (figure: Locator) => figure.locator('.ladder-ledger li');
const podCard = (figure: Locator) => figure.locator('.ladder-object[aria-label="Pod"] code');

async function reducedMotion(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}

test('the fix stays locked until a read names the cause; reading changes nothing in the cluster', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  const apply = applyFix(figure);
  await expect(apply).toBeDisabled();
  await expect(figure.locator('.ladder-lock')).toContainText('Locked: no read has named the cause yet.');

  await rung(figure, '1 Status').click();
  await expect(changeTitle(figure)).toHaveText(/^Read Status:/);
  await expect(figure.locator('.anatomy-change')).toContainText('Nothing in the cluster changed');
  await expect(podCard(figure)).toHaveText('orders-api-7d4b5-x2k4q');
  await expect(apply).toBeDisabled();

  await rung(figure, '3 Events').click();
  await expect(changeTitle(figure)).toHaveText(/^Read Events:/);
  await expect(figure.locator('.anatomy-change')).toContainText('Cause named');
  await expect(apply).toBeEnabled();
});

test('a template fix creates a replacement Pod, keeps the old one listed until the replacement is Ready, then removes it', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  await rung(figure, '3 Events').click();
  await applyFix(figure).click();
  await expect(changeTitle(figure)).toHaveText('Template fixed: new Pod orders-api-5c9f6-q9wz1');
  await expect(podCard(figure)).toHaveText('orders-api-5c9f6-q9wz1');
  await expect(figure.locator('.ladder-retired')).toContainText('orders-api-7d4b5-x2k4q');
  await expect(figure.locator('.ladder-status')).toContainText('Not Ready');
  await expect(figure.locator('.ladder-status')).toContainText('Not listed');

  await reconcile(figure).click();
  await expect(changeTitle(figure)).toHaveText('Reconcile: orders-api-5c9f6-q9wz1 Ready');
  await expect(figure.locator('.ladder-retired')).toHaveCount(0);
  await expect(figure.locator('.ladder-status')).toContainText('Listed in endpoints');
});

test('the manifest highlights the field the last read depended on', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  await rung(figure, '3 Events').click();
  await expect(figure.locator('.anatomy-manifest mark')).toContainText('cpu: "2"');
  await expect(figure.locator('.anatomy-manifest mark')).not.toContainText('image');
});

test('deleting a Pod before reading loses the evidence, and the replacement reproduces the fault', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  await symptom(figure).selectOption({ label: 'ImagePullBackOff: tag 1.4.3 does not exist' });
  await expect(changeTitle(figure)).toHaveText(/^Fixture loaded:/);
  await rung(figure, '3 Events').click();
  await expect(ledgerItems(figure).nth(2)).not.toContainText('not read on this object');
  await deletePod(figure).click();
  await expect(changeTitle(figure)).toHaveText('Deleted orders-api-7d4b5-x2k4q; orders-api-7d4b5-q9wz1 created');
  await expect(ledgerItems(figure).nth(2)).toContainText('not read on this object');
  await reconcile(figure).click();
  await expect(figure.locator('.ladder-status')).toContainText('ImagePullBackOff');
  await expect(applyFix(figure)).toBeDisabled();
});

test('a readiness failure is retried without restarting the container', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  await symptom(figure).selectOption({ label: 'Running, not Ready: readiness path returns 404' });
  const restarts = figure.locator('.ladder-object[aria-label="Pod"] dd').nth(3);
  await expect(restarts).toHaveText('0');
  for (let pass = 0; pass < 3; pass++) {
    await expect(reconcile(figure)).toBeEnabled();
    await reconcile(figure).click();
  }
  await expect(restarts).toHaveText('0');
  await expect(figure.locator('.ladder-status')).toContainText('Not listed');
});

test('a snapshot read before an owner pass is marked as stale', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  await rung(figure, '1 Status').click();
  await expect(ledgerItems(figure).first()).not.toContainText('read before the last change');
  await reconcile(figure).click();
  await expect(ledgerItems(figure).first()).toContainText('read before the last change');
});

test('the object names its parts: rungs, Pod, container state, node and Service', async ({ page }) => {
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  await expect(figure.locator('.ladder-tag.ladder-rung')).toHaveCount(6);
  await expect(figure.locator('.ladder-tag.ladder-pod')).toContainText('orders-api-7d4b5-x2k4q');
  await expect(figure.locator('.ladder-tag.ladder-container')).toContainText('container: not created');
  await expect(figure.locator('.ladder-tag.ladder-service')).toContainText('Service orders-api');
  await expect(figure.locator('.ladder-tag.ladder-service')).toContainText('selector app=orders-api');
});

async function keyboardRoundTrip(page: Page) {
  const figure = await open(page, 'troubleshooting-ladder');
  await rung(figure, '2 Placement').focus();
  await expect(rung(figure, '2 Placement')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText(/^Read Placement:/);
  await expect(reconcile(figure)).toBeEnabled();
  await reconcile(figure).focus();
  await expect(reconcile(figure)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText(/^Reconcile:/);
}

test('keyboard reads a rung and the change report follows', async ({ page }) => {
  await keyboardRoundTrip(page);
});

test('keyboard reads and reconciles under reduced motion', async ({ page }) => {
  await reducedMotion(page);
  await keyboardRoundTrip(page);
});

test('390px phone shows the rung grid, change report and status together, with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await reducedMotion(page);
  const figure = await open(page, 'troubleshooting-ladder');
  const button = rung(figure, '3 Events');
  await button.click();
  await expect(changeTitle(figure)).toHaveText(/^Read Events:/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const pressed = await button.boundingBox();
  const change = await figure.locator('.anatomy-change').boundingBox();
  const status = await figure.locator('.ladder-status').boundingBox();
  expect(pressed).not.toBeNull();
  expect(change).not.toBeNull();
  expect(status).not.toBeNull();
  expect(change!.y - pressed!.y).toBeLessThan(844);
  expect(change!.y).toBeGreaterThan(pressed!.y);
  expect(status!.y).toBeGreaterThan(change!.y);
  expect(status!.y - (change!.y + change!.height)).toBeLessThan(200);
  const clipped = await figure.locator('.ladder-rungs button').evaluateAll((buttons) =>
    buttons.filter((button) => button.scrollWidth > button.clientWidth + 1).map((button) => button.textContent));
  expect(clipped).toEqual([]);
});

for (const [width, height] of [[1440, 1000], [390, 844]] as const) {
  test(`labels on the object do not cover each other or leave the stage at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await reducedMotion(page);
    const figure = await open(page, 'troubleshooting-ladder');
    const fixtures = [
      'Service has no endpoints: selector mismatch',
      'CrashLoopBackOff: OOMKilled under 64Mi',
      'Assigned, ContainerCreating: ConfigMap missing',
    ];
    for (const name of fixtures) {
      await symptom(figure).selectOption({ label: name });
      const problems = await figure.evaluate((root) => {
        const stage = root.querySelector('.ladder-stage')!.getBoundingClientRect();
        const tags = [...root.querySelectorAll('.ladder-stage .ladder-tag')].filter((tag) => tag.getClientRects().length > 0);
        const rects = tags.map((tag) => ({ text: tag.textContent!.trim(), r: tag.getBoundingClientRect() }));
        const found: string[] = [];
        for (let i = 0; i < rects.length; i += 1) {
          const a = rects[i]!.r;
          if (a.left < stage.left - 1 || a.right > stage.right + 1) found.push(`outside stage: ${rects[i]!.text}`);
          for (let j = i + 1; j < rects.length; j += 1) {
            const b = rects[j]!.r;
            if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) found.push(`${rects[i]!.text} / ${rects[j]!.text}`);
          }
        }
        return found;
      });
      expect(problems, name).toEqual([]);
    }
  });
}
