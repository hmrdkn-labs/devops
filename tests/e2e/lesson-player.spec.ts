import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const lessonRoute = '/lesson/kcna-kubernetes-resources';
const checkpointLessons = [
  { checkpoint: 'fundamentals', title: 'Kubernetes Fundamentals', route: '/lesson/kcna-kubernetes-fundamentals', exercises: 11 },
  { checkpoint: 'resources', title: 'Kubernetes Resources', route: lessonRoute, exercises: 12 },
  { checkpoint: 'cluster-behavior', title: 'Cluster Behavior', route: '/lesson/kcna-cluster-behavior', exercises: 11 },
  { checkpoint: 'cloud-native', title: 'Cloud-Native Context', route: '/lesson/kcna-cloud-native-context', exercises: 11 },
] as const;

async function check(page: Page) {
  await page.getByTestId('lesson-check').click();
  await expect(page.getByTestId('lesson-feedback')).toBeVisible();
}

async function continueLesson(page: Page, nextStep: number) {
  await page.getByTestId('lesson-continue').click();
  await expect(page.locator('.lesson-step-count')).toHaveText(`${nextStep} / 12`);
  await expect(page.getByTestId('lesson-active-task')).toHaveCount(1);
}

test('KCNA Resources opens as one focused, keyboard-completable task', async ({ page }) => {
  let persistenceRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/lesson-event') persistenceRequests += 1;
  });

  await page.goto('/kcna');
  await page.locator('[data-checkpoint="resources"] > summary').click();
  await page.getByRole('link', { name: /Learn Kubernetes Resources by doing/ }).click();
  await expect(page).toHaveURL(new RegExp(`${lessonRoute}/?$`));

  await expect(page.locator('.site-header')).toHaveCount(0);
  await expect(page.locator('.site-footer')).toHaveCount(0);
  await expect(page.locator('.mobile-dock')).toHaveCount(0);
  await expect(page.locator('.page-hero')).toHaveCount(0);
  await expect(page.getByTestId('lesson-active-task')).toHaveCount(1);
  await expect(page.getByRole('progressbar', { name: 'Lesson progress' })).toHaveAttribute('aria-valuenow', '8');
  await expect(page.getByRole('link', { name: /Exit/ })).toHaveAttribute('href', '/kcna#resources');

  const heading = page.getByTestId('lesson-active-task').getByRole('heading', { level: 1 });
  const box = await heading.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThan(viewport!.height);

  const answer = page.locator('.lesson-option').nth(1);
  await answer.focus();
  const focusStyle = await answer.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) };
  });
  expect(focusStyle.style).not.toBe('none');
  expect(focusStyle.width).toBeGreaterThanOrEqual(2);
  await answer.press('Space');
  await expect(answer).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('lesson-check')).toBeEnabled();

  await check(page);
  const feedback = page.getByTestId('lesson-feedback');
  await expect(feedback.getByRole('heading', { name: 'The ReplicaSet closes the gap.' })).toBeVisible();
  await expect(feedback.getByText(/Deleting a managed Pod is not the same operation as scaling/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  expect(persistenceRequests).toBe(0);

  await continueLesson(page, 2);
  await expect(page.getByRole('heading', { name: /Put these workload objects/ })).toBeVisible();
});

test('every KCNA checkpoint exposes the same interactive lesson model', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Catalog and checkpoint identity only need one browser project');

  await page.goto('/kcna');
  const launches = page.locator('.kcna-lesson-launch');
  await expect(launches).toHaveCount(checkpointLessons.length);
  for (const lesson of checkpointLessons) {
    const launch = page.locator(`[data-checkpoint="${lesson.checkpoint}"] a.kcna-lesson-launch`);
    await expect(launch).toHaveAttribute('href', lesson.route);
    await expect(launch).toContainText(`Learn ${lesson.title} by doing`);
    await expect(launch).toContainText(`${lesson.exercises} focused interactions`);
  }

  for (const lesson of checkpointLessons) {
    await page.goto(lesson.route);
    await expect(page.locator('.lesson-player-title span')).toHaveText(lesson.title);
    await expect(page.locator('.lesson-step-count')).toHaveText(`1 / ${lesson.exercises}`);
    await expect(page.getByRole('link', { name: /Exit/ })).toHaveAttribute('href', `/kcna#${lesson.checkpoint}`);
    await expect(page.getByTestId('lesson-active-task')).toHaveCount(1);
    await page.getByRole('button', { name: 'Learn first' }).click();
    const visual = page.getByTestId('lesson-visual-guide');
    await expect(visual).toBeVisible();
    await expect(visual.getByText('Learn visually')).toBeVisible();
    await expect(visual.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(visual.getByRole('button', { name: 'Next →' })).toBeVisible();
  }
});

