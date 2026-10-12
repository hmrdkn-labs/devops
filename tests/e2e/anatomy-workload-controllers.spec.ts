import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const runName = /^(Run next event|No event pending)$/;

/** Press "Run next event" until it reads "No event pending" (disabled). */
async function runUntilIdle(figure: Locator, max = 60) {
  const run = figure.getByRole('button', { name: runName });
  for (let i = 0; i < max; i++) {
    if (!(await run.isEnabled())) return;
    await run.click();
  }
  throw new Error('controllers still had events after the step budget');
}

function report(figure: Locator) {
  return figure.locator('.anatomy-change');
}

function title(figure: Locator) {
  return report(figure).locator('.anatomy-change-title');
}

test('the Deployment report names the actor, the reason and what has not happened yet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'workload-controllers');
  await expect(report(figure)).toContainText('Nothing applied');
  await expect(figure.locator('[aria-live]')).toHaveCount(1);
  await figure.getByRole('button', { name: 'Apply manifest', exact: true }).click();
  await expect(title(figure)).toHaveText('Deployment applied');
  await expect(report(figure)).toContainText('You (kubectl apply of the manifest shown)');
  await expect(report(figure)).toContainText('No Pod exists.');
  await expect(figure.locator('.wc-ledger li')).toHaveCount(0);

  await figure.getByRole('button', { name: 'Run next event', exact: true }).click();
  await expect(title(figure)).toHaveText('ReplicaSet creates p1');
  await expect(report(figure)).toContainText('ReplicaSet controller');
  await runUntilIdle(figure);
  await expect(figure.locator('.wc-ledger li')).toHaveCount(3);
  await expect(figure.locator('.wc-badges')).toContainText('Ready 3 of 3');
  await expect(figure.getByRole('button', { name: 'No event pending', exact: true })).toBeDisabled();

  // Nothing is selected by default: Delete stays disabled and no Pod is chosen for the learner.
  await expect(figure.locator('#wc-pod')).toHaveValue('');
  await expect(figure.getByRole('button', { name: 'Delete selected Pod', exact: true })).toBeDisabled();

  await figure.locator('#wc-pod').selectOption('2');
  await expect(title(figure)).toHaveText('p2 selected');
  await expect(report(figure)).toContainText('Nothing changed. p2 is Ready on node-b.');
  await expect(report(figure)).toContainText('Delete selected Pod will act on p2 only');
  await expect(figure.locator('.wc-chip[data-selected="true"]')).toHaveCount(1);
  await expect(figure.locator('.wc-ledger li').filter({ hasText: 'Selected' })).toHaveCount(1);
  await expect(figure.locator('.wc-ledger li')).toHaveCount(3);

  await figure.getByRole('button', { name: 'Delete selected Pod', exact: true }).click();
  await expect(title(figure)).toHaveText('You deleted p2');
  await expect(report(figure)).toContainText('No replacement exists yet');
  await expect(report(figure)).toContainText('Selection cleared: p2 is no longer live.');
  await expect(figure.locator('#wc-pod')).toHaveValue('');
  await expect(figure.locator('.wc-ledger li', { hasText: 'p2' })).toHaveCount(0);

  await figure.getByRole('button', { name: 'Run next event', exact: true }).click();
  await expect(title(figure)).toHaveText('ReplicaSet creates p4');
  await expect(report(figure)).toContainText('It is a new UID, not a returned Pod.');
  await expect(figure.locator('.wc-ledger li', { hasText: 'p4' })).toHaveCount(1);
});

