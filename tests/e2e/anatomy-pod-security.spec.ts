import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

function report(figure: Locator) {
  return figure.locator('.anatomy-change');
}

function title(figure: Locator) {
  return report(figure).locator('.anatomy-change-title');
}

function action(figure: Locator, name: string) {
  return figure.getByRole('button', { name, exact: true });
}

test('admission accepts the default Pod, and the kubelet refuses to start it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await expect(report(figure)).toContainText('legacy-agent #1 is Running');
  await expect(figure.locator('[aria-live]')).toHaveCount(1);
  await expect(action(figure, 'Start container')).toBeDisabled();

  await action(figure, 'Apply Pod').click();
  await expect(title(figure)).toHaveText('agent #2 created · Pending');
  await expect(report(figure)).toContainText('No image pulled and no container started');
  await expect(figure.locator('.ps-badges')).toContainText('Admission: accepted');
  await expect(figure.locator('.ps-badges')).toContainText('Container: not started');
  await expect(figure.locator('.ps-readout')).toContainText('not applied yet');

  await action(figure, 'Start container').click();
  await expect(title(figure)).toHaveText('kubelet refused to start agent #2');
  await expect(report(figure)).toContainText('kubelet (runAsNonRoot check at container start)');
  await expect(figure.locator('.ps-badges')).toContainText('Container: refused by kubelet');
  await expect(figure.locator('.ps-readout')).toContainText('not applied: container refused');
  await expect(action(figure, 'Start container')).toBeDisabled();
});

test('the refusal highlights only runAsNonRoot, the absent runAsUser and the image USER', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await action(figure, 'Apply Pod').click();
  await action(figure, 'Start container').click();
  const marked = figure.locator('.anatomy-manifest mark');
  await expect(marked).toHaveCount(3);
  await expect(figure.locator('.anatomy-manifest')).toContainText('runAsUser unset');
});

test('a new UID runs as 1000 after delete and re-apply, and the draft edit alone changes nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await action(figure, 'Apply Pod').click();
  await action(figure, 'Start container').click();
  await expect(title(figure)).toHaveText('kubelet refused to start agent #2');

  await figure.locator('#ps-runasuser').selectOption('1000');
  await expect(title(figure)).toHaveText('Draft changed · not sent');
  await expect(report(figure)).toContainText('agent #2 keeps its applied spec');
  await expect(figure.locator('.ps-ledger li', { hasText: 'agent #2' })).toContainText('Container: refused by kubelet');

  await action(figure, 'Delete agent Pod').click();
  await expect(title(figure)).toHaveText('agent #2 deleted');
  await action(figure, 'Apply Pod').click();
  await expect(title(figure)).toHaveText('agent #3 created · Pending');
  await action(figure, 'Start container').click();
  await expect(title(figure)).toHaveText('agent #3 Running as UID 1000');
  await expect(report(figure)).toContainText('Running is not proof that the application works');
  await expect(figure.locator('.ps-badges')).toContainText('Container: Running as UID 1000');
  await expect(figure.locator('.ps-readout')).toContainText('applied · 1000');
});

test('relabelling enforce returns a warning for the running privileged Pod and evicts nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await figure.locator('#ps-enforce').selectOption('restricted');
  await expect(title(figure)).toHaveText('enforce = restricted');
  await expect(report(figure)).toContainText('Warnings only: legacy-agent #1');
  await expect(report(figure)).toContainText('No Pod was evicted or changed.');
  await expect(figure.locator('.ps-ledger li')).toHaveCount(1);
  await expect(figure.locator('.ps-ledger li')).toContainText('Container: Running as UID 0');
  await expect(figure.locator('.ps-ledger li')).toContainText('privileged');
  await expect(figure.locator('.ps-ledger li')).toContainText('still Running');
});

test('enforce refuses a privileged draft at create time and creates no Pod object', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await figure.locator('#ps-enforce').selectOption('restricted');
  await figure.locator('#ps-privileged').check();
  await figure.locator('#ps-escalation').selectOption('unset');
  await expect(title(figure)).toHaveText('Draft changed · not sent');
  await action(figure, 'Apply Pod').click();
  await expect(title(figure)).toHaveText('Admission refused agent · enforce restricted');
  await expect(report(figure)).toContainText('No Pod object was created.');
  await expect(figure.locator('.ps-ledger li')).toHaveCount(1);
  await expect(figure.locator('.ps-badges')).toContainText('Admission: refused (enforce restricted)');
  await expect(figure.locator('.anatomy-manifest mark')).toHaveCount(3);
});