test('visual walkthrough supports stepping, replay, and feedback presentation', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Visual walkthrough behavior only needs one browser project');
  await page.goto(lessonRoute);
  await page.getByRole('button', { name: 'Learn first' }).click();

  const learnVisual = page.getByTestId('lesson-visual-guide');
  const counter = learnVisual.locator('.lesson-visual-counter');
  await expect(counter).toHaveText(/1 \/ [2-9]/);
  await learnVisual.getByRole('button', { name: 'Next →' }).click();
  await expect(counter).toHaveText(/2 \/ [2-9]/);
  await learnVisual.getByRole('button', { name: '← Back' }).click();
  await expect(counter).toHaveText(/1 \/ [2-9]/);
  await learnVisual.getByRole('button', { name: 'Next →' }).click();
  await learnVisual.getByRole('button', { name: 'Replay' }).click();
  await expect(counter).toHaveText(/1 \/ [2-9]/);

  await page.getByRole('button', { name: 'Try a new variant' }).click();
  await page.locator('.lesson-option').first().click();
  await check(page);
  const feedbackVisual = page.getByTestId('lesson-feedback').getByTestId('lesson-visual-guide');
  await expect(feedbackVisual).toBeVisible();
  await expect(feedbackVisual.getByText('See what changed')).toBeVisible();
  await expect(feedbackVisual.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
});

test('all KCNA checkpoint lessons stay within the responsive viewport', async ({ page }) => {
  for (const lesson of checkpointLessons) {
    await page.goto(lesson.route);
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport!.width);
    await expect(page.getByTestId('lesson-active-task')).toHaveCount(1);
  }
});

test('wrong feedback teaches the causal model and every distractor', async ({ page }) => {
  await page.goto(lessonRoute);
  await page.locator('.lesson-option').first().click();
  await check(page);

  const feedback = page.getByTestId('lesson-feedback');
  await expect(feedback.getByText('Not quite', { exact: true })).toBeVisible();
  await expect(feedback.getByText(/Your answer — It stays at 2/)).toBeVisible();
  await expect(feedback.getByText(/Expected answer — The ReplicaSet creates a replacement Pod/)).toBeVisible();
  await expect(page.locator('.lesson-option[data-state="wrong-selected"]')).toContainText('Your answer · Incorrect');
  await expect(page.locator('.lesson-option[data-state="correct-missed"]')).toContainText('Expected answer');
  await expect(feedback.locator('.lesson-visual-stage').getByText('desired = 3')).toBeVisible();
  await expect(feedback.getByText(/A ReplicaSet continuously reconciles/)).toBeVisible();
  await expect(feedback.getByText(/Deleting a Pod does not change the Deployment specification/)).toBeVisible();
  await expect(page.getByTestId('lesson-retry')).toBeVisible();
  await expect(page.getByTestId('lesson-continue')).toBeVisible();

  await page.getByTestId('lesson-retry').click();
  await expect(feedback).toHaveCount(0);
  await expect(page.getByText('Predict state · assisted')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('remains encounter evidence');
  await expect(page.locator('.lesson-option').first()).toBeEnabled();
});

test('ordered feedback marks each position and supports an honest correction', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Detailed ordering feedback only needs one browser project');
  await page.goto(lessonRoute);

  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await continueLesson(page, 2);
  await page.getByRole('button', { name: 'Move Deployment up' }).click();
  await page.getByRole('button', { name: 'Move Deployment up' }).click();
  await page.getByRole('button', { name: 'Move ReplicaSet up' }).click();
  await check(page);
  await continueLesson(page, 3);
  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await continueLesson(page, 4);

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Move Starting intent: desired replicas is 3 up' }).click();
  }
  await check(page);
  await expect(page.getByTestId('lesson-feedback').getByText('3 of 5 positions are correct. Compare the two sequences below.')).toBeVisible();
  await expect(page.locator('.lesson-answer-compare')).toContainText('Your order');
  await expect(page.locator('.lesson-answer-compare')).toContainText('Expected order');
  await expect(page.locator('.lesson-order-item').nth(0)).toContainText('Expected #2');
  await expect(page.locator('.lesson-order-item').nth(1)).toContainText('Expected #1');

  await page.getByTestId('lesson-retry').click();
  await page.getByRole('button', { name: 'Move Starting intent: desired replicas is 3 up' }).click();
  await check(page);
  await expect(page.getByTestId('lesson-feedback').getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.locator('.lesson-order-item[data-state="correct"]')).toHaveCount(5);
});

test('Learn first and hints remain assisted and use a different prompt variant', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Evidence payload inspection only needs one browser project');
  const events: Array<Record<string, unknown>> = [];
  await page.route('**/api/me', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ authenticated: true, authConfigured: true }),
  }));
  await page.route('**/api/lesson-event', async (route) => {
    events.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ persisted: true, evidence: 'encounter', completion: false, scheduled: false }),
    });
  });

  await page.goto(lessonRoute);
  const originalPrompt = await page.getByTestId('lesson-active-task').getByRole('heading', { level: 1 }).innerText();
  await page.getByRole('button', { name: 'Learn first' }).click();
  const learnFirst = page.getByTestId('learn-first-panel');
  await expect(learnFirst).toContainText('encounter only');
  await expect(learnFirst).toContainText('desired 3 → observed 2 → reconcile');
  await page.getByRole('button', { name: 'Try a new variant' }).click();
  const variantPrompt = await page.getByTestId('lesson-active-task').getByRole('heading', { level: 1 }).innerText();
  expect(variantPrompt).not.toBe(originalPrompt);
  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await expect.poll(() => events.length).toBe(2);
  expect(events[0]).toMatchObject({ assisted: true, correct: false, completed: false });
  expect(events[1]).toMatchObject({ assisted: true, correct: true, completed: true });
  await expect(page.getByRole('status')).toContainText('encounter only');

  events.length = 0;
  await page.goto(lessonRoute);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByRole('note')).toBeVisible();
  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await expect.poll(() => events.length).toBe(1);
  expect(events[0]).toMatchObject({ assisted: true, correct: true, completed: true });
});

