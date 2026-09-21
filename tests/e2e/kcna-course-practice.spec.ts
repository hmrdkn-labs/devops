import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parse } from 'yaml';
import { curriculumSchema } from '../../src/lib/content/schema';
import { kcnaAllQuestionsLabel } from './kcna-practice-content';

const curriculum = curriculumSchema.parse(parse(readFileSync('content/curricula/kcna-kodekloud.yaml', 'utf8')));
const quizModules = curriculum.modules.filter((module) => module.steps.some((step) => step.kind === 'quiz'));

test('MCQ controls wait for island handlers before accepting an answer', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/_astro\/KcnaMcqPractice\.[^/]+\.js$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto('/practice/kcna', { waitUntil: 'commit' });
  const workspace = page.locator('.mcq-practice');
  const option = page.getByRole('radio', { name: /kube-scheduler/ });
  const checkAnswer = page.getByRole('button', { name: 'Check answer', exact: true });
  try {
    await expect.poll(() => held).toBe(true);
    await expect(workspace).toHaveAttribute('aria-busy', 'true');
    await expect(workspace.getByRole('status')).toContainText('Loading interactive practice');
    await expect(option).toBeDisabled();
    await expect(checkAnswer).toBeDisabled();
    await page.getByText('Session options', { exact: true }).click();
    await expect(page.getByLabel('Course module')).toBeDisabled();
    await expect(page.getByRole('button', { name: kcnaAllQuestionsLabel, exact: true })).toBeDisabled();
    await option.evaluate((element) => (element as HTMLInputElement).click());
    await expect(option).not.toBeChecked();
  } finally { release(); }
  await expect(workspace).toHaveAttribute('aria-busy', 'false');
  await option.check();
  await expect(option).toBeChecked();
  await expect(page.locator('.mcq-option[data-state="selected"]')).toContainText('kube-scheduler');
  await expect(checkAnswer).toBeEnabled();
  await checkAnswer.click();
  await expect(page.locator('.mcq-feedback')).toContainText('Not quite');
});

for (const module of quizModules) {
  test(`${module.title} quiz opens a working module-only practice session`, async ({ page }) => {
    await page.goto(`/practice/kcna?module=${module.slug}&mode=all`);
    await page.getByText('Session options', { exact: true }).click();
    const moduleSelect = page.getByLabel('Course module');
    await expect(moduleSelect).toHaveValue(module.slug);
    const option = moduleSelect.locator(`option[value="${module.slug}"]`);
    await expect(option).toBeEnabled();
    const countMatch = (await option.textContent())!.match(/\((\d+)\)$/);
    expect(countMatch, `${module.slug} has an actual question count`).not.toBeNull();
    const count = Number(countMatch![1]);
    expect(count).toBeGreaterThan(0);
    await expect(page.locator('.mcq-question-meta')).toContainText(module.title);
    await expect(page.getByText(`Question 1 / ${count}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `All ${count}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.mcq-options input').first().check();
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.locator('.mcq-feedback')).toBeVisible();
    await expect(page.locator('.mcq-source-links a').first()).toHaveAttribute('href', /^\/learn\//);
    if (count > 1) {
      await page.getByRole('button', { name: 'Next question', exact: false }).click();
      await expect(page.getByText(`Question 2 / ${count}`, { exact: true })).toBeVisible();
      await expect(page.locator('.mcq-question-meta')).toContainText(module.title);
    }
  });
}

test('unknown module links safely fall back and switching modules updates the shareable URL', async ({ page }) => {
  await page.goto('/practice/kcna?module=missing-course-module&mode=all');
  await page.getByText('Session options', { exact: true }).click();
  const moduleSelect = page.getByLabel('Course module');
  await expect(moduleSelect).toHaveValue('all');
  await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toBeVisible();
  await moduleSelect.selectOption('service-mesh');
  await expect(page).toHaveURL(/mode=all.*module=service-mesh|module=service-mesh.*mode=all/);
  await expect(page.locator('.mcq-question-meta')).toContainText('Service Mesh');
  await page.getByRole('button', { name: /^Quick \d+$/ }).click();
  await expect(page).toHaveURL(/module=service-mesh/);
  expect(new URL(page.url()).searchParams.has('mode')).toBe(false);
  await moduleSelect.selectOption('all');
  expect(new URL(page.url()).searchParams.has('module')).toBe(false);
});

test('course quiz and mock checkpoints link to the corresponding practice scope', async ({ page }) => {
  await page.route('**/api/progress', (route) => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/review?*', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/kcna');
  await expect(page.locator('.path-session-status')).toContainText('Guest learning');
  for (const module of quizModules) {
    const quiz = module.steps.find((step) => step.kind === 'quiz')!;
    const section = page.locator(`#${module.slug}`);
    if (!(await section.evaluate((element) => (element as HTMLDetailsElement).open))) {
      await section.locator('summary').click();
    }
    await expect(page.locator(`[data-course-step="${quiz.id}"]`).getByRole('link', { name: 'Practice questions' })).toHaveAttribute('href', `/practice/kcna?module=${module.slug}`);
  }
  await page.locator('#mock-exams summary').click();
  await expect(page.getByRole('link', { name: 'Start mock practice' })).toHaveAttribute('href', '/practice/kcna?mode=all');
});
