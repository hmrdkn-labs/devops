import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, slug: string) {
  await page.goto(`/anatomy/${slug}/`);
  const figure = page.locator('.anatomy-figure');
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  return figure;
}

test('delayed hydration keeps the original object readable and controls inert', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/_astro\/Figure\.[^/]+\.js$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto('/anatomy/node-affinity/', { waitUntil: 'commit' });
  const figure = page.locator('.affinity-sorter');
  try {
    await expect.poll(() => held).toBe(true);
    await expect(figure).toHaveAttribute('aria-busy', 'true');
    await expect(figure.getByRole('img')).toBeVisible();
    const step = figure.getByRole('button', { name: 'Step placement', exact: true });
    await expect(step).toBeDisabled();
    const before = await figure.locator('.anatomy-readout').textContent();
    await step.evaluate((element) => (element as HTMLButtonElement).click());
    expect(await figure.locator('.anatomy-readout').textContent()).toBe(before);
    const object = await figure.boundingBox();
    const explanation = await page.locator('.anatomy-explanation').boundingBox();
    expect(object).not.toBeNull();
    expect(explanation).not.toBeNull();
    expect(explanation!.y).toBeGreaterThanOrEqual(object!.y + object!.height);
  } finally { release(); }
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  await expect(figure.getByRole('button', { name: 'Step placement', exact: true })).toBeEnabled();
});

test('cluster checkpoints separate API objects, assignment and node-side execution', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'cluster-responsibilities');
  const next = figure.getByRole('button', { name: 'Next checkpoint', exact: true });
  const value = (label: string) => figure.locator('.cc-state > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd');
  for (let i = 0; i < 4; i++) await next.click();
  await expect(value('Pod objects')).toHaveText('1');
  await expect(value('Assigned node')).toHaveText('unassigned');
  await expect(value('Running containers')).toHaveText('0');
  await next.click();
  await expect(value('Assigned node')).toHaveText('node-a');
  await expect(value('Running containers')).toHaveText('0');
  await next.click();
  await expect(value('Running containers')).toHaveText('0');
  await next.click();
  await expect(value('Running containers')).toHaveText('1');
  await expect(value('API Pod status')).toHaveText('Running reported');
  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(value('Pod objects')).toHaveText('0');
  await expect(value('Running containers')).toHaveText('0');
});

test('inspection moves a real drawer by keyboard without changing workload state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const figure = await open(page, 'cluster-responsibilities');
  const drawer = figure.locator('.cc-assembly[data-selected="true"]');
  const before = await drawer.boundingBox();
  const inspect = figure.getByRole('button', { name: 'Open inspection drawer', exact: true });
  await inspect.focus();
  await inspect.press('Enter');
  await expect(figure.getByRole('button', { name: 'Close inspection drawer', exact: true })).toBeEnabled();
  await expect.poll(async () => (await drawer.boundingBox())!.x).not.toBe(before!.x);
  await expect(figure.locator('.cc-state > div').filter({ has: page.locator('dt', { hasText: 'Running containers' }) }).locator('dd')).toHaveText('0');
  await expect(figure.locator('.cc-state > div').filter({ has: page.locator('dt', { hasText: 'Pod objects' }) }).locator('dd')).toHaveText('0');
});

test('replica replacement gets a fresh identity and rollout respects surge and availability', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'replica-reconciliation');
  const desired = figure.getByRole('combobox', { name: 'Desired replicas', exact: true });
  const readout = figure.locator('.anatomy-readout');
  const identities = figure.locator('.replica-ledger li strong');
  const originalIds = await identities.allTextContents();
  const initialDesired = Number(await desired.inputValue());
  await expect(readout).toContainText(`Deployment desired ${initialDesired}`);
  const removed = originalIds[1]!;
  await figure.getByRole('combobox', { name: 'Pod identity', exact: true }).selectOption(removed.slice(1));
  await figure.getByRole('button', { name: 'Delete selected Pod', exact: true }).click();
  await expect(identities.filter({ hasText: new RegExp(`^${removed}$`) })).toHaveCount(0);
  await expect(readout).toContainText(`Observed non-terminating Pods ${initialDesired - 1}`);
  const step = figure.getByRole('button', { name: 'Step reconciliation', exact: true });
  await step.click();
  const replacements = (await identities.allTextContents()).filter((id) => !originalIds.includes(id));
  expect(replacements).toHaveLength(1);
  expect(replacements[0]).not.toBe(removed);
  await expect(readout).toContainText(`Ready ${initialDesired - 1}`);
  await step.click();
  await expect(readout).toContainText(`Ready ${initialDesired}`);
  await desired.selectOption('4');
  for (let i = 0; i < 12 && !(await readout.locator('strong').textContent())?.startsWith('Converged'); i++) await step.click();
  await expect(readout).toContainText('Observed non-terminating Pods 4 · Ready 4');
  await figure.getByRole('button', { name: 'Change template to app:v2', exact: true }).click();
  for (let i = 0; i < 40 && !(await readout.locator('strong').textContent())?.startsWith('Converged'); i++) {
    await step.click();
    expect(await figure.locator('.replica-ledger li').count()).toBeLessThanOrEqual(5);
    const readyCount = (await readout.textContent())!.match(/\bReady (\d+)/);
    expect(Number(readyCount?.[1])).toBeGreaterThanOrEqual(4);
  }
  await expect(readout.locator('strong')).toHaveText('Converged');
  await expect(readout).toContainText('RS-v1 target 0 / observed 0');
  await expect(readout).toContainText('RS-v2 target 4 / observed 4');
  await expect(figure.locator('.replica-ledger li')).toHaveCount(4);
});

