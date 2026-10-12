import { expect, test, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const action = (figure: Locator, name: string) => figure.getByRole('button', { name, exact: true });
const report = (figure: Locator) => figure.locator('.anatomy-change');
const storedPanel = (figure: Locator) => figure.locator('.anatomy-manifest pre').nth(1);

test('header names the figure as Fig 02 and a card edit changes only the local card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'api-objects');
  await expect(figure.locator('.anatomy-figure-header')).toContainText('FIG 02');
  await figure.getByLabel('Card replicas').selectOption('3');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Card edited');
  await expect(report(figure)).toContainText('No API request has been sent');
  await expect(figure.locator('.api-status')).toContainText('card edited, not sent');
  await action(figure, 'Apply card (kubectl apply)').click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Spec stored: generation 1 to 2');
  await expect(report(figure)).toContainText('status.observedGeneration is still 1');
  await expect(figure.locator('.api-status')).toContainText('observed gen 1 of 2');
  await action(figure, 'Run controller sync').click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Controller synced generation 2');
  await expect(figure.locator('.api-ledger')).toContainText('Pending, not Ready');
  await expect(figure.locator('.api-owner')).toContainText('ReplicaSet web-6d4cf56db6');
});

test('after Pods become Ready, the ledger reads Ready while the status chip still reports the old readyReplicas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'api-objects');
  await figure.getByLabel('Card replicas').selectOption('3');
  await action(figure, 'Apply card (kubectl apply)').click();
  await action(figure, 'Run controller sync').click();
  await action(figure, 'Fixture: Pods become Ready').click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('report Ready (fixture)');
  await expect(report(figure)).toContainText('status.readyReplicas still counts the old Ready total');
  await expect(figure.locator('.api-ledger li[data-slot="2"]')).toContainText('Ready');
  await expect(figure.locator('.api-status')).toContainText('Pods 3 Ready of 3 · want 3');
  await expect(figure.locator('.api-status')).toContainText('status.readyReplicas 2/3');
  await expect(storedPanel(figure)).toContainText('readyReplicas: 2');
  await action(figure, 'Run controller sync').click();
  await expect(storedPanel(figure)).toContainText('readyReplicas: 3');
});

test('a rejected apply stores nothing and the gate readout says rejected with a reason', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'api-objects');
  await figure.getByLabel('Card selector app').selectOption('api');
  await action(figure, 'Apply card (kubectl apply)').click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Apply rejected by API validation');
  await expect(report(figure)).toContainText('Nothing stored');
  await expect(report(figure)).toContainText('does not match template labels');
  await expect(figure.locator('.api-label-gate')).toContainText('rejected');
  await expect(figure.locator('.api-status')).toContainText('gate: rejected');
  await expect(figure.locator('.api-status')).toContainText('card sent, rejected (selector app=api ≠ template labels)');
  await expect(figure.locator('.api-status')).not.toContainText('not sent');
  await expect(storedPanel(figure)).toContainText('generation: 1');
  await expect(figure.locator('.api-lamp[data-state="fail"]')).toHaveCount(1);
  await action(figure, 'Reset fixture').click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Fixture reset');
  await expect(figure.locator('.api-lamp[data-state="fail"]')).toHaveCount(0);
  await expect(figure.locator('.api-label-gate')).toContainText('idle');
});

test('delete ends the object identity; the next apply creates a new UID at generation 1 with empty status', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'api-objects');
  await action(figure, 'Delete Deployment').focus();
  await page.keyboard.press('Enter');
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Deleted Deployment web (u1)');
  await expect(report(figure)).toContainText('The old UID will not return');
  await expect(figure.locator('.api-ledger')).toContainText('No object, so no ReplicaSet and no Pods.');
  await action(figure, 'Apply card (kubectl apply)').click();
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Created Deployment web as u2');
  await expect(storedPanel(figure)).toContainText('generation: 1');
  await expect(figure.locator('.api-status')).toContainText('observed gen 0 of 1');
});

test('controls lock while the press moves and unlock when it settles', async ({ page }) => {
  const figure = await open(page, 'api-objects');
  const apply = action(figure, 'Apply card (kubectl apply)');
  await figure.getByLabel('Card replicas').selectOption('4');
  await apply.click();
  await expect(apply).toBeDisabled();
  await expect(apply).toBeEnabled({ timeout: 5000 });
  await expect(report(figure).locator('.anatomy-change-title')).toContainText('Spec stored: generation 1 to 2');
});

test('phone 390x844: after Apply, the button row, the change report and the first status chip are visible without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const figure = await open(page, 'api-objects');
  await figure.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  const apply = action(figure, 'Apply card (kubectl apply)');
  await apply.click();
  await expect(apply).toBeInViewport();
  await expect(report(figure).locator('.anatomy-change-title')).toBeInViewport();
  await expect(report(figure).locator('dt', { hasText: 'Changed' })).toBeInViewport();
  await expect(figure.locator('.api-status .anatomy-badge').first()).toBeInViewport();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
