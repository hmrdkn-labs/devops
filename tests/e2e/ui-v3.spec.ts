import { expect, test } from '@playwright/test';

const primarySurfaces = [
  ['home', '/'],
  ['kcna-focus', '/kcna'],
  ['kcna-mcq', '/practice/kcna'],
  ['kcna-path', '/paths/kcna'],
  ['study', '/learn/kcna-kubernetes-resources-review'],
  ['library', '/library'],
  ['search', '/search'],
  ['map', '/map'],
] as const;

test('KCNA focus isolates the certification curriculum', async ({ page }) => {
  await page.goto('/kcna');

  await expect(page.getByRole('heading', { name: 'Stay inside the KCNA lane.' })).toBeVisible();
  await expect(page.locator('.site-nav a[aria-current="page"]')).toHaveText('KCNA');
  await expect(page.locator('.kcna-checkpoint')).toHaveCount(4);
  await expect(page.locator('.kcna-curriculum li > a')).toHaveCount(30);
  await expect(page.getByRole('heading', { name: /Continue:/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Start focused session/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Review KCNA only' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kubernetes Fundamentals' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kubernetes Resources' })).toBeVisible();
  await expect(page.getByRole('link', { name: /MCQ practice/ })).toBeVisible();
  const quickReview = page.locator('.kcna-quick-review');
  await expect(quickReview.getByText('Kubernetes Fundamentals quiz companion', { exact: true })).toBeVisible();
  await expect(quickReview.getByText('Kubernetes Resources quiz companion', { exact: true })).toBeVisible();
});

test('KCNA MCQ refresher explains every option after checking', async ({ page }) => {
  await page.goto('/practice/kcna');

  await expect(page.getByRole('heading', { name: 'Practice the decision, not the wording.' })).toBeVisible();
  await expect(page.getByText('Question 1 / 12')).toBeVisible();
  await expect(page.getByText('Select one', { exact: true })).toBeVisible();

  await page.getByText('kube-scheduler', { exact: true }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();

  await expect(page.getByText('Not quite', { exact: true })).toBeVisible();
  await expect(page.getByText(/Your answer: kube-scheduler\. Correct answer: kube-apiserver\./)).toBeVisible();
  await expect(page.locator('.mcq-option[data-state="wrong-selected"]')).toContainText('Your answer · Incorrect');
  await expect(page.locator('.mcq-option[data-state="correct-missed"]')).toContainText('Correct answer');
  const optionExplanations = page.locator('.mcq-options small');
  await expect(optionExplanations.filter({ hasText: /The API server is the front door/ })).toBeVisible();
  await expect(optionExplanations.filter({ hasText: /The scheduler chooses a feasible node/ })).toBeVisible();
  await expect(optionExplanations.filter({ hasText: /Controllers reconcile desired and observed state/ })).toBeVisible();
  await expect(optionExplanations.filter({ hasText: /The kubelet is a node agent/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Next question/ })).toBeVisible();

  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText(/Correction attempt/)).toBeVisible();
  await page.getByText('kube-apiserver', { exact: true }).click();
  await page.getByRole('button', { name: 'Check answer' }).click();
  await expect(page.getByText('Corrected', { exact: true })).toBeVisible();
  await expect(page.getByText('0 correct', { exact: true })).toBeVisible();
});

test('review reveal state is explicit and ratings start visually neutral', async ({ page }) => {
  await page.route('**/api/review?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        queue: [{
          cardId: 'test:stdout',
          unitId: 'fpp:container-lifecycle',
          unitRevision: 3,
          type: 'short',
          dueAt: Date.now(),
          front: 'Default application log streams in a container?',
          back: 'Standard output and standard error.',
          criticalPoints: [],
          unitTitle: 'Container runtime and lifecycle',
        }],
      }),
    });
  });

  await page.goto('/review?path=kcna');

  await expect(page.getByText('Retrieve before revealing', { exact: true })).toBeVisible();
  await expect(page.getByText('Standard output and standard error.', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Again' })).toBeHidden();

  await page.getByRole('button', { name: 'Reveal answer' }).click();

  await expect(page.getByText('Answer revealed', { exact: true })).toBeVisible();
  await expect(page.getByText('Retrieve before revealing', { exact: true })).toBeHidden();
  await expect(page.getByText('Standard output and standard error.', { exact: true })).toBeVisible();

  const borderColors = await page.locator('.review-rating .rating-buttons button').evaluateAll((buttons) =>
    buttons.map((button) => getComputedStyle(button).borderColor));
  expect(new Set(borderColors).size, 'no rating should look preselected').toBe(1);
});

