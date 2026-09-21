import { expect, test, type Page } from '@playwright/test';

const unitId = 'fpp:kcna-domain-map';
const slug = 'kcna-domain-map';
const ownerProgress = (lessonCompleted = false) => ({
  paths: [], recentUnitId: unitId, units: [{
    id: unitId, slug, title: 'Current unit', score: 0.52,
    completion: { state: 'In progress', percent: 0.5, questionsCompleted: 1, questionsTotal: 3,
      lessonCompleted, completedPracticeIds: [], practicesCompleted: 0, practicesTotal: 1 },
    understanding: { state: 'Understands basics', evidenceState: 'Recalled', score: 0.52, needsRefresh: false },
    objectives: [],
  }],
});

async function mockOwner(page: Page) {
  await page.route('**/api/me', (route) => route.fulfill({ json: { authenticated: true, authConfigured: true } }));
  await page.route('**/api/progress', (route) => route.fulfill({ json: ownerProgress() }));
  await page.route('**/api/answers?*', (route) => route.fulfill({ json: { unitId, answers: [] } }));
}

for (const lessonCompleted of [false, true]) {
  test(`next learning actions open ${lessonCompleted ? 'recall for a read' : 'the reader for an unread'} lesson`, async ({ page }) => {
    await page.route('**/api/progress', (route) => route.fulfill({ json: ownerProgress(lessonCompleted) }));
    let dueCount = 0;
    await page.route('**/api/review?*', (route) => route.fulfill({ json: { dueCount } }));
    await page.goto('/kcna');
    const expected = `/learn/${slug}${lessonCompleted ? '' : '?mode=reference'}`;
    await expect(page.locator('[data-session-action]')).toHaveAttribute('href', expected);
    dueCount = 3;
    await page.reload();
    await expect(page.locator('[data-session-action]')).toHaveAttribute('href', `/review?path=kcna&next=${slug}`);
    await expect(page.getByRole('link', { name: 'Continue learning', exact: true })).toHaveAttribute('href', expected);
  });
}

test('KCNA shows neutral progress while loading and restores owner evidence', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/progress', async (route) => {
    await gate;
    await route.fulfill({ json: ownerProgress() });
  });
  await page.route('**/api/review?*', (route) => route.fulfill({ json: { dueCount: 0 } }));
  const html = await (await page.request.get('/kcna')).text();
  expect(html).toMatch(/data-unit-evidence="fpp:kcna-domain-map">Loading shared unit evidence…/);
  await page.goto('/kcna');
  const row = page.locator('[data-unit-id]').first();
  try {
    await expect(row.locator('[data-unit-evidence]')).toHaveText(/^(Loading…|Loading shared unit evidence…)$/);
    await expect(page.locator('[data-checkpoint-progress]').first()).toHaveText('Loading…');
    release();
    await expect(row.locator('[data-unit-evidence]')).toHaveText('Prior unit practice · Understands basics');
    await expect(page.locator('[data-checkpoint-progress]').first()).toHaveText('In progress');
    const actionBox = await row.locator('.kcna-course-step-action a').boundingBox();
    const progressBox = await row.locator('.kcna-course-step-progress').boundingBox();
    expect(progressBox!.y).toBeGreaterThanOrEqual(actionBox!.y + actionBox!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  } finally { release(); }
});

test('guest and unavailable KCNA progress never masquerade as empty owner history', async ({ page }) => {
  let status = 503;
  await page.route('**/api/progress', (route) => route.fulfill({ status, json: {} }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/kcna');
  const row = page.locator('[data-unit-id]').first();
  await expect(row.locator('[data-unit-evidence]')).toHaveText('Unavailable');
  status = 401;
  await page.getByRole('button', { name: 'Retry progress' }).click();
  await expect(row.locator('[data-unit-evidence]')).toHaveText('Not saved');
  await expect(page.locator('.path-session-status')).toContainText('Sign in as owner to save');
});

test('prerendered lesson is neutral until the requested mode is known', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Static response contract needs one browser project');
  const html = await (await page.request.get(`/learn/${slug}?mode=reference`)).text();
  const loading = html.match(/<section[^>]+data-testid="study-mode-loading"[^>]*>/)?.[0] ?? '';
  const reader = html.match(/<article[^>]+data-testid="reader-workspace"[^>]*>/)?.[0] ?? '';
  const practice = html.match(/<section[^>]+data-testid="practice-workspace"[^>]*>/)?.[0] ?? '';
  expect(loading).not.toContain('hidden');
  expect(reader).toContain('hidden');
  expect(practice).toContain('hidden');
});

test('reader deep link waits for identity and encounters once per opening without recall writes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Persistence contract needs one browser project');
  let releaseIdentity!: () => void;
  const identityGate = new Promise<void>((resolve) => { releaseIdentity = resolve; });
  await mockOwner(page);
  await page.route('**/api/me', async (route) => {
    await identityGate;
    await route.fulfill({ json: { authenticated: true, authConfigured: true } });
  });
  const encounters: Record<string, unknown>[] = [];
  const recallWrites: string[] = [];
  await page.route('**/api/encounter', (route) => {
    encounters.push(route.request().postDataJSON());
    return route.fulfill({ json: { persisted: true, evidence: 'encountered' } });
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/(attempt|review|unit-progress)$/.test(new URL(request.url()).pathname)) recallWrites.push(request.url());
  });
  await page.goto(`/learn/${slug}?mode=reference&from=kcna#lesson`);
  try {
    await expect(page.getByTestId('reader-workspace')).toBeVisible();
    await expect(page.getByTestId('study-mode-loading')).toBeHidden();
    await expect(page.getByTestId('practice-workspace')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Mark read & try the concept', exact: true })).toBeDisabled();
    await expect(page.getByTestId('encounter-status')).toHaveText('Checking whether reading progress can be saved…');
    expect(encounters).toHaveLength(0);
    releaseIdentity();
    await expect(page.getByRole('button', { name: 'Mark read & try the concept', exact: true })).toBeEnabled();
    await expect(page.getByTestId('encounter-status')).toContainText('Encounter saved');
    expect(encounters).toHaveLength(1);
    expect(encounters[0]).toMatchObject({ unitId, unitRevision: 3 });
    expect(encounters[0]!.questionId).toEqual(expect.any(String));
    expect(encounters[0]!.idempotencyKey).toEqual(expect.any(String));
    await page.getByRole('button', { name: 'Practice · recall first', exact: true }).click();
    const answer = page.getByLabel('Your explanation', { exact: true });
    await answer.fill('My draft survives a mode switch.');
    const historyLength = await page.evaluate(() => history.length);
    await expect(page).toHaveURL(new RegExp(`/learn/${slug}/?\\?from=kcna#lesson$`));
    await page.getByRole('button', { name: 'Read lesson', exact: true }).click();
    await expect(page).toHaveURL(/from=kcna&mode=reference#lesson$/);
    await expect(answer).toHaveValue('My draft survives a mode switch.');
    await expect(answer).toBeHidden();
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
    await expect(page.getByTestId('encounter-status')).toContainText('Encounter saved');
    expect(encounters).toHaveLength(1);
    expect(recallWrites).toHaveLength(0);
    await page.reload();
    await expect(page.getByTestId('encounter-status')).toContainText('Encounter saved');
    expect(encounters).toHaveLength(2);
    expect(recallWrites).toHaveLength(0);
  } finally { releaseIdentity(); }
});

