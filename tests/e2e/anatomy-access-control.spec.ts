import { expect, test, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const send = (figure: Locator) => figure.getByRole('button', { name: 'Send request', exact: true });
const title = (figure: Locator) => figure.locator('.anatomy-change-title');
const stage = (figure: Locator, id: string) => figure.locator(`.ac-stages li[data-stage="${id}"]`);
const gate = (figure: Locator, id: string) => figure.locator(`.ac-gate[data-gate="${id}"]`);
const rbacManifest = (figure: Locator) => figure.locator('.anatomy-manifest').nth(1);

test('an expired token is rejected at authentication and no RBAC or admission check runs', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await expect(title(figure)).toHaveText('Request not sent');
  await figure.getByRole('combobox', { name: /^Caller/ }).selectOption('expired-token');
  await expect(title(figure)).toHaveText('Request not sent');
  await send(figure).click();
  await expect(title(figure)).toHaveText('401 Unauthorized · stopped at authentication');
  await expect(stage(figure, 'authn')).toContainText('Failed');
  await expect(stage(figure, 'binding')).toContainText('Not reached');
  await expect(stage(figure, 'validate')).toContainText('Not reached');
  await expect(figure.locator('.ac-objects')).toContainText('not stored');
  await expect(figure.locator('.anatomy-manifest mark')).toHaveCount(0);
});

test('removing the RoleBinding denies a valid ServiceAccount at the subject check and highlights the absence', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await figure.getByRole('checkbox', { name: /RoleBinding deployer-pod-writer exists/ }).uncheck();
  await expect(figure.locator('.ac-objects')).toContainText('absent');
  await send(figure).click();
  await expect(title(figure)).toHaveText('403 Forbidden · RBAC denied');
  await expect(stage(figure, 'authn')).toContainText('Passed');
  await expect(stage(figure, 'binding')).toContainText('Failed');
  await expect(stage(figure, 'rule')).toContainText('Not reached');
  await expect(figure.locator('.anatomy-change')).toContainText('Admission was not reached');
  await expect(rbacManifest(figure).locator('mark')).toContainText('RoleBinding deployer-pod-writer: absent');
});

test('a Secret read is denied by the Role rule, and admission never sees it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await figure.getByRole('combobox', { name: /^Request/ }).selectOption('get-secret');
  await send(figure).click();
  await expect(title(figure)).toHaveText('403 Forbidden · RBAC denied');
  await expect(stage(figure, 'binding')).toContainText('Passed');
  await expect(stage(figure, 'rule')).toContainText('Failed: Role pod-writer has no get on secrets');
  await expect(stage(figure, 'validate')).toContainText('Not reached');
});

test('an authorized minimal Pod is rejected by PodSecurity admission, and the mutating step makes the same request admissible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await figure.getByRole('combobox', { name: /^Pod securityContext/ }).selectOption('minimal');
  await send(figure).click();
  await expect(title(figure)).toHaveText('Rejected by PodSecurity admission · nothing stored');
  await expect(stage(figure, 'binding')).toContainText('Passed');
  await expect(stage(figure, 'rule')).toContainText('Passed');
  await expect(stage(figure, 'validate')).toContainText('Failed: 4 restricted checks');
  await expect(figure.locator('.anatomy-change')).toContainText('names PodSecurity');
  await expect(figure.locator('.ac-objects')).toContainText('not stored');
  await expect(figure.locator('.ac-lamp')).toHaveAttribute('data-on', 'false');
  await expect(figure.locator('.anatomy-manifest mark').first()).toContainText('securityContext: absent');

  await figure.getByRole('checkbox', { name: /Mutating step fills unset defaults/ }).check();
  await send(figure).click();
  await expect(title(figure)).toHaveText('Pod report-job stored · unassigned');
  await expect(stage(figure, 'mutate')).toContainText('Added runAsNonRoot');
  await expect(stage(figure, 'validate')).toContainText('Passed');
  await expect(figure.locator('.ac-lamp')).toHaveAttribute('data-on', 'true');
  await expect(figure.locator('.anatomy-change')).toContainText('Not scheduled');
});

