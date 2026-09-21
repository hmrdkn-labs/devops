import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const models = ['kubernetes-reconciliation', 'service-request-path'].map((slug) => parse(readFileSync(`content/mental-models/${slug}.yaml`, 'utf8')));

test('guided controls stay inert until the island hydrates', async ({ page }) => {
  const model = models[0];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/_astro\/GuidedModelSequence\.[^/]+\.js$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto(`/models/${model.slug}/`, { waitUntil: 'commit' });
  const guide = page.locator('.guided-model');
  const start = guide.getByRole('button', { name: model.guided_sequence.read.start_label });
  try {
    await expect.poll(() => held).toBe(true);
    await expect(guide).toHaveAttribute('aria-busy', 'true');
    await expect(guide).toContainText(model.guided_sequence.read.worked_example);
    await expect(start).toBeDisabled();
    await start.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(guide).toContainText('Step 1 of 5');
  } finally { release(); }
  await expect(guide).toHaveAttribute('aria-busy', 'false');
  await expect(start).toBeEnabled();
});

for (const model of models) test(`${model.title} completes a revisitable guided sequence`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/models/${model.slug}/`);
  const guide = page.locator('.guided-model');
  await expect(guide).toContainText('Exploration only · progress is not saved');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();

  let violations = (await new AxeBuilder({ page }).include('.guided-model').analyze()).violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(violations).toEqual([]);

  await guide.getByRole('button', { name: model.guided_sequence.read.start_label }).click();
  const initial = model.guided_sequence.initial;
  const initialWrong = initial.choices.find((choice: { id: string }) => choice.id !== initial.answer_id)!;
  await guide.getByRole('radio', { name: initialWrong.text }).check();
  await guide.getByRole('button', { name: 'Check prediction' }).click();
  await expect(guide.locator('.guided-model-feedback')).toBeFocused();
  await expect(guide.locator('label[data-state="incorrect"]')).toContainText('Your answer · Incorrect');
  await expect(guide.locator('label[data-state="correct"]')).toContainText('Correct answer');

  violations = (await new AxeBuilder({ page }).include('.guided-model').analyze()).violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''));
  expect(violations).toEqual([]);

  await guide.getByRole('button', { name: 'Change one condition' }).click();
  const change = model.guided_sequence.change;
  await guide.getByRole('radio', { name: change.choices.find((choice: { id: string }) => choice.id === change.answer_id)!.text }).check();
  await guide.getByRole('button', { name: 'Check prediction' }).click();
  await guide.getByRole('button', { name: '← Revisit previous stage' }).click();
  await expect(guide.getByRole('radio', { name: new RegExp(initialWrong.text) })).toBeChecked();
  await expect(guide.locator('.guided-model-feedback')).toContainText(initial.correct_explanation);
  await guide.getByRole('button', { name: 'Change one condition' }).click();
  await guide.getByRole('button', { name: 'Explain the boundaries' }).click();

  await expect(guide.locator('.guided-model-tracks [data-kind="control"]')).toBeVisible();
  await expect(guide.locator('.guided-model-tracks [data-kind="execution"]')).toBeVisible();
  if (model.slug === 'service-request-path') {
    await expect(guide.locator('.guided-model-tracks [data-kind="control"]')).toContainText('EndpointSlice');
    await expect(guide.locator('.guided-model-tracks [data-kind="execution"]')).not.toContainText('EndpointSlice');
  }
  await guide.getByText('Inspect representative evidence').click();
  await expect(guide).toContainText(model.guided_sequence.explain.proof.limitation);
  await guide.getByRole('button', { name: 'Try an independent case' }).click();

  const transfer = model.guided_sequence.transfer;
  const transferWrong = transfer.choices.find((choice: { id: string }) => choice.id !== transfer.answer_id)!;
  await guide.getByRole('radio', { name: transferWrong.text }).check();
  await guide.getByRole('button', { name: 'Check prediction' }).click();
  await guide.getByRole('textbox', { name: transfer.explain_prompt }).fill('I separate the actor decision, recorded state, and execution evidence without treating one as proof of the others.');
  await guide.getByText('Compare with an authored explanation').click();
  await expect(guide).toContainText(transfer.checklist[0]);
  for (const link of model.guided_sequence.next_links) await expect(guide.getByRole('link', { name: link.label })).toHaveAttribute('href', link.href);
  await expect(page.getByText('Detailed component walkthrough — separate example', { exact: true })).toBeVisible();
  if (model.slug === 'kubernetes-reconciliation') {
    await guide.getByRole('link', { name: 'Read Kubernetes API and control loops' }).click();
    await expect(page).toHaveURL(/\/learn\/kubernetes-control-loop\/?\?mode=reference$/);
    await expect(page.getByTestId('reader-workspace')).toBeVisible();
  }
});
