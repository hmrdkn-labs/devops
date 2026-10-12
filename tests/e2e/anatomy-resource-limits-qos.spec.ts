import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const slug = 'resource-limits-qos';
const report = (figure: Locator) => figure.locator('.anatomy-change');
const reportTitle = (figure: Locator) => report(figure).locator('.anatomy-change-title');
const reportField = (figure: Locator, label: string) =>
  report(figure).locator('dt', { hasText: label }).locator('xpath=..').locator('dd');
const profile = (figure: Locator) => figure.locator('.anatomy-controls select').first();
const button = (figure: Locator, name: string) => figure.getByRole('button', { name, exact: true });
const checkbox = (figure: Locator, name: string) => figure.getByRole('checkbox', { name, exact: false });
const podCard = (figure: Locator) => figure.locator('.rl-card[data-object="pod"]');
const nodeCard = (figure: Locator) => figure.locator('.rl-card[data-object="node"]');
const ledgerRow = (figure: Locator, name: string) => figure.locator('.rl-ledger tbody tr').filter({ hasText: name });

const lrToggle = (figure: Locator) => checkbox(figure, 'LimitRange shop-defaults');
const quotaToggle = (figure: Locator) => checkbox(figure, 'ResourceQuota shop-quota');
const searchUse = (figure: Locator) => figure.getByLabel('search-5d6b memory use');
const load = (figure: Locator) => figure.getByLabel('Candidate load');

test('nothing is judged before Submit Pod: badges say not run, and the ledger says not checked', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await expect(podCard(figure)).toContainText('no Pod object yet');
  await expect(figure.locator('.rl-ledger')).toContainText('not checked');
  await expect(nodeCard(figure)).not.toContainText(/Insufficient|no eviction needed|evicted/);
  await expect(reportTitle(figure)).toContainText('Draft api-canary-1 ready');
});

test('a Guaranteed Pod over the ResourceQuota is rejected, creates no Pod, and never reaches the scheduler', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await profile(figure).selectOption('guaranteed');
  await quotaToggle(figure).check();
  await button(figure, 'Submit Pod').click();
  await expect(reportTitle(figure)).toContainText('api-canary-1 rejected at admission');
  await expect(reportField(figure, 'Why')).toContainText('requests.cpu would be 1300m of 1000m');
  await expect(reportField(figure, 'Changed')).toContainText('No Pod object was created');
  await expect(reportField(figure, 'Not yet')).toContainText('nothing started');
  await expect(podCard(figure)).toContainText('rejected: no Pod object');
  await expect(nodeCard(figure)).toContainText('fit: not reached');
});

test('a BestEffort Pod under a LimitRange gets defaults, and the report says the QoS class changed', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await profile(figure).selectOption('besteffort');
  await lrToggle(figure).check();
  await button(figure, 'Submit Pod').click();
  await expect(reportTitle(figure)).toContainText('api-canary-1 Running on node-a');
  await expect(reportField(figure, 'Changed')).toContainText('qosClass Burstable');
  await expect(reportField(figure, 'Why')).toContainText('LimitRange default');
  await expect(figure.locator('.anatomy-manifest').nth(1).locator('mark').first()).toContainText('LimitRange default');
  await expect(podCard(figure)).toContainText('Running on node-a');
  await expect(ledgerRow(figure, 'api-canary-1')).toContainText('Burstable');
});

test('a 1500m CPU request is Pending with the scheduler as actor, and it does not claim a node', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await profile(figure).selectOption('large');
  await button(figure, 'Submit Pod').click();
  await expect(reportTitle(figure)).toContainText('api-canary-1 Pending: no node-a fit');
  await expect(reportField(figure, 'Who')).toContainText('kube-scheduler');
  await expect(reportField(figure, 'Why')).toContainText('cpu request 1500m is more than the 1200m free');
  await expect(reportField(figure, 'Not yet')).toContainText('Not bound');
  await expect(podCard(figure)).toContainText('Pending · no nodeName');
});