test('the machine and the numbered checks list come from one evaluation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await figure.getByRole('combobox', { name: /^Pod securityContext/ }).selectOption('minimal');
  await send(figure).click();
  await expect(title(figure)).toHaveText('Rejected by PodSecurity admission · nothing stored');
  for (const id of ['authn', 'binding', 'rule']) {
    await expect(gate(figure, id)).toHaveAttribute('data-gate-state', 'pass');
    await expect(stage(figure, id)).toHaveAttribute('data-tone', 'pass');
  }
  await expect(gate(figure, 'validate')).toHaveAttribute('data-gate-state', 'fail');
  await expect(stage(figure, 'validate')).toHaveAttribute('data-tone', 'fail');
  await expect(figure.locator('.ac-machine')).toContainText('✕');
  await expect(figure.locator('.ac-machine')).toContainText('✓');
});

test('mutation cannot repair a privileged container', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await figure.getByRole('combobox', { name: /^Pod securityContext/ }).selectOption('privileged');
  await figure.getByRole('checkbox', { name: /Mutating step fills unset defaults/ }).check();
  await send(figure).click();
  await expect(title(figure)).toHaveText('Rejected by PodSecurity admission · nothing stored');
  await expect(figure.locator('.anatomy-change')).toContainText('privileged: true');
  await expect(figure.locator('.anatomy-change')).toContainText('A default cannot remove privileged: true');
});

test('a control edit after a stored result withdraws that result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await send(figure).click();
  await expect(figure.locator('.ac-objects')).toContainText('stored · unassigned');
  await figure.getByRole('combobox', { name: /^Caller/ }).selectOption('user-alice');
  await expect(title(figure)).toHaveText('Request not sent');
  await expect(figure.locator('.ac-objects')).toContainText('not sent yet');
  await expect(stage(figure, 'persist')).toContainText('Not evaluated yet');
});

test('the request is in flight with controls disabled, then the outcome appears', async ({ page }) => {
  const figure = await open(page, 'access-control');
  // The motion lasts about a second, and a loaded machine can let it finish between two test commands.
  // So the in-flight state is read inside the same task as the click: the send handler updates the DOM synchronously.
  // The figure is scrolled into view first, because the motion only advances while the figure is on screen.
  await figure.scrollIntoViewIfNeeded();
  const inFlight = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.ac-figure button')).find((candidate) => candidate.textContent?.trim() === 'Send request');
    if (!button) throw new Error('Send request button is missing');
    button.click();
    return {
      title: document.querySelector('.anatomy-change-title')?.textContent ?? '',
      disabled: button.disabled,
      objects: document.querySelector('.ac-objects')?.textContent ?? '',
    };
  });
  expect(inFlight).toMatchObject({ title: 'Request in flight', disabled: true });
  expect(inFlight.objects).toContain('in flight · not stored yet');
  await expect(title(figure)).toHaveText('Pod report-job stored · unassigned', { timeout: 15000 });
  await expect(send(figure)).toBeEnabled();
});

test('keyboard can toggle a control and send, and the result follows the send', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await expect(stage(figure, 'authn')).toContainText('Not evaluated yet');
  const binding = figure.getByRole('checkbox', { name: /RoleBinding deployer-pod-writer exists/ });
  await binding.focus();
  await page.keyboard.press('Space');
  await expect(binding).not.toBeChecked();
  await send(figure).focus();
  await page.keyboard.press('Enter');
  await expect(title(figure)).toHaveText('403 Forbidden · RBAC denied');
});

test('at 390px Send sits within the first one and a half screens, and nothing overflows horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'access-control');
  await send(figure).click();
  await expect(title(figure)).toHaveText('Pod report-job stored · unassigned');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const button = await send(figure).boundingBox();
  expect(button && button.x + button.width <= 390).toBe(true);
  expect(button && button.y < 844 * 1.5).toBe(true);
  const change = await figure.locator('.anatomy-change').boundingBox();
  expect(change && change.x + change.width <= 390).toBe(true);
});
