import { test, expect } from '@playwright/test';
import { open } from './anatomy/helpers';

test('running is not ready: binding and starting change different facts, and the report says which', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-lifecycle');
  const report = figure.locator('.anatomy-change');
  const ledger = figure.locator('.pl-ledger');
  await figure.getByRole('button', { name: 'Bind to node', exact: true }).click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Pod p-1 bound to node-1');
  await expect(report).toContainText('kube-scheduler');
  await expect(report).toContainText('Nothing runs');
  await expect(ledger).toContainText('PodScheduled True');
  await figure.getByRole('button', { name: 'Start containers', exact: true }).click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Containers started on node-1');
  await expect(report).toContainText('kubelet');
  await expect(report).toContainText('Running is not Ready');
  await expect(ledger).toContainText('Phase Running');
  await expect(ledger).toContainText('Ready False');
  await expect(figure.locator('[data-chip="endpoint"]')).toHaveText('endpoint: out');
  await expect(figure.locator('.anatomy-manifest mark').filter({ hasText: 'phase: Running' })).toHaveCount(1);
});

test('a readiness failure removes the Pod from endpoints at its threshold, and nothing restarts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-lifecycle');
  const report = figure.locator('.anatomy-change');
  const next = figure.getByRole('button', { name: 'Next probe period', exact: true });
  await figure.getByRole('button', { name: 'Bind to node', exact: true }).click();
  await figure.getByRole('button', { name: 'Start containers', exact: true }).click();
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Readiness passed: Pod is Ready');
  await figure.getByRole('combobox', { name: /Application behaviour/ }).selectOption({ label: 'Overloaded: readiness fails, liveness passes' });
  await expect(report.locator('.anatomy-change-title')).toHaveText('Application behaviour: Overloaded: readiness fails, liveness passes');
  await expect(report).toContainText('No Ready, restartCount, endpoint, or phase change has happened yet.');
  await next.click();
  await next.click();
  await expect(figure.locator('[data-chip="endpoint"]')).toHaveText('endpoint: in');
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Pod removed from Service endpoints; not restarted');
  await expect(figure.locator('[data-chip="endpoint"]')).toHaveText('endpoint: out');
  await expect(figure.locator('[data-chip="cell"]')).toContainText('restarts 0');
  await expect(figure.locator('.pl-ledger')).toContainText('Readiness 3 of 3 failed');
});

test('a deadlocked app is deadlocked again after each restart, so the loop repeats and Ready stays False', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-lifecycle');
  const report = figure.locator('.anatomy-change');
  const next = figure.getByRole('button', { name: 'Next probe period', exact: true });
  await figure.getByRole('button', { name: 'Bind to node', exact: true }).click();
  await figure.getByRole('button', { name: 'Start containers', exact: true }).click();
  await next.click();
  await figure.getByRole('combobox', { name: /Application behaviour/ }).selectOption({ label: 'Deadlocked: liveness and readiness fail' });
  await next.click();
  await next.click();
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Liveness probe killed the container');
  await expect(report).toContainText('Pod identity (uid) is unchanged');
  await expect(report).toContainText('fails the same way after every restart');
  await expect(figure.locator('[data-chip="pod"]')).toHaveText('Pod p-1 · node-1');
  await expect(figure.locator('[data-chip="cell"]')).toContainText('restarts 1');
  await expect(figure.locator('.pl-ledger')).toContainText('Ready False');
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Startup probe passed on the restarted container');
  await expect(report).toContainText('Ready stays False until the readiness probe passes');
  await next.click();
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Liveness probe killed the container');
  await expect(figure.locator('[data-chip="cell"]')).toContainText('CrashLoopBackOff');
  await expect(figure.locator('[data-chip="cell"]')).toContainText('restarts 1');
  await expect(figure.locator('.pl-ledger')).toContainText('Ready False');
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Back-off over: container restarted');
  await expect(figure.locator('[data-chip="cell"]')).toContainText('restarts 2');
  await expect(figure.locator('.pl-ledger')).toContainText('Ready False');
});

