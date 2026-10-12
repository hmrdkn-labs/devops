import { test, expect, type Locator } from '@playwright/test';
import { open } from './anatomy/helpers';

const slug = 'namespaces-scope';

function controls(figure: Locator) {
  return {
    namespace: figure.getByRole('combobox', { name: 'Namespace', exact: true }),
    kind: figure.getByRole('combobox', { name: 'Kind', exact: true }),
    name: figure.getByRole('combobox', { name: 'Name', exact: true }),
    button: (name: string) => figure.getByRole('button', { name, exact: true }),
    report: figure.locator('.anatomy-change'),
    title: figure.locator('.anatomy-change .anatomy-change-title'),
    bay: (namespace: string) => figure.locator(`section[aria-label="${namespace} status"]`),
    reach: figure.locator('section[aria-label="Path from team-a to team-b"]'),
    cluster: figure.locator('section[aria-label="Cluster-scoped status"]'),
  };
}

test('a duplicate Deployment name in one namespace is refused and the ledger is unchanged', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.button('Create Deployment web in team-a').click();
  await expect(c.title).toContainText('Create refused: Deployment web already exists in namespace team-a');
  await expect(c.report).toContainText('Nothing changed');
  await expect(c.bay('team-a')).toContainText('1 namespaced object');
});

test('the same kind and name is accepted in the other namespace; its chip sits in the team-b panel', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.namespace.selectOption('team-b');
  await c.button('Create Deployment web in team-b').click();
  await expect(c.title).toContainText('Deployment web created in namespace team-b');
  const panel = c.bay('team-b');
  await expect(panel.locator('h3')).toContainText('team-b');
  await expect(panel.locator('.ns-chip', { hasText: 'Deployment/team-b/web' })).toBeVisible();
  await expect(c.bay('team-a').locator('.ns-chip', { hasText: 'Deployment/team-a/web' })).toBeVisible();
  await expect(figure.locator('.anatomy-manifest mark', { hasText: 'namespace: team-b' })).toHaveCount(1);
});

test('the target marker follows the namespace select, and moves to the tower for a ClusterRole', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  const marker = (ns: string) => figure.locator(`.ns-tab[data-ns="${ns}"] .ns-target`);
  await expect(marker('team-a')).toBeVisible();
  await expect(marker('team-b')).toHaveCount(0);
  await c.namespace.selectOption('team-b');
  await expect(marker('team-b')).toBeVisible();
  await expect(figure.locator('.ns-strip-item[aria-current="true"]')).toContainText('team-b');
  await expect(marker('team-a')).toHaveCount(0);
  await c.kind.selectOption('ClusterRole');
  await expect(figure.locator('.ns-tab[data-ns="tower"] .ns-target')).toBeVisible();
  await expect(figure.locator('.ns-strip-item[aria-current="true"]')).toContainText('cluster-scoped');
  await expect(marker('team-b')).toHaveCount(0);
});

test('deleting a namespace marks it Terminating, refuses creates, then removes only its namespaced objects', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.namespace.selectOption('team-b');
  await c.button('Create Deployment web in team-b').click();
  await expect(c.title).toContainText('created in namespace team-b');

  await c.button('Delete namespace team-b').click();
  await expect(c.title).toContainText('team-b is Terminating');
  await expect(c.bay('team-b')).toContainText('Terminating');
  await expect(c.bay('team-b')).toContainText('Deployment/team-b/web');

  await c.button('Create Deployment web in team-b').click();
  await expect(c.title).toContainText('Create refused: team-b is Terminating');

  await c.button('Complete cleanup of team-b').click();
  await expect(c.title).toContainText('team-b removed with 1 namespaced object');
  await expect(c.bay('team-b')).toContainText('Absent');
  await expect(c.bay('team-b')).not.toContainText('Deployment/team-b/web');
  await expect(c.bay('team-a')).toContainText('Deployment/team-a/web');
  await expect(c.reach).toContainText('team-b is absent: nothing to reach');
  await expect(c.button('Create namespace team-b')).toBeEnabled();
});

