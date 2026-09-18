import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { expect, test } from '@playwright/test';

// Canonical answers drive traversal; these tests verify UI state, not pedagogy.
const traversalLessons = ['kcna-cluster-behavior', 'kcna-kubernetes-fundamentals', 'kcna-cloud-native-context'].map((slug) => ({
  slug,
  lesson: parse(readFileSync(`content/lessons/${slug}.yaml`, 'utf8')),
}));

test('KCNA curriculum, practice, and lesson expose one main landmark', async ({ page }) => {
  for (const route of ['/kcna', '/practice/kcna', '/lesson/kcna-cloud-native-context']) {
    await page.goto(route);
    await expect(page.getByRole('main')).toHaveCount(1);
    await expect(page.locator('a[href="#main"]')).toHaveAttribute('href', '#main');
    await expect(page.locator('#main')).toHaveAttribute('id', 'main');
  }
});

test('every generated unit keeps retrieval and reference within the viewport', async ({ page }, info) => {
  test.skip(info.project.name === 'tablet', 'Corpus smoke covers 320px and 1440px');
  test.setTimeout(120_000);
  const width = info.project.name === 'mobile' ? 320 : 1440;
  await page.setViewportSize({ width, height: 900 });
  for (const slug of readdirSync('content/units')) {
    await page.goto(`/learn/${slug}`);
    const answer = page.getByLabel('Your explanation', { exact: true });
    await expect(answer, slug).toBeEnabled();
    await answer.fill(`Draft for ${slug}`);
    const heading = page.locator('.question-stage h2').first();
    const before = await heading.boundingBox();
    await page.locator('.study-context-actions').getByRole('button', { name: 'Reference', exact: true }).click();
    const context = page.getByTestId('learning-context');
    await expect(context).toBeVisible();
    const models = context.getByTestId('reference-models');
    if (await models.count()) await models.locator(':scope > summary').click();
    await expect(answer, slug).toHaveValue(`Draft for ${slug}`);
    const after = await heading.boundingBox();
    expect(after?.x, slug).toBe(before?.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), slug).toBeLessThanOrEqual(width);
    for (const table of await context.locator('.markdown-body table').all()) {
      const contained = await table.evaluate((element) => {
        const parent = element.parentElement!;
        const table = element.getBoundingClientRect();
        const wrapper = parent.getBoundingClientRect();
        return table.width <= wrapper.width + 1 || ['auto', 'scroll'].includes(getComputedStyle(parent).overflowX);
      });
      expect(contained, `${slug} reference table`).toBe(true);
    }
  }
});

test('reference code stays contained and overflowing blocks support keyboard scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Focused narrow code scrolling contract');
  await page.goto('/learn/container-network-storage');
  await page.locator('.study-context-actions').getByRole('button', { name: 'Reference', exact: true }).click();
  const context = page.getByTestId('learning-context');
  await expect(context).toBeVisible();
  await expect(context.locator('.context-reference .markdown-body')).toBeVisible();
  const blocks = context.getByRole('region', { name: /Reference code example/ });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const referenceFits = await context.locator('.learning-context-body').evaluate((element) => {
    const reference = element.getBoundingClientRect();
    return reference.left >= 0 && reference.right <= window.innerWidth + 1;
  });
  expect(referenceFits, 'The reference workspace must fit within the viewport').toBe(true);
  // A unit can legitimately have prose or diagrams without fenced code.
  // Code-specific semantics apply only to regions the unit actually renders.
  for (const block of await blocks.all()) {
    const dimensions = await block.evaluate((element) => {
      const body = element.closest('.learning-context-body')!.getBoundingClientRect();
      const code = element.getBoundingClientRect();
      return {
        contained: code.left >= body.left && code.right <= body.right + 1,
        overflowing: element.scrollWidth > element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
      };
    });
    expect(dimensions.contained, 'Code blocks must fit inside the reference workspace').toBe(true);
    await expect(block).toHaveAttribute('tabindex', '0');
    await block.focus();
    await expect(block).toBeFocused();
    // Readable examples may fit at this viewport. Only scroll blocks whose
    // rendered content actually overflows; copy length is not a UI contract.
    if (!dimensions.overflowing) continue;
    expect(['auto', 'scroll']).toContain(dimensions.overflowX);
    await block.evaluate((element) => { element.scrollLeft = 0; });
    await block.press('ArrowRight');
    await expect.poll(() => block.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }
});