test('the StatefulSet keeps the name and claim when a Pod is replaced', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'workload-controllers');
  await figure.locator('#wc-kind').selectOption('StatefulSet');
  await figure.getByRole('button', { name: 'Apply manifest', exact: true }).click();
  await runUntilIdle(figure);
  await expect(figure.locator('.wc-counts')).toContainText('data-web-0, data-web-1, data-web-2');
  await expect(figure.locator('.wc-badges')).toContainText('Ready 3 of 3');

  const ordinalOne = figure.locator('.wc-ledger li', { hasText: 'name web-1' });
  const before = (await ordinalOne.locator('strong').textContent())!;
  await figure.locator('#wc-pod').selectOption(before.slice(1));
  await figure.getByRole('button', { name: 'Delete selected Pod', exact: true }).click();
  await expect(figure.locator('.wc-ledger li', { hasText: 'name web-1' })).toHaveCount(0);
  await expect(figure.locator('.wc-counts')).toContainText('data-web-1');

  await figure.getByRole('button', { name: 'Run next event', exact: true }).click();
  await expect(title(figure)).toHaveText(/StatefulSet creates web-1 as p\d+/);
  await expect(report(figure)).toContainText('re-attaches the retained data-web-1');
  await runUntilIdle(figure);
  const after = (await figure.locator('.wc-ledger li', { hasText: 'name web-1' }).locator('strong').textContent())!;
  expect(after).not.toBe(before);
  await expect(figure.locator('.wc-badges')).toContainText('Ready 3 of 3');
});

test('a Job replaces failed Pods up to backoffLimit and fails only when failures exceed it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'workload-controllers');
  await figure.locator('#wc-kind').selectOption('Job');
  await figure.getByRole('button', { name: 'Apply manifest', exact: true }).click();
  await runUntilIdle(figure);
  const fail = figure.getByRole('button', { name: 'Pod exits non-zero (Failed)', exact: true });

  await fail.click();
  await expect(title(figure)).toHaveText('p1 Failed');
  await expect(report(figure)).toContainText('retries used 1 of 2');
  await expect(figure.locator('.wc-badges')).toContainText('retries used 1 of 2');
  await runUntilIdle(figure);

  await fail.click();
  await expect(title(figure)).toHaveText('p2 Failed');
  await expect(report(figure)).toContainText('retries used 2 of 2');
  await expect(figure.locator('.wc-badges')).toContainText('Job active');
  await runUntilIdle(figure);

  await fail.click();
  await expect(report(figure)).toContainText('exceeded backoffLimit 2');
  await expect(figure.locator('.wc-badges')).toContainText('Job Failed');
  await expect(figure.locator('.wc-badges')).toContainText('failed Pods 3');
  await expect(fail).toBeDisabled();
});

test('a CronJob skips an overlapping run and reports the skip', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'workload-controllers');
  await figure.locator('#wc-kind').selectOption('CronJob');
  await figure.getByRole('button', { name: 'Apply manifest', exact: true }).click();
  await figure.getByRole('button', { name: 'Schedule fires', exact: true }).click();
  await figure.getByRole('button', { name: 'Schedule fires', exact: true }).click();
  await expect(title(figure)).toHaveText('Scheduled run skipped');
  await expect(report(figure)).toContainText('Nothing created. report-1 is still active.');
  await expect(figure.locator('.wc-badges')).toContainText('run report-1 active');
});

test('keyboard reaches and runs the controls without a pointer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'workload-controllers');
  const apply = figure.getByRole('button', { name: 'Apply manifest', exact: true });
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('Deployment applied');
  const run = figure.getByRole('button', { name: 'Run next event', exact: true });
  await run.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('ReplicaSet creates p1');
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Run, the ChangeReport and owner badges fit one 844px window, with no horizontal overflow', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page, 'workload-controllers');
    await figure.getByRole('button', { name: 'Apply manifest', exact: true }).click();
    await figure.getByRole('button', { name: 'Run next event', exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));

    const boxes = await Promise.all([
      figure.getByRole('button', { name: runName }).boundingBox(),
      report(figure).boundingBox(),
      figure.locator('.wc-badges').boundingBox(),
    ]);
    for (const box of boxes) expect(box).not.toBeNull();
    const top = Math.min(...boxes.map((box) => box!.y));
    const bottom = Math.max(...boxes.map((box) => box!.y + box!.height));
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom - top).toBeLessThanOrEqual(844);

    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageOverflow).toBeLessThanOrEqual(0);
    const figureOverflow = await figure.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(figureOverflow).toBeLessThanOrEqual(1);
  });

  test('visible controls keep tap targets of at least 40px', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page, 'workload-controllers');
    await figure.getByRole('button', { name: 'Apply manifest', exact: true }).click();
    const heights = await figure.locator('.anatomy-controls button').evaluateAll((elements) => elements
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => element.getBoundingClientRect().height));
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
  });
});