test('a spike run throttles CPU and OOM-kills memory in the same Pod, and the restart count goes up', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await button(figure, 'Submit Pod').click();
  await load(figure).selectOption('spike');
  await button(figure, 'Run load').click();
  await expect(reportTitle(figure)).toContainText('api-canary-1 OOMKilled; restartCount 1');
  await expect(reportField(figure, 'Changed')).toContainText('CPU 900m capped at 500m');
  await expect(reportField(figure, 'Who')).toContainText('kubelet restarts');
  await expect(reportField(figure, 'Not yet')).toContainText('Pod name, UID and node are unchanged');
  await expect(podCard(figure)).toContainText('OOMKilled · restarts 1');
  await expect(figure.locator('.anatomy-manifest').nth(1)).toContainText('restartCount: 1');
});

test('an edit after submit leaves the Pod alone, and it clears the stale pressure check', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await button(figure, 'Submit Pod').click();
  await button(figure, 'Apply node memory pressure').click();
  await expect(nodeCard(figure)).toContainText('no eviction needed');
  await lrToggle(figure).check();
  await expect(nodeCard(figure)).toContainText('pressure check: not run');
  await expect(reportField(figure, 'Not yet')).toContainText('Pods already on node-a are not re-checked');
});

test('node memory pressure evicts the Burstable Pod that uses more above its request, not the BestEffort one', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await searchUse(figure).selectOption('above');
  await button(figure, 'Apply node memory pressure').click();
  await expect(reportTitle(figure)).toContainText('Evicted search-5d6b');
  await expect(reportField(figure, 'Why')).toContainText('344Mi above its 256Mi request');
  await expect(reportField(figure, 'Why')).toContainText('QoS class is not an input');
  await expect(reportField(figure, 'Not yet')).toContainText('No replacement Pod was created');
  await expect(ledgerRow(figure, 'search-5d6b')).toContainText('Failed (Evicted)');
  await expect(ledgerRow(figure, 'batch-report-x')).toContainText('Running');
});

test('Reset gives the next draft a new Pod name and restores the fixture residents', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await searchUse(figure).selectOption('above');
  await button(figure, 'Apply node memory pressure').click();
  await button(figure, 'Reset').click();
  await expect(reportTitle(figure)).toContainText('draft api-canary-2');
  await expect(podCard(figure)).toContainText('api-canary-2');
  await expect(figure.locator('.rl-ledger')).not.toContainText('Failed (Evicted)');
  await expect(searchUse(figure)).toHaveValue('within');
});

test('keyboard reaches Submit Pod and runs it with Enter', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  await button(figure, 'Submit Pod').focus();
  await page.keyboard.press('Enter');
  await expect(reportTitle(figure)).toContainText('api-canary-1 Running on node-a');
});

test('the figure reports aria-busy until hydrated, then its controls are enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/anatomy/${slug}/`);
  const figure = page.locator('.anatomy-figure');
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  await expect(button(figure, 'Submit Pod')).toBeEnabled();
});

test('the explanation and the figure fit a 390px phone without horizontal overflow', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, slug);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('on a phone, after Submit Pod, controls, ChangeReport and the candidate card fit above the bottom nav (765px of 844px); the object is at least 280px tall', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const viewport = page.viewportSize();
  test.skip((viewport?.width ?? 1440) > 600, 'phone layout only');
  const figure = await open(page, slug);
  await button(figure, 'Submit Pod').click();
  await expect(reportTitle(figure)).toContainText('Running on node-a');
  const controls = await figure.locator('.anatomy-controls').first().boundingBox();
  const change = await report(figure).boundingBox();
  const candidate = await podCard(figure).boundingBox();
  const stage = await figure.locator('svg.iso-svg').boundingBox();
  expect(controls && change && candidate && stage).toBeTruthy();
  const span = candidate!.y + candidate!.height - controls!.y;
  expect(change!.y).toBeGreaterThan(controls!.y);
  expect(candidate!.y).toBeGreaterThan(change!.y);
  expect(span, 'controls top to candidate card bottom: 844px viewport minus the ~75px fixed bottom nav').toBeLessThanOrEqual(765);
  expect(stage!.height).toBeGreaterThanOrEqual(280);
  await expect(figure.locator('.rl-tag.rl-object').first()).toBeHidden();
  test.info().annotations.push({ type: 'measured', description: `controls top to candidate card bottom: ${Math.round(span)}px (budget 765px above the bottom nav); stage ${Math.round(stage!.height)}px tall` });
});
