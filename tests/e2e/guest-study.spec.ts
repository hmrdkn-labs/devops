import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('guest completes the question-first study flow without persistence', async ({ page }) => {
  await page.goto('/learn/processes-and-resources');
  await expect(page.getByRole('heading', { name: 'Processes and finite resources' })).toBeVisible();
  await expect(page.getByText('Concise model')).toBeHidden();

  await page.getByLabel('Your explanation').fill('A running process has an identity and consumes finite resources.');
  await page.getByRole('button', { name: 'Save privately & reveal' }).click();
  await expect(page.getByText('Concise model')).toBeVisible();
  await page.getByRole('button', { name: 'Good' }).click();
  await expect(page.getByText('Review needed', { exact: true })).toBeVisible();
  await expect(page.getByText(/0 of 2 critical points were present/)).toBeVisible();
  await expect(page.getByText('Add these missing ideas:')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Guest answer kept in memory');
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByLabel('Your explanation')).toBeFocused();

  await page.getByLabel('Your explanation').fill('CPU time, memory, file descriptors, and I/O are finite.');
  await page.getByRole('button', { name: 'Save privately & reveal' }).click();
  await page.getByRole('button', { name: 'Hard' }).click();
  await page.getByRole('button', { name: 'Open the lesson' }).click();
  await expect(page.getByText('Lesson revealed')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Apply the model safely' })).toBeVisible();
});

test('authenticated reveal is immediate even while persistence is still pending', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Optimistic persistence behavior only needs one browser project');
  let releaseAttempt!: () => void;
  let attemptStarted = false;
  const attemptGate = new Promise<void>((resolve) => {
    releaseAttempt = resolve;
  });

  await page.route('**/api/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, authConfigured: true }),
  }));
  await page.route('**/api/progress', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ units: [] }),
  }));
  await page.route('**/api/answers?unitId=*', (route) => {
    const metadataOnly = new URL(route.request().url()).searchParams.get('view') === 'metadata';
    const answers = [
      {
        unitRevision: 1,
        questionId: 'fpp:processes-and-resources/q-process',
        answerMarkdown: 'Earlier I explained that a process has identity plus finite CPU and memory resources.',
        createdAt: 1_786_000_000_000,
      },
      {
        unitRevision: 1,
        questionId: 'fpp:processes-and-resources/q-process',
        answerMarkdown: 'My oldest explanation said that a process is a running program with resource limits.',
        createdAt: 1_785_000_000_000,
      },
    ];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        unitId: 'fpp:processes-and-resources',
        answers: metadataOnly
          ? answers.map(({ answerMarkdown: _answerMarkdown, ...entry }) => entry)
          : answers,
      }),
    });
  });
  await page.route('**/api/attempt', async (route) => {
    attemptStarted = true;
    await attemptGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ persisted: true }),
    });
  });

  await page.goto('/learn/processes-and-resources');
  await expect(page.getByText('Saved explanations')).toBeHidden();
  await expect(page.getByTestId('answer-history-cue')).toContainText('Answered before');
  await expect(page.getByTestId('answer-history-cue')).toContainText('2 saved attempts');
  await expect(page.getByText('Earlier I explained that a process has identity plus finite CPU and memory resources.')).toBeHidden();
  await expect(page.getByText('My oldest explanation said that a process is a running program with resource limits.')).toBeHidden();
  await page.getByRole('button', { name: 'Review previous answers' }).click();
  await expect(page.getByRole('heading', { name: 'Your explanations' })).toBeVisible();
  await expect(page.getByText('Earlier I explained that a process has identity plus finite CPU and memory resources.')).toBeVisible();
  await expect(page.getByText('My oldest explanation said that a process is a running program with resource limits.')).toBeVisible();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await expect(page.getByText('Earlier I explained that a process has identity plus finite CPU and memory resources.')).toBeHidden();
  await page.getByLabel('Your explanation').fill('A process consumes finite resources.');
  await page.getByRole('button', { name: 'Save privately & reveal' }).click();

  await expect.poll(() => attemptStarted).toBe(true);
  await expect(page.getByText('Concise model')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Saving privately');
  await expect(page.getByTestId('answer-history-current')).toContainText('Earlier I explained that a process has identity');

  releaseAttempt();
  await expect(page.getByRole('status')).toContainText('Private answer saved.');
  await page.getByRole('button', { name: 'Reference', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your explanations' })).toBeVisible();
  await expect(page.getByText('Earlier I explained that a process has identity plus finite CPU and memory resources.')).toBeVisible();
  await expect(page.getByText('My oldest explanation said that a process is a running program with resource limits.')).toBeVisible();
  await expect(page.getByText('2 saved attempts')).toBeVisible();
});

test('Kubernetes reference visual names component position, responsibility, target, and proof', async ({ page }) => {
  await page.goto('/learn/kubernetes-architecture-components?mode=reference');
  const visual = page.getByTestId('lesson-visual-guide').first();
  await expect(visual).toContainText('kube-apiserver ↔ etcd: persist API state');
  await expect(visual).toContainText('ReplicaSet controller ↔ kube-apiserver: observe ReplicaSet, create Pod');
  const map = page.getByRole('region', { name: 'Component responsibility map' });
  await expect(map).toBeVisible();
  await expect(map).toContainText('ReplicaSet controller');
  await expect(map).toContainText('control plane');
  await expect(map).toContainText('Works on');
  await expect(map).toContainText('kubectl describe rs <name>');
});

test('new learners can learn first or use reference mode without faking recall', async ({ page }) => {
  await page.goto('/learn/ip-subnets');

  const reveal = page.getByRole('button', { name: 'Save privately & reveal' });
  await expect(reveal).toBeDisabled();

  const hint = page.getByRole('button', { name: 'Give me a hint' });
  await expect(hint).toBeEnabled();
  await hint.click();
  await expect(page.getByText('Directional hint')).toBeVisible();
  await expect(reveal).toBeDisabled();

  await page.getByRole('button', { name: "I haven't learned this yet" }).click();
  await expect(page.getByRole('heading', { name: 'Build the model first.' })).toBeVisible();
  await expect(page.getByTestId('reference-visuals')).toBeVisible();
  await expect(page.getByTestId('lesson-visual-guide').first()).toBeVisible();
  await expect(page.getByLabel('Your explanation')).toBeHidden();
  await page.getByRole('button', { name: 'Try the question now' }).click();
  await expect(page.getByLabel('Your explanation')).toBeVisible();
  await expect(page.getByLabel('Your explanation')).toBeFocused();

  await page.getByRole('button', { name: 'Reference', exact: true }).click();
  await expect(page.getByText('Reference lesson')).toBeVisible();
  await expect(page).toHaveURL(/\?mode=reference$/);
  await expect(page.getByTestId('reference-visuals')).toBeVisible();
  const visual = page.getByTestId('lesson-visual-guide').first();
  await visual.getByRole('button', { name: 'Next →' }).click();
  await expect(visual.locator('.lesson-visual-counter')).toContainText('2 /');
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
  await expect(page.getByLabel('Your explanation')).toBeHidden();
  const lessonCompletion = page.getByRole('button', { name: 'Mark lesson read' });
  await lessonCompletion.click();
  await expect(page.getByRole('button', { name: 'Lesson read ✓' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Guest mode: completion stays in memory for this page only.')).toBeVisible();
  await page.locator('.depth-card summary').first().click();
  await page.getByRole('button', { name: 'Mark practice complete' }).first().click();
  await expect(page.getByRole('button', { name: 'Practice completed ✓' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await expect(page.getByLabel('Your explanation')).toBeVisible();
  await expect(page).not.toHaveURL(/mode=reference/);
  await expect(page.getByTestId('study-surface')).toHaveCount(1);
});

test('reduced-motion study transitions stay immediate and preserve the return focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/learn/ip-subnets');

  await page.getByRole('button', { name: "I haven't learned this yet" }).click();
  await expect(page.getByRole('heading', { name: 'Build the model first.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try the question now' }).click();
  await expect(page.getByLabel('Your explanation')).toBeFocused();
  await expect(page.locator('html')).not.toHaveAttribute('data-study-transition');
});

test('reference lessons with long technical literals stay inside the viewport', async ({ page }) => {
  await page.goto('/learn/kubernetes-networking-request-path?mode=reference');
  await expect(page.getByTestId('reference-visuals')).toBeVisible();
  await expect(page.getByTestId('study-surface').getByText('http://catalog.default.svc.cluster.local:8080')).toBeVisible();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
});

test('public search finds exact canonical content', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('searchbox').fill('container network');
  await expect(page.getByRole('link', { name: /Container networking and storage/ })).toBeVisible();
});

test('primary public pages have no serious automated accessibility violations', async ({ page }) => {
  test.slow();
  const routes = ['/', '/kcna', '/practice/kcna', '/paths/kcna', '/learn/kcna-kubernetes-resources-review', '/review', '/map', '/library', '/search'];

  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((nextTheme) => localStorage.setItem('hmrdkn-theme', nextTheme), theme);

    for (const route of routes) {
      await page.goto(route);
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? '')),
        `${route} (${theme}) should have no serious or critical automated accessibility violations`,
      ).toEqual([]);
    }
  }
});