test('KCNA MCQ link opens working practice through public navigation', async ({ page }, info) => {
  if (info.project.name === 'tablet') await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/kcna');
  const response = page.waitForResponse((result) => new URL(result.url()).pathname === '/practice/kcna/' && result.request().isNavigationRequest());
  await page.getByRole('link', { name: /KCNA question practice/ }).click();
  expect((await response).status()).toBe(200);
  await expect(page).toHaveURL(/\/practice\/kcna\/$/);
  await expect(page.getByRole('heading', { name: 'KCNA question practice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeVisible();
});

test('pending and failed correction retains the current question and text', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Correction concurrency once');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let reviewStarted = false;
  let correctionPosts = 0;
  await page.route('**/api/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: true, authConfigured: true }) }));
  await page.route('**/api/attempt', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ persisted: true }) }));
  await page.route('**/api/review', async (route) => {
    reviewStarted = true;
    await pending;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ persisted: true }) });
  });
  await page.route('**/api/notes**', (route) => {
    if (route.request().method() === 'POST') correctionPosts++;
    return route.fulfill({ status: route.request().method() === 'POST' ? 500 : 200, contentType: 'application/json', body: JSON.stringify({ markdown: 'Saved baseline.' }) });
  });
  await page.goto('/learn/processes-and-resources');
  const heading = await page.locator('.question-stage h2').first().innerText();
  await page.getByLabel('Your explanation', { exact: true }).fill('A process has identity and finite resources.');
  await page.getByRole('button', { name: 'Save privately & reveal' }).click();
  const correction = page.locator('#model-correction');
  await correction.fill('Preserve this correction after failure.');
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect.poll(() => reviewStarted).toBe(true);
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeDisabled();
  await expect(correction).toHaveValue('Preserve this correction after failure.');
  release();
  await expect(page.locator('.save-status')).toContainText(/Correction could not be saved|correction.*failed/i);
  await expect(correction).toHaveValue('Preserve this correction after failure.');
  await expect(page.locator('.question-stage h2').first()).toHaveText(heading);
  await expect(page.getByTestId('correction-recovery')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeDisabled();
  await page.getByTestId('correction-move-to-notes').click();
  await expect(page.getByLabel('Private unit notes', { exact: true })).toHaveValue(/Preserve this correction after failure/);
  await expect(page.getByRole('button', { name: 'Next question', exact: true })).toBeEnabled();
  expect(correctionPosts).toBe(1);
});