test('a NetworkPolicy in team-b changes only the ingress row; the namespace and DNS row stay separate', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  await expect(c.reach).toContainText('no Service web in team-b: the name does not resolve');
  await expect(c.reach).toContainText('no NetworkPolicy in team-b: ingress not restricted');
  await c.kind.selectOption('NetworkPolicy');
  await c.namespace.selectOption('team-b');
  await c.button('Create NetworkPolicy deny-ingress in team-b').click();
  await expect(c.title).toContainText('NetworkPolicy deny-ingress created in namespace team-b');
  await expect(c.reach).toContainText('NetworkPolicy in team-b: ingress to its Pods is blocked, except from their node');
  await expect(c.reach).toContainText('no Service web in team-b: the name does not resolve');
  await expect(c.bay('team-b')).toContainText('NetworkPolicy/team-b/deny-ingress');

  // Every reach chip must sit inside its panel: the full sentence wraps, it does not run past the right edge.
  const panel = await c.reach.boundingBox();
  const chips = c.reach.locator('.anatomy-badge');
  for (let index = 0; index < (await chips.count()); index += 1) {
    const chip = await chips.nth(index).boundingBox();
    expect(chip).not.toBeNull();
    expect(chip!.x + chip!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
  }

  await c.button('Delete NetworkPolicy deny-ingress in team-b').click();
  await expect(c.title).toContainText('NetworkPolicy deny-ingress deleted from namespace team-b');
  await expect(c.reach).toContainText('no NetworkPolicy in team-b: ingress not restricted');
  await expect(c.bay('team-b')).not.toContainText('NetworkPolicy/team-b/deny-ingress');
  await expect(c.report).toContainText('Other namespaces and cluster-scoped objects are not changed');
});

test('a ClusterRole has one identity whatever namespace is selected', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.kind.selectOption('ClusterRole');
  await c.button('Create ClusterRole web (cluster-scoped)').click();
  await expect(c.title).toContainText('ClusterRole web created in the cluster');
  await expect(c.cluster).toContainText('ClusterRole/web');
  await c.namespace.selectOption('team-b');
  await c.button('Create ClusterRole web (cluster-scoped)').click();
  await expect(c.title).toContainText('Create refused: ClusterRole web already exists');
  await expect(c.report).toContainText('Nothing changed');
});

test('keyboard focus reaches the refused action and Enter triggers it', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  const create = c.button('Create Deployment web in team-a');
  await create.focus();
  await expect(create).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(c.title).toContainText('already exists');
});

test('reduced motion settles the figure at once; the controls are enabled after the action', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.button('Delete namespace team-a').click();
  await expect(c.title).toContainText('team-a is Terminating');
  await expect(c.button('Complete cleanup of team-a')).toBeEnabled();
});

test('the phone first screen shows the pressed button, the report and the first drawer status inside the viewport', async ({ page }) => {
  const size = page.viewportSize();
  test.skip(!size || size.width > 560, 'phone layout only');
  const figure = await open(page, slug);
  const c = controls(figure);
  // Start the first screen at the selects: the pressed button is then inside the viewport, so the click does not scroll.
  await figure.locator('.ns-selects').evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
  const create = c.button('Create Deployment web in team-a');
  await create.click();
  await expect(c.title).toBeVisible();
  const visible = [
    create,
    c.title,
    c.report.locator('dd').first(),
    figure.locator('.ns-strip-item').first(),
  ];
  for (const locator of visible) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(size!.height);
  }
});

test('phone selects show their selected text in full', async ({ page }) => {
  const size = page.viewportSize();
  test.skip(!size || size.width > 560, 'phone layout only');
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.kind.selectOption('NetworkPolicy');
  for (const select of [c.namespace, c.kind, c.name]) {
    const fits = await select.evaluate((element) => {
      const selectElement = element as unknown as HTMLSelectElement;
      const style = window.getComputedStyle(element as never);
      const context = document.createElement('canvas').getContext('2d')!;
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const selected = selectElement.options[selectElement.selectedIndex]!.text;
      const needed = context.measureText(selected).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      return needed <= selectElement.clientWidth;
    });
    expect(fits).toBe(true);
  }
});

test('the phone layout has no horizontal overflow', async ({ page }) => {
  const figure = await open(page, slug);
  const c = controls(figure);
  await c.button('Create Deployment web in team-a').click();
  await expect(c.report).toBeVisible();
  await expect(c.bay('team-a')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
