import { expect, test } from '@playwright/test';

test('guest starts a concrete unit and keeps the curriculum ahead of optional tools', async ({ page }) => {
  await page.route('**/api/progress', (route) => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: { error: 'Unauthorized' } }));
  await page.goto('/kcna');
  await expect(page.locator('h1')).toHaveText('KCNA learning path');
  await expect(page.locator('[data-session-action]')).toContainText('Start learning');
  await expect(page.locator('[data-session-action]')).toHaveAttribute('href', /^\/learn\//);
  await expect(page.locator('[data-checkpoint]')).toHaveCount(13);
  await expect(page.locator('[data-course-step]')).toHaveCount(105);
  await expect(page.getByText('Join Our Community', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Feedback – KCNA/)).toHaveCount(0);
  const uniqueUnits = await page.locator('[data-mapped-unit-id]').evaluateAll((elements) =>
    new Set(elements.map((element) => element.getAttribute('data-mapped-unit-id')).filter(Boolean)).size);
  expect(uniqueUnits).toBe(32);
  await expect(page.locator('.path-session-status')).toContainText('Guest learning');
});

test('progress failure is retryable and does not claim guest status', async ({ page }) => {
  let failed = true;
  await page.route('**/api/progress', (route) => route.fulfill(failed
    ? { status: 503, json: { error: 'Unavailable' } }
    : { status: 401, json: { error: 'Unauthorized' } }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/kcna');
  await expect(page.locator('.path-session-status')).toContainText('Saved progress could not load');
  await expect(page.locator('.path-session-status')).not.toContainText('Guest learning');
  failed = false;
  await page.getByRole('button', { name: 'Retry progress' }).click();
  await expect(page.locator('.path-session-status')).toContainText('Guest learning');
});

test('checkpoint deep link stays open after saved progress loads', async ({ page }) => {
  await page.route('**/api/progress', (route) => route.fulfill({ json: { paths: [], units: [], recentUnitId: null } }));
  await page.route('**/api/review?*', (route) => route.fulfill({ json: { dueCount: 0 } }));
  await page.goto('/kcna#kubernetes-resources');
  await expect(page.locator('#kubernetes-resources')).toHaveAttribute('open', '');
  await expect(page.locator('.path-session-status')).toContainText('No KCNA learning progress yet');
  await expect(page.locator('#kubernetes-resources')).toHaveAttribute('open', '');
});

test('returning owner gets an explicit due-review handoff and a direct learning alternative', async ({ page }) => {
  await page.route('**/api/progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/kcna');
  const first = page.locator('[data-unit-id]').first();
  const id = await first.getAttribute('data-unit-id');
  const href = await first.locator('.kcna-course-step-copy a').first().getAttribute('href');
  const slug = href!.replace('/learn/', '').split('?')[0]!;
  await page.unroute('**/api/progress');
  await page.unroute('**/api/review?*');
  await page.route('**/api/progress', (route) => route.fulfill({ json: {
    paths: [], recentUnitId: id, units: [{ id, slug, title: 'Current unit', score: 0.2,
      completion: { state: 'In progress' }, understanding: { state: 'Introduced', evidenceState: 'Encountered', needsRefresh: false }, objectives: [] }],
  } }));
  await page.route('**/api/review?*', (route) => route.fulfill({ json: { dueCount: 3 } }));
  await page.reload();
  await expect(page.locator('[data-session-action]')).toHaveText('Review 3 due cards →');
  await expect(page.locator('[data-session-action]')).toHaveAttribute('href', `/review?path=kcna&next=${encodeURIComponent(slug)}`);
  await expect(page.getByRole('link', { name: 'Continue learning', exact: true })).toHaveAttribute('href', `/learn/${slug}?mode=reference`);
});

test('KCNA course exposes saved unit progress and Read lesson opens the readable lesson view', async ({ page }) => {
  await page.route('**/api/review?*', (route) => route.fulfill({ json: { dueCount: 0 } }));
  await page.goto('/kcna');
  const step = page.locator('[data-unit-id]').first();
  const id = await step.getAttribute('data-unit-id');
  const materialHref = await step.locator('.kcna-course-step-copy a').first().getAttribute('href');
  const slug = materialHref!.replace('/learn/', '').split('?')[0]!;
  await page.route('**/api/progress', (route) => route.fulfill({ json: {
    paths: [], recentUnitId: id, units: [{ id, slug, title: 'Current unit', score: 0.52,
      completion: { state: 'In progress', percent: 0.5, questionsCompleted: 1, questionsTotal: 2, lessonCompleted: false, practicesCompleted: 0, practicesTotal: 1 },
      understanding: { state: 'Understands basics', evidenceState: 'Recalled', score: 0.52, needsRefresh: false }, objectives: [] }],
  } }));
  await page.reload();
  await expect(step.locator('[data-unit-evidence]')).toHaveText('Prior unit practice · Understands basics');
  const study = step.locator('.kcna-course-step-action a');
  await expect(study).toHaveText('Read lesson →');
  await expect(study).toHaveAttribute('href', new RegExp(`^/learn/${slug}\\?mode=reference$`));
});

test('pending due reviews are explicit while learning stays available, then hand off to review', async ({ page }) => {
  await page.route('**/api/progress', (route) => route.fulfill({ json: { paths: [], units: [], recentUnitId: null } }));
  let releaseReview!: () => void;
  const reviewGate = new Promise<void>((resolve) => { releaseReview = resolve; });
  await page.route('**/api/review?*', async (route) => {
    await reviewGate;
    await route.fulfill({ json: { dueCount: 5 } });
  });
  await page.goto('/kcna');
  try {
    await expect(page.locator('.path-session-status')).toContainText('Checking due reviews…');
    await expect(page.locator('.path-session-status')).not.toContainText('Guest learning');
    await expect(page.locator('[data-session-action]')).toContainText('Start learning');
    const learningHref = await page.locator('[data-session-action]').getAttribute('href');
    expect(learningHref).toMatch(/^\/learn\//);
    releaseReview();
    await expect(page.locator('[data-session-action]')).toHaveText('Review 5 due cards →');
    await expect(page.locator('.path-session-status')).not.toContainText('Checking due reviews…');
    const slug = learningHref!.slice('/learn/'.length).split('?')[0]!;
    await expect(page.locator('[data-session-action]')).toHaveAttribute('href', `/review?path=kcna&next=${encodeURIComponent(slug)}`);
    await expect(page.getByRole('link', { name: 'Continue learning', exact: true })).toHaveAttribute('href', learningHref!);
  } finally { releaseReview(); }
});