test('uncertain review save retries the same event payload', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Network contract once');
  const payloads: unknown[] = [];
  const card = { cardId: 'test:uncertain', unitId: 'fpp:container-lifecycle', unitRevision: 3, type: 'short', dueAt: Date.now(), front: 'Uncertain save?', back: 'Stable event identity.', criticalPoints: [], unitTitle: 'Container lifecycle' };
  await page.route('**/api/review**', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ queue: payloads.length > 1 ? [] : [card] }) });
    } else {
      payloads.push(route.request().postDataJSON());
      if (payloads.length === 1) await route.abort('failed');
      else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ persisted: true }) });
    }
  });
  await page.goto('/review?path=kcna');
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/Could not save|try again|retry/i);
  await expect(page.getByRole('button', { name: 'Easy', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeDisabled();
  expect(payloads).toHaveLength(1);
  await page.getByTestId('review-retry-save').click();
  await expect(page.getByText('Review complete.', { exact: true })).toBeVisible();
  expect(payloads).toHaveLength(2);
  expect(payloads[1]).toEqual(payloads[0]);
});

test('late notes load and failed save preserve edits', async ({ page }, info) => {
  test.skip(info.project.name === 'tablet', 'Context desktop and mobile');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  let saves = 0;
  await page.route('**/api/me', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ authenticated: true, authConfigured: true }) }));
  await page.route('**/api/notes**', async (route) => {
    if (route.request().method() === 'GET') {
      started = true;
      await pending;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ markdown: 'Old saved note' }) });
    } else {
      saves++;
      await route.fulfill({ status: saves === 1 ? 500 : 200, contentType: 'application/json', body: JSON.stringify({ persisted: saves > 1 }) });
    }
  });
  await page.goto('/learn/processes-and-resources');
  const answer = page.getByLabel('Your explanation', { exact: true });
  await answer.fill('Retrieval draft preserved');
  const url = page.url();
  await page.locator('.study-context-actions').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect.poll(() => started).toBe(true);
  const note = page.locator('.context-notes textarea');
  const loaded = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/notes' && response.request().method() === 'GET');
  if (await note.isEnabled()) {
    await note.fill('New note before load');
    release();
    await (await loaded).finished();
    await expect(note).toHaveValue('New note before load');
  } else {
    release();
    await (await loaded).finished();
    await expect(note).toBeEnabled();
    await note.fill('New note before load');
  }
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.context-notes [role="status"]')).toContainText(/Could not save|failed/i);
  await expect(note).toHaveValue('New note before load');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.locator('.context-notes [role="status"]')).toContainText(/Saved/i);
  await page.getByRole('button', { name: 'Close learning context' }).click();
  await expect(answer).toHaveValue('Retrieval draft preserved');
  await expect(page).toHaveURL(url);
  await page.locator('.study-context-actions').getByRole('button', { name: 'Notes', exact: true }).click();
  await expect(note).toHaveValue('New note before load');
});

for (const { slug, lesson } of traversalLessons) test(`${lesson.title}: every canonical task checks and completes`, async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Full task traversal once');
  await page.goto(`/lesson/${slug}`);
  for (const [index, task] of lesson.exercises.entries()) {
    await expect(page.locator('.lesson-step-count')).toHaveText(`${index + 1} / ${lesson.exercises.length}`);
    await expect(page.getByTestId('lesson-active-task')).toHaveCount(1);
    if (task.correct_order) {
      for (const [position, id] of task.correct_order.entries()) {
        const text = task.items.find((item: { id: string }) => item.id === id).text;
        const row = page.locator('.lesson-order-item').filter({ hasText: text });
        while (Number(await row.locator('.lesson-order-index').innerText()) > position + 1) {
          await page.getByRole('button', { name: `Move ${text} up`, exact: true }).click();
        }
      }
    } else if (task.kind === 'connect') {
      for (const match of task.matches) {
        const text = task.left.find((item: { id: string }) => item.id === match.left_id).text;
        await page.getByLabel(`Responsibility for ${text}`, { exact: true }).selectOption(match.right_id);
      }
    } else if (task.kind === 'explain') {
      await page.getByLabel('Your explanation').fill(task.model_answer);
    } else if (task.kind === 'manifest_fill') {
      for (const [index, blank] of task.blanks.entries()) await page.locator('.lesson-blank-grid select').nth(index).selectOption(blank.answer_id);
    } else {
      for (const id of task.answer_ids) {
        const text = task.options.find((option: { id: string }) => option.id === id).text;
        await page.locator('.lesson-option').filter({ hasText: text }).click();
      }
    }
    await page.getByTestId('lesson-check').click();
    await expect(page.getByTestId('lesson-feedback')).toBeVisible();
    if (task.kind === 'explain') {
      for (const checkbox of await page.locator('.lesson-critical-check input').all()) await checkbox.check();
      await page.getByRole('button', { name: 'Good', exact: true }).click();
    } else {
      await expect(page.getByTestId('lesson-feedback').getByText('Correct', { exact: true })).toBeVisible();
    }
    await page.getByTestId('lesson-continue').click();
  }
  await expect(page.getByTestId('lesson-complete')).toBeVisible();
});