test('resource widgets agree with the model and failed feasibility cannot be scored', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'scheduling-placement');
  const cpu = figure.getByRole('combobox', { name: 'CPU request', exact: true });
  const memory = figure.getByRole('combobox', { name: 'Memory request', exact: true });
  const assertRequest = async () => {
    const shown = `${await cpu.inputValue()}m / ${await memory.inputValue()}Mi`;
    for (const node of await figure.locator('.capacity-node').all()) {
      await expect(node.locator('dd').last()).toHaveText(shown);
    }
  };
  await assertRequest();
  await figure.getByRole('button', { name: '1 · Filter budgets', exact: true }).click();
  await figure.getByRole('button', { name: '2 · Score eligible nodes', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('nodeName still empty');
  await figure.getByRole('button', { name: '3 · Record assignment', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('nodeName node-c · containers not started');
  await cpu.selectOption('1500');
  await assertRequest();
  await figure.getByRole('button', { name: '1 · Filter budgets', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('Unscheduled');
  await expect(figure.locator('.anatomy-readout')).toContainText('nodeName empty');
  await expect(figure.getByRole('button', { name: '2 · Score eligible nodes', exact: true })).toBeDisabled();
  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  await assertRequest();
});

test('tolerations only permit a candidate; capacity and other candidates still matter', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'taints-tolerations');
  const attempt = () => figure.getByRole('button', { name: /^(Attempt|Replay) placement$/ });
  const readout = figure.locator('.anatomy-readout');
  await attempt().click();
  await expect(readout).toContainText('Unscheduled');
  await figure.getByRole('combobox', { name: 'Toleration profile', exact: true }).selectOption('equal');
  await attempt().click();
  await expect(readout).toContainText('Assigned: node-a');
  await expect(readout).toContainText('not proof of Running');
  await figure.getByRole('checkbox', { name: 'Node A: enough CPU', exact: true }).uncheck();
  await attempt().click();
  await expect(readout).toContainText('Unscheduled');
  await figure.getByRole('checkbox', { name: 'Node B: available (higher fixture score)', exact: true }).check();
  await figure.getByRole('checkbox', { name: 'Node A: enough CPU', exact: true }).check();
  await attempt().click();
  await expect(readout).toContainText('Assigned: node-b');
  await expect(figure.locator('.tt-facts')).toContainText('taint permits');
});

test('affinity preferences cannot rescue hard failures and running label changes do not evict', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, 'node-affinity');
  const selects = figure.getByRole('combobox');
  const readChoices = async () => Promise.all((await selects.all()).map((select) => select.inputValue()));
  const initialChoices = await readChoices();
  await selects.nth(0).selectOption('ssd');
  await selects.nth(1).selectOption('east-ssd');
  await selects.nth(2).selectOption('west');
  const weight = figure.getByRole('slider');
  await weight.focus();
  await weight.press('End');
  const step = () => figure.getByRole('button', { name: /^(Step placement|Simulate kubelet start)$/ });
  for (let i = 0; i < 3; i++) await step().click();
  await expect(figure.locator('.anatomy-readout')).toContainText('Assigned to node-a');
  await expect(figure.locator('.anatomy-readout')).toContainText('containers have not started');
  await step().click();
  await figure.getByRole('button', { name: 'Change running-node labels', exact: true }).click();
  await expect(figure.locator('.anatomy-readout')).toContainText('Still running on node-a');
  await expect(figure.locator('.anatomy-readout')).toContainText('no eviction');
  await figure.getByRole('button', { name: 'Reset', exact: true }).click();
  expect(await readChoices()).toEqual(initialChoices);
  await selects.nth(0).selectOption('hdd');
  await selects.nth(1).selectOption('east-ssd');
  for (let i = 0; i < 2; i++) await step().click();
  await expect(figure.locator('.anatomy-readout')).toContainText('Unscheduled');
  await expect(figure.locator('.anatomy-readout')).toContainText('zero eligible nodes');
  await expect(step()).toBeDisabled();
});

test('related Anatomy exploration preserves the current learner draft', async ({ page }) => {
  await page.goto('/learn/kubernetes-architecture-components/');
  const draft = page.getByRole('textbox', { name: 'Your explanation', exact: true });
  await draft.fill('The scheduler binds a Pod; node-side components execute it.');
  const link = page.locator('.anatomy-discovery a[href="/anatomy/cluster-responsibilities/"]');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup.locator('.cluster-console')).toHaveAttribute('aria-busy', 'false');
  await popup.close();
  await expect(draft).toHaveValue('The scheduler binds a Pod; node-side components execute it.');
});

test('phone explanations keep tables and long field names inside the reading surface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const slug of ['cluster-responsibilities', 'replica-reconciliation', 'scheduling-placement', 'taints-tolerations', 'node-affinity']) {
    await open(page, slug);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
  await open(page, 'replica-reconciliation');
  const table = page.locator('.reference-table-scroll').first();
  await table.focus();
  await table.press('ArrowRight');
  await expect.poll(() => table.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