test('all twelve Resources interactions complete end to end', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Full primitive traversal is covered once; responsive states have a focused test');
  await page.goto(lessonRoute);

  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await continueLesson(page, 2);

  await page.getByRole('button', { name: 'Move Deployment up' }).click();
  await page.getByRole('button', { name: 'Move Deployment up' }).click();
  await page.getByRole('button', { name: 'Move ReplicaSet up' }).click();
  await check(page);
  await continueLesson(page, 3);

  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await continueLesson(page, 4);

  for (let index = 0; index < 4; index += 1) {
    await page.getByRole('button', { name: 'Move Starting intent: desired replicas is 3 up' }).click();
  }
  await check(page);
  await continueLesson(page, 5);

  await page.getByLabel('Your explanation').fill('Desired replicas stays three. The ReplicaSet observes two matching Pods and creates a replacement.');
  await check(page);
  for (const point of await page.locator('.lesson-critical-check input').all()) await point.check();
  await page.getByRole('button', { name: 'Good' }).click();
  await continueLesson(page, 6);

  await page.getByLabel('Responsibility for Pod').selectOption('execution-boundary');
  await page.getByLabel('Responsibility for ReplicaSet').selectOption('replica-count');
  await page.getByLabel('Responsibility for Deployment').selectOption('rollout');
  await page.getByLabel('Responsibility for Service').selectOption('discovery');
  await check(page);
  await continueLesson(page, 7);

  const blanks = page.locator('.lesson-blank-grid select');
  await blanks.nth(0).selectOption('three');
  await blanks.nth(1).selectOption('payments');
  await blanks.nth(2).selectOption('payments');
  await check(page);
  await continueLesson(page, 8);

  await page.locator('.lesson-option').nth(0).click();
  await check(page);
  await continueLesson(page, 9);

  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await continueLesson(page, 10);

  for (let index = 0; index < 6; index += 1) {
    await page.getByRole('button', { name: 'Move kubectl up' }).click();
  }
  await check(page);
  await expect(page.getByTestId('lesson-feedback').locator('.lesson-visual-stage').getByText('kubectl get pods -n payments -o wide')).toBeVisible();
  await continueLesson(page, 11);

  await page.locator('.lesson-option').nth(0).click();
  await check(page);
  await expect(page.getByTestId('lesson-feedback').getByText(/API acceptance only/)).toBeVisible();
  await continueLesson(page, 12);

  await page.getByLabel('Your explanation').fill('A namespace scopes names and API resources, but RBAC and network isolation require separate policy.');
  await check(page);
  for (const point of await page.locator('.lesson-critical-check input').all()) await point.check();
  await page.getByRole('button', { name: 'Good' }).click();
  await page.getByRole('button', { name: 'Finish lesson' }).click();
  await expect(page.getByTestId('lesson-complete')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'You completed Kubernetes Resources.' })).toBeVisible();
});

test('mobile lesson controls and dense content stay reachable and overflow-free', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only responsive contract');
  await page.goto(lessonRoute);

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const control of [
    page.getByRole('link', { name: /Exit/ }),
    page.locator('.lesson-option').first(),
    page.getByRole('button', { name: 'Hint' }),
    page.getByRole('button', { name: 'Learn first' }),
    page.getByTestId('lesson-check'),
  ]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId('lesson-check')).toBeInViewport();

  await page.locator('.lesson-option').nth(1).click();
  await check(page);
  await expect(page.getByTestId('lesson-continue')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('lesson supports light, dark, reduced motion, and serious accessibility checks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Theme and motion contract only needs one browser project');
  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((value) => localStorage.setItem('hmrdkn-theme', value), theme);
    await page.goto(lessonRoute);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact ?? ''))).toEqual([]);
  }

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const transitionMs = await page.locator('.lesson-player-progress > span').evaluate((element) => {
    const duration = getComputedStyle(element).transitionDuration;
    return duration.endsWith('ms') ? Number.parseFloat(duration) : Number.parseFloat(duration) * 1000;
  });
  expect(transitionMs).toBeLessThanOrEqual(1);
});

test('Exit returns safely to the Resources checkpoint', async ({ page }) => {
  await page.goto(lessonRoute);
  await page.getByRole('link', { name: /Exit/ }).click();
  await expect(page).toHaveURL(/\/kcna\/?#resources$/);
  await expect(page.getByRole('heading', { name: 'Kubernetes Resources' })).toBeVisible();
});