test('failed review rating can retry without card loss or double advancement', async ({ page }) => {
  let posts = 0;
  const card = { cardId: 'test:retry', unitId: 'fpp:container-lifecycle', unitRevision: 3, type: 'short', dueAt: Date.now(), front: 'Retry this card?', back: 'Retained answer.', criticalPoints: [], unitTitle: 'Container lifecycle' };
  await page.route('**/api/review**', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      await route.fulfill({ status: posts === 1 ? 500 : 200, contentType: 'application/json', body: JSON.stringify({ persisted: posts > 1 }) });
    } else await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ queue: posts > 1 ? [] : [card] }) });
  });
  await page.goto('/review?path=kcna');
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/Could not save/);
  await expect(page.getByRole('heading', { name: card.front })).toBeVisible();
  await expect(page.getByText(card.back, { exact: true })).toBeVisible();
  await page.getByTestId('review-retry-save').click();
  await expect(page.getByText('Review complete.', { exact: true })).toBeVisible();
  expect(posts).toBe(2);
});

test('successful rating with failed refresh preserves remaining queue', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Queue refresh network contract once');
  let gets = 0;
  let posts = 0;
  const first = { cardId: 'test:first-refresh', unitId: 'fpp:container-lifecycle', unitRevision: 3, type: 'short', dueAt: Date.now(), front: 'First refresh card?', back: 'First answer.', criticalPoints: [], unitTitle: 'Container lifecycle' };
  const second = { ...first, cardId: 'test:second-refresh', front: 'Remaining refresh card?', back: 'Second answer.' };
  await page.route('**/api/review**', async (route) => {
    if (route.request().method() === 'POST') {
      posts++;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ persisted: true }) });
    } else {
      gets++;
      await route.fulfill({ status: gets === 2 ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ queue: gets === 1 ? [first, second] : [second] }) });
    }
  });
  await page.goto('/review?path=kcna');
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('button', { name: 'Good', exact: true }).click();
  await expect(page.getByTestId('review-error')).toContainText('Could not load');
  await expect(page.getByRole('heading', { name: second.front })).toBeVisible();
  await expect(page.getByText('Nothing is due.', { exact: true })).toBeHidden();
  await expect(page.getByText('Review complete.', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Retry loading reviews' }).click();
  await expect(page.getByTestId('review-error')).toBeHidden();
  await expect(page.getByRole('heading', { name: second.front })).toBeVisible();
  expect(posts).toBe(1);
});