test('the API refuses privileged with allowPrivilegeEscalation false before any namespace level', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await figure.locator('#ps-privileged').check();
  await action(figure, 'Apply Pod').click();
  await expect(title(figure)).toHaveText('Request refused by API validation');
  await expect(report(figure)).toContainText('No Pod object was created.');
  await expect(figure.locator('.ps-ledger li')).toHaveCount(1);
  await expect(figure.locator('.anatomy-manifest mark')).toHaveCount(2);
});

test('a missing imagePullSecret fails the pull before any container exists', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await figure.locator('#ps-pullsecret').uncheck();
  await action(figure, 'Apply Pod').click();
  await action(figure, 'Start container').click();
  await expect(title(figure)).toHaveText('agent #2: image pull failed');
  await expect(report(figure)).toContainText('No container was created');
  await expect(figure.locator('.ps-badges')).toContainText('Image pull: failed (no imagePullSecret)');
  await expect(figure.locator('.anatomy-manifest mark')).toHaveCount(1);
  await expect(action(figure, 'Start container')).toBeDisabled();
});

test('a read-only root filesystem denies the cache write until an emptyDir is mounted', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  await figure.locator('#ps-runasuser').selectOption('1000');
  await figure.locator('#ps-emptydir').uncheck();
  await action(figure, 'Apply Pod').click();
  await action(figure, 'Start container').click();
  await expect(title(figure)).toHaveText('agent #2 Running as UID 1000');
  await action(figure, 'Write to /app/cache').click();
  await expect(title(figure)).toHaveText('Write to /app/cache denied');
  await expect(report(figure)).toContainText('readOnlyRootFilesystem: true decided it.');

  await action(figure, 'Delete agent Pod').click();
  await figure.locator('#ps-emptydir').check();
  await action(figure, 'Apply Pod').click();
  await action(figure, 'Start container').click();
  await action(figure, 'Write to /app/cache').click();
  await expect(title(figure)).toHaveText('Write to /app/cache succeeded');
  await expect(report(figure)).toContainText('The volume, not the root filesystem, decided the path.');
});

test('keyboard reaches and runs the controls without a pointer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'pod-security');
  const apply = action(figure, 'Apply Pod');
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('agent #2 created · Pending');
  const start = action(figure, 'Start container');
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('kubelet refused to start agent #2');
});

test.describe('desktop width', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('after Apply and Start, the object and its ChangeReport are on screen together', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page, 'pod-security');
    await action(figure, 'Apply Pod').click();
    await action(figure, 'Start container').click();
    // The user's view after pressing Start: the object column is sticky, so both parts stay in the same window.
    const [svg, changed, column] = await Promise.all([
      figure.locator('.ps-stage svg').boundingBox(),
      report(figure).boundingBox(),
      figure.locator('.ps-object').boundingBox(),
    ]);
    expect(svg).not.toBeNull();
    expect(changed).not.toBeNull();
    expect(column!.height).toBeLessThanOrEqual(860);
    // Labels are 15 user units; at 520px wide the viewBox (760) renders them at about 10px.
    expect(svg!.width).toBeGreaterThanOrEqual(520);
    for (const box of [svg!, changed!]) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(900);
    }
  });
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('after editing the last draft control, the ChangeReport is within one viewport height of it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page, 'pod-security');
    const last = figure.locator('#ps-emptydir');
    await last.uncheck();
    await expect(title(figure)).toHaveText('Draft changed · not sent');
    const [control, changed] = await Promise.all([last.boundingBox(), report(figure).boundingBox()]);
    expect(control).not.toBeNull();
    expect(changed).not.toBeNull();
    expect(Math.abs(control!.y - changed!.y)).toBeLessThanOrEqual(844);
  });

  test('the ChangeReport and the pipeline stay pinned at the top while the form is scrolled', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page, 'pod-security');
    await action(figure, 'Apply Pod').click();
    await figure.locator('#ps-emptydir').scrollIntoViewIfNeeded();
    const changed = await report(figure).boundingBox();
    expect(changed).not.toBeNull();
    expect(changed!.y).toBeGreaterThanOrEqual(0);
    expect(changed!.y).toBeLessThan(200);
  });

  test('no horizontal overflow at 390px, and action buttons keep tap targets of at least 40px', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const figure = await open(page, 'pod-security');
    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageOverflow).toBeLessThanOrEqual(0);
    const figureOverflow = await figure.evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(figureOverflow).toBeLessThanOrEqual(1);
    const heights = await figure.locator('.ps-actions button').evaluateAll((elements) => elements
      .filter((element) => (element as HTMLElement).offsetParent !== null)
      .map((element) => element.getBoundingClientRect().height));
    expect(heights.length).toBe(4);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(40);
  });
});