test('changing a probe creates a new Pod object rather than editing the running one', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-lifecycle');
  const liveness = figure.getByRole('checkbox', { name: 'Liveness probe', exact: true });
  await liveness.uncheck();
  await expect(figure.locator('.anatomy-change-title')).toHaveText('Pod p-2 replaces p-1');
  await expect(figure.locator('.anatomy-change')).toContainText('API rejects probe and restartPolicy edits');
  await expect(figure.locator('[data-chip="pod"]')).toHaveText('Pod p-2 · unbound');
  await expect(liveness).not.toBeChecked();
});

test('startup gates liveness and readiness for a slow start', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-lifecycle');
  const report = figure.locator('.anatomy-change');
  const next = figure.getByRole('button', { name: 'Next probe period', exact: true });
  await figure.getByRole('combobox', { name: /Application behaviour/ }).selectOption({ label: 'Slow start: serves after 3 periods' });
  await figure.getByRole('button', { name: 'Bind to node', exact: true }).click();
  await figure.getByRole('button', { name: 'Start containers', exact: true }).click();
  await next.click();
  await next.click();
  await next.click();
  await expect(figure.locator('.pl-ledger')).toContainText('Startup 3 of 6 failed');
  await expect(figure.locator('.pl-ledger')).toContainText('Liveness 0 of 3 failed');
  await expect(figure.locator('.pl-ledger')).toContainText('Readiness 0 of 3 failed');
  await next.click();
  await expect(report.locator('.anatomy-change-title')).toHaveText('Readiness passed: Pod is Ready');
  await expect(figure.locator('.pl-ledger')).toContainText('Ready True');
});

test('controls are native and operable from the keyboard, and reduced motion settles at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-lifecycle');
  const report = figure.locator('.anatomy-change');
  await expect(report).toHaveAttribute('aria-live', 'polite');
  const bind = figure.getByRole('button', { name: 'Bind to node', exact: true });
  await bind.focus();
  await page.keyboard.press('Enter');
  await expect(report.locator('.anatomy-change-title')).toHaveText('Pod p-1 bound to node-1');
  const start = figure.getByRole('button', { name: 'Start containers', exact: true });
  await expect(start).toBeEnabled();
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(report.locator('.anatomy-change-title')).toHaveText('Containers started on node-1');
  await expect(figure).toHaveAttribute('aria-busy', 'false');
});

test('chips label the object without overlapping or clipping on desktop, and become one identity line on a phone', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  const figure = await open(page, 'pod-lifecycle');
  await figure.getByRole('button', { name: 'Bind to node', exact: true }).click();
  await figure.getByRole('button', { name: 'Start containers', exact: true }).click();
  await figure.getByRole('combobox', { name: /Application behaviour/ }).selectOption({ label: 'Overloaded: readiness fails, liveness passes' });
  const next = figure.getByRole('button', { name: 'Next probe period', exact: true });
  await next.click();
  await next.click();
  await next.click();
  await expect(figure.locator('.pl-identity')).toBeHidden();
  await expect(figure.locator('.pl-chip:visible')).toHaveCount(4);
  const boxes = await figure.locator('.pl-chip:visible').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      text: element.textContent ?? '',
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
    };
  }));
  expect(boxes.filter((box) => box.clipped).map((box) => box.text)).toEqual([]);
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      expect(apart, `${a.text} must not overlap ${b.text}`).toBe(true);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(figure.locator('.pl-chip:visible')).toHaveCount(0);
  await expect(figure.locator('.pl-identity')).toBeVisible();
  await expect(figure.locator('.pl-identity')).toContainText('endpoint: out');
  await expect(figure.locator('.anatomy-change')).toBeVisible();
  await expect(figure.locator('.pl-ledger')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