test('rating a review advances to the next due card', async ({ page }) => {
  let getCount = 0;
  let postedCardId: string | null = null;
  const first = {
    cardId: 'test:first', unitId: 'fpp:container-lifecycle', unitRevision: 2,
    type: 'short', dueAt: Date.now(), front: 'First review card?', back: 'First answer.',
    criticalPoints: [], unitTitle: 'Container runtime and lifecycle',
  } as const;
  const second = {
    cardId: 'test:second', unitId: 'fpp:container-lifecycle', unitRevision: 2,
    type: 'short', dueAt: Date.now(), front: 'Second review card?', back: 'Second answer.',
    criticalPoints: [], unitTitle: 'Container runtime and lifecycle',
  } as const;

  await page.route('**/api/review**', async (route) => {
    if (route.request().method() === 'POST') {
      postedCardId = (route.request().postDataJSON() as { cardId: string }).cardId;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ persisted: true }) });
      return;
    }
    getCount += 1;
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ queue: getCount === 1 ? [first, second] : [second] }),
    });
  });

  await page.goto('/review?path=kcna');
  await expect(page.getByRole('heading', { name: 'First review card?' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Good' }).click();

  await expect(page.getByRole('heading', { name: 'Second review card?' })).toBeVisible();
  await expect(page.getByText('Retrieve before revealing', { exact: true })).toBeVisible();
  await expect(page.getByText('1 done', { exact: false })).toBeVisible();
  expect(postedCardId).toBe(first.cardId);
});

test('UI v3 primary surfaces stay compact, readable, and overflow-free', async ({ page }, testInfo) => {
  for (const theme of ['light', 'dark'] as const) {
    await page.goto('/');
    await page.evaluate((nextTheme) => localStorage.setItem('hmrdkn-theme', nextTheme), theme);

    for (const [name, route] of primarySurfaces) {
      await page.goto(route);

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(overflow.documentWidth, `${route} must not overflow horizontally`).toBeLessThanOrEqual(overflow.viewportWidth);

      const screenshotPath = testInfo.outputPath(`${name}-${theme}-${testInfo.project.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled' });
      await testInfo.attach(`${name}-${theme}-${testInfo.project.name}`, { path: screenshotPath, contentType: 'image/png' });
    }
  }
});

test('study question is visible in the initial viewport', async ({ page }) => {
  await page.goto('/learn/kcna-kubernetes-resources-review');
  const question = page.locator('.question-stage h2').first();
  await expect(question).toBeVisible();

  const box = await question.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.y + box!.height, 'question should be fully visible before scrolling').toBeLessThan(viewport!.height);
});

test('display headings stay within the workspace type scale', async ({ page }) => {
  await page.goto('/');
  const homeSize = await page.locator('.home-heading h1').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(homeSize).toBeLessThanOrEqual(40);

  await page.goto('/references');
  const pageSize = await page.locator('.page-hero h1').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(pageSize).toBeLessThanOrEqual(40);
});

test('mobile header actions meet the 44px touch-target contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Mobile-only interaction contract');
  await page.goto('/');

  for (const selector of ['.theme-toggle', '.auth-popover > summary', '.mobile-nav > summary']) {
    const control = page.locator(selector);
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width, `${selector} width`).toBeGreaterThanOrEqual(44);
    expect(box!.height, `${selector} height`).toBeGreaterThanOrEqual(44);
  }

  const dock = page.locator('.mobile-dock');
  await expect(dock).toBeVisible();
  await expect(dock.getByRole('link')).toHaveCount(4);
  for (const link of await dock.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height, 'mobile dock target height').toBeGreaterThanOrEqual(44);
  }
});
