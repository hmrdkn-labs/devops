import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const changeTitle = (figure: Locator) => figure.locator('.anatomy-change-title');
const claimRow = (figure: Locator, index: number) => figure.locator('.obs-claim').nth(index);
const advance = (figure: Locator) => figure.getByRole('button', { name: /^Advance to / });
const verdictOf = (figure: Locator, index: number) => claimRow(figure, index).locator('.obs-verdict');
const checkButton = (figure: Locator, index: number) => claimRow(figure, index).getByRole('button', { name: 'Check', exact: true });
const pickSignal = async (figure: Locator, index: number, label: string) => {
  await claimRow(figure, index).getByRole('combobox').selectOption({ label });
};
const readMarks = (figure: Locator) => figure.locator('.obs-instrument[data-read="true"]');
const manifestMarks = (figure: Locator) => figure.locator('.anatomy-manifest mark');

test('a verdict appears only after Check, with its limit and read place inline, and marks the instrument read', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'observability-signals');
  await expect(figure.locator('.anatomy-change-title')).toHaveText('10:00 · Authored start');
  await expect(figure.locator('.obs-verdict')).toHaveCount(0);

  await advance(figure).click();
  await expect(changeTitle(figure)).toHaveText('10:30 · Database failover slows the subject Pod');
  await expect(figure.locator('.obs-status')).toContainText('3 of 3 Pods in Service endpoints');

  await pickSignal(figure, 0, 'Traces');
  await expect(verdictOf(figure, 0)).toHaveCount(0);
  await expect(readMarks(figure)).toHaveCount(0);

  await checkButton(figure, 0).click();
  await expect(changeTitle(figure)).toHaveText('Proves: “Slow at 10:30” via Traces');
  const verdict = verdictOf(figure, 0);
  await expect(verdict.locator('.anatomy-badge')).toHaveText(/Proves · Traces/);
  await expect(verdict.locator('dt', { hasText: 'Cannot say' })).toBeVisible();
  await expect(verdict).toContainText('Read at 10:30');
  await expect(verdict).toContainText('Rack (sampled traces)');
  await expect(readMarks(figure)).toHaveCount(1);
  await expect(figure.locator('.obs-label-sub', { hasText: '◆ read' })).toHaveCount(1);
  await expect(figure.locator('.obs-ledger', { hasText: 'Sampled traces' }).locator('.anatomy-badge')).toHaveText(/read by last check/);
});

test('the readiness failure removes the subject from endpoints; the read mark clears on advance while the verdict is re-read', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'observability-signals');
  await advance(figure).click();
  await advance(figure).click();
  await expect(changeTitle(figure)).toHaveText('11:00 · Readiness probe fails; Service drops the subject Pod');
  await expect(figure.locator('.obs-status')).toContainText('2 of 3 Pods in Service endpoints');
  await expect(figure.locator('.obs-pod').nth(2).locator('.anatomy-badge')).toHaveText(/Not Ready/);

  await expect(manifestMarks(figure)).toHaveCount(3);
  const marked = await manifestMarks(figure).allTextContents();
  expect(marked.some((text) => text.includes('path: /ready'))).toBe(true);
  expect(marked.some((text) => text.includes('timeoutSeconds'))).toBe(true);
  expect(marked.some((text) => text.includes('consecutive failures before Ready=False'))).toBe(true);

  await pickSignal(figure, 2, 'Probes');
  await checkButton(figure, 2).click();
  await expect(verdictOf(figure, 2).locator('.anatomy-badge')).toHaveText(/Proves · Probes/);
  await expect(figure.locator('.obs-lamp[data-read="true"]')).toHaveCount(6);
  await expect(figure.locator('.obs-label-probes')).toContainText('◆ read');

  await pickSignal(figure, 2, 'Events');
  await checkButton(figure, 2).click();
  await expect(changeTitle(figure)).toHaveText('Cannot decide here: “Traffic stopped at 11:00” via Events');
  await expect(verdictOf(figure, 2).locator('.anatomy-badge')).toHaveText(/Cannot decide here · Events/);
  await expect(verdictOf(figure, 2)).toContainText('Changed');
  await expect(readMarks(figure)).toHaveCount(1);

  await advance(figure).click();
  await expect(readMarks(figure)).toHaveCount(0);
  await expect(figure.locator('.obs-ledger .anatomy-badge', { hasText: 'read by last check' })).toHaveCount(0);
  await expect(verdictOf(figure, 2).locator('.anatomy-badge')).toHaveText(/Cannot decide here · Events/);
  await expect(figure.locator('.obs-ledger').first()).toContainText('expired');
});

test('keyboard reaches the advance control and Check, and motion settles before the next step is enabled', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'observability-signals');
  const next = advance(figure);
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(changeTitle(figure)).toHaveText('10:30 · Database failover slows the subject Pod');
  await expect(figure.locator('.obs-status')).not.toContainText('apparatus settling');
  await expect(next).toBeEnabled();

  await pickSignal(figure, 1, 'Traces');
  await checkButton(figure, 1).focus();
  await page.keyboard.press('Enter');
  await expect(verdictOf(figure, 1).locator('.anatomy-badge')).toHaveText(/Proves · Traces/);
});

test('390px phone: the checked verdict, its limit and its Check button stay together, with no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'observability-signals');
  await advance(figure).click();
  await advance(figure).click();
  await expect(figure.locator('.obs-status')).not.toContainText('apparatus settling');
  await page.evaluate(() => document.fonts.ready);

  await pickSignal(figure, 2, 'Probes');
  const check = checkButton(figure, 2);
  await expect(check).toBeEnabled();
  await check.click();
  await expect(changeTitle(figure)).toHaveText(/Proves: “Traffic stopped at 11:00” via Probes/);
  const verdict = verdictOf(figure, 2);
  await expect(verdict.locator('.anatomy-badge')).toHaveText(/Proves · Probes/);
  await expect(verdict.locator('dt', { hasText: 'Cannot say' })).toHaveCount(1);

  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await verdict.scrollIntoViewIfNeeded();
  await expect(verdict).toBeInViewport({ ratio: 1 });
  await expect.poll(async () => {
    const button = await check.boundingBox();
    const box = await verdict.boundingBox();
    return button && box ? box.y - (button.y + button.height) : Number.POSITIVE_INFINITY;
  }).toBeLessThan(120);
});

test('hydration guard: the figure is mounted, and controls are enabled only after hydration', async ({ page }) => {
  const figure = await open(page, 'observability-signals');
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  await expect(advance(figure)).toBeEnabled();
  await expect(figure.getByRole('button', { name: 'Reset to 10:00', exact: true })).toBeDisabled();
});