test('guest mode switching updates the URL and describes unsaved progress', async ({ page }) => {
  let writes = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) writes += 1; });
  await page.route('**/api/me', (route) => route.fulfill({ json: { authenticated: false, authConfigured: true } }));
  await page.goto(`/learn/${slug}?from=kcna#lesson`);
  await expect(page.locator('.study-workspace-bar')).toContainText('Guest progress stays on this page only');
  await page.getByRole('button', { name: 'Read lesson', exact: true }).click();
  await expect(page).toHaveURL(/from=kcna&mode=reference#lesson$/);
  await expect(page.getByTestId('encounter-status')).toContainText('No progress or recall credit is saved');
  await page.getByRole('button', { name: 'Practice · recall first', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${slug}/?\\?from=kcna#lesson$`));
  expect(writes).toBe(0);
});

test('finishing the reader records reading then opens practice without recall evidence', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Persistence contract needs one browser project');
  let lessonCompleted = false;
  const completionWrites: Record<string, unknown>[] = [];
  const recallWrites: string[] = [];
  await page.route('**/api/me', (route) => route.fulfill({ json: { authenticated: true, authConfigured: true } }));
  await page.route('**/api/progress', (route) => route.fulfill({ json: ownerProgress(lessonCompleted) }));
  await page.route('**/api/answers?*', (route) => route.fulfill({ json: { unitId, answers: [] } }));
  await page.route('**/api/encounter', (route) => route.fulfill({ json: { persisted: true, evidence: 'encountered' } }));
  await page.route('**/api/unit-progress', (route) => {
    completionWrites.push(route.request().postDataJSON());
    lessonCompleted = true;
    return route.fulfill({ json: { persisted: true } });
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/(attempt|review)$/.test(new URL(request.url()).pathname)) recallWrites.push(request.url());
  });

  await page.goto(`/learn/${slug}?mode=reference#lesson`);
  await page.getByRole('button', { name: 'Mark read & try the concept', exact: true }).click();
  await expect(page.getByTestId('practice-workspace')).toBeVisible();
  await expect(page.getByLabel('Your explanation', { exact: true })).toBeVisible();
  expect(completionWrites).toEqual([expect.objectContaining({
    unitId, unitRevision: 3, taskType: 'lesson', taskId: 'lesson', completed: true,
  })]);
  expect(recallWrites).toEqual([]);
  await expect(page).not.toHaveURL(/mode=reference/);
});

test('mobile uses one main reader while History and Notes stay contextual sheets', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Mobile reader layout contract');
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/learn/kcna-scheduling-review?mode=reference');
    const reader = page.getByTestId('reader-workspace');
    const context = page.getByTestId('learning-context');
    await expect(reader).toBeVisible();
    await expect(page.getByTestId('practice-workspace')).toBeHidden();
    await expect(context).toBeHidden();
    const readerBox = await reader.boundingBox();
    expect(readerBox!.x).toBeGreaterThanOrEqual(0);
    expect(readerBox!.x + readerBox!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(844);
    for (const panel of ['History', 'Notes']) {
      await page.getByRole('button', { name: panel, exact: true }).click();
      await expect(context).toBeVisible();
      const sheet = await context.boundingBox();
      expect(sheet!.height).toBeLessThanOrEqual(844 * 0.68 + 1);
      await page.getByRole('button', { name: 'Close learning context' }).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