test('context keyboard switching preserves retrieval geometry and returns focus', async ({ page }) => {
  await page.goto('/learn/processes-and-resources');
  const draft = page.getByLabel('Your explanation', { exact: true });
  await draft.fill('Draft survives contextual lookup.');
  const heading = page.locator('.question-stage h2').first();
  const before = await heading.boundingBox();
  const url = page.url();
  const scroll = await page.evaluate(() => window.scrollY);
  const opener = page.locator('.study-context-actions').getByRole('button', { name: 'Reference', exact: true });
  await opener.click();
  const referenceTab = page.getByRole('tab', { name: 'Reference', exact: true });
  await referenceTab.focus();
  await referenceTab.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Notes', exact: true })).toBeFocused();
  await page.getByRole('tab', { name: 'Notes', exact: true }).press('Home');
  await expect(page.getByRole('tab', { name: 'History', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(draft).toHaveValue('Draft survives contextual lookup.');
  await expect(page).toHaveURL(url);
  const after = await heading.boundingBox();
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(4);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(4);
  expect(Math.abs(await page.evaluate(() => window.scrollY) - scroll)).toBeLessThanOrEqual(4);
});

test('Scheduling reference and counter fit narrow context', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Focused narrow responsive acceptance');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/learn/kcna-scheduling-review?mode=reference');
    await page.getByTestId('reference-models').locator(':scope > summary').click();
    await expect(page.getByTestId('reference-visuals')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/learn/kubernetes-architecture-components');
  await page.locator('.study-context-actions').getByRole('button', { name: 'Reference', exact: true }).click();
  const context = page.getByTestId('learning-context');
  for (const table of await context.locator('.markdown-body table').all()) {
    await expect(table).toBeVisible();
    const containment = await table.evaluate((element) => {
      const body = element.closest('.learning-context-body')!;
      const tableBox = element.getBoundingClientRect();
      const bodyBox = body.getBoundingClientRect();
      let parent = element.parentElement;
      let accessibleScroll = false;
      while (parent && parent !== body) {
        const box = parent.getBoundingClientRect();
        if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowX) && box.left >= bodyBox.left && box.right <= bodyBox.right + 1) accessibleScroll = true;
        parent = parent.parentElement;
      }
      return { fits: tableBox.left >= bodyBox.left && tableBox.right <= bodyBox.right + 1, accessibleScroll };
    });
    expect(containment.fits || containment.accessibleScroll, 'Reference table must fit context or have its own accessible horizontal scroll').toBe(true);
  }
  await context.getByTestId('reference-models').locator(':scope > summary').click();
  const counters = context.locator('.lesson-visual-counter');
  expect(await counters.count()).toBeGreaterThan(0);
  for (const counter of await counters.all()) {
    await expect(counter).toBeVisible();
    const dimensions = await counter.evaluate((element) => ({ height: element.getBoundingClientRect().height, line: parseFloat(getComputedStyle(element).lineHeight) }));
    if (Number.isFinite(dimensions.line)) expect(dimensions.height).toBeLessThanOrEqual(dimensions.line + 2);
  }
});

test('mobile matching exposes readable selected responses and retry focus', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'Narrow matching journey');
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/lesson/kcna-cluster-behavior');
  // Ordering allows checking the initial wrong arrangement, then continuing.
  await page.getByTestId('lesson-check').click();
  await page.getByTestId('lesson-continue').click();
  const task = traversalLessons.find(({ slug }) => slug === 'kcna-cluster-behavior')!.lesson.exercises[1];
  for (const match of task.matches) {
    const left = task.left.find((item: { id: string }) => item.id === match.left_id).text;
    const right = task.right.find((item: { id: string }) => item.id === match.right_id).text;
    const select = page.getByLabel(`Responsibility for ${left}`, { exact: true });
    await select.selectOption(match.right_id);
    const row = page.locator('.lesson-connect-row').filter({ has: select });
    // Native option text can be clipped; a wrapping response must exist outside it.
    await expect(row.locator('option').filter({ hasText: right })).toHaveCount(1);
    const response = row.getByTestId('lesson-selected-response');
    await expect(response).toBeVisible();
    await expect(response).toContainText(right);
    const responseBox = await response.boundingBox();
    expect(responseBox!.x).toBeGreaterThanOrEqual(0);
    expect(responseBox!.x + responseBox!.width).toBeLessThanOrEqual(320);
    await expect(select).toHaveValue(match.right_id);
    const box = await select.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const firstLeft = task.left.find((item: { id: string }) => item.id === task.matches[0].left_id).text;
  const wrongRight = task.right.find((item: { id: string }) => item.id !== task.matches[0].right_id).id;
  await page.getByLabel(`Responsibility for ${firstLeft}`, { exact: true }).selectOption(wrongRight);
  await page.getByTestId('lesson-check').click();
  await expect(page.getByTestId('lesson-feedback').getByText('Not quite', { exact: true })).toBeVisible();
  await page.getByTestId('lesson-retry').click();
  const heading = page.getByTestId('lesson-active-task').getByRole('heading', { level: 1 });
  await expect(heading).toBeInViewport();
  await expect(heading).toBeFocused();
});
