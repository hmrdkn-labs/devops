import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';

const models = readdirSync('content/mental-models').filter((file) => file.endsWith('.yaml')).map((file) => parse(readFileSync(`content/mental-models/${file}`, 'utf8')));

test('model controls wait for delayed island handlers before accepting a prediction', async ({ page }) => {
  const model = models[0];
  const step = model.steps[0];
  const wrong = step.prediction.options.find((option: { id: string }) => option.id !== step.prediction.answer_id);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let held = false;
  await page.route(/\/_astro\/MentalModelPlayer\.[^/]+\.js$/, async (route) => {
    held = true;
    await pending;
    await route.continue();
  });
  await page.goto(`/models/${model.slug}/`, { waitUntil: 'commit' });
  const workspace = page.locator('.mental-model-workspace');
  const radio = page.getByRole('radio', { name: wrong.text, exact: true });
  const reveal = page.getByRole('button', { name: 'Check prediction & reveal', exact: true });
  try {
    await expect.poll(() => held).toBe(true);
    await expect(workspace).toHaveAttribute('aria-busy', 'true');
    await expect(workspace).toContainText(model.scenario);
    await expect(workspace.getByRole('status')).toContainText('Loading interactive model');
    await expect(radio).toBeDisabled();
    await expect(reveal).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Replay scenario', exact: true })).toBeDisabled();
    for (const node of await page.locator('.mental-model-node').all()) await expect(node).toBeDisabled();
    // Native read-only disclosures remain usable while the interactive script is held.
    await page.getByText('Scenario assumptions', { exact: true }).click();
    await expect(workspace.getByText(model.assumptions[0], { exact: true })).toBeVisible();
    await radio.evaluate((element) => (element as HTMLInputElement).click());
    await expect(radio).not.toBeChecked();
  } finally { release(); }
  await expect(workspace).toHaveAttribute('aria-busy', 'false');
  await expect(radio).toBeEnabled();
  await radio.check();
  await expect(reveal).toBeEnabled();
  await reveal.click();
  await expect(page.getByRole('heading', { name: 'Let’s correct the model', exact: true })).toBeVisible();
  await expect(workspace.getByRole('status')).toContainText(step.action);
});

test('KCNA exposes the model catalog and every model has a reachable page', async ({ page }) => {
  await page.goto('/kcna/');
  await page.getByText('Guided lessons, mental models, and scheduled review', { exact: true }).click();
  await page.getByRole('link', { name: 'Interactive mental models', exact: true }).click();
  await expect(page).toHaveURL(/\/models\/?$/);
  for (const model of models) {
    const link = page.locator(`a[href="/models/${model.slug}"], a[href="/models/${model.slug}/"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByRole('heading', { name: model.title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy();
    await page.goBack();
  }
});

test('unit reference offers the same model while preserving the current explanation', async ({ page }) => {
  const model = models.find((entry) => entry.unit_ids.length > 0)!;
  const unit = readdirSync('content/units').find((slug) => parse(readFileSync(`content/units/${slug}/metadata.yaml`, 'utf8')).id === model.unit_ids[0]);
  await page.goto(`/learn/${unit}/`);
  const draft = page.getByRole('textbox', { name: 'Your explanation', exact: true });
  await draft.fill('My prediction should remain here while I inspect the model.');
  await page.getByRole('button', { name: 'Reference', exact: true }).click();
  const links = page.getByTestId('mental-model-links');
  await links.locator('summary').click();
  const link = links.locator(`a[href="/models/${model.slug}/"]`);
  await expect(link).toHaveAttribute('target', '_blank');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup.getByRole('heading', { name: model.title, exact: true })).toBeVisible();
  await popup.close();
  await expect(draft).toHaveValue('My prediction should remain here while I inspect the model.');
});

// Keep the traversal budget per scenario: one delayed island should not spend
// the shared timeout of every remaining model in the catalog.
test.describe('every model teaches prediction, evidence, failure reasoning, transfer, and replay', () => {
  for (const model of models) test(model.title, async ({ page }) => {
    await page.goto(`/models/${model.slug}/`);

    for (let index = 0; index < model.steps.length; index += 1) {
      const step = model.steps[index];
      const wrong = step.prediction.options.find((option: { id: string }) => option.id !== step.prediction.answer_id);
      await page.getByRole('radio', { name: wrong.text }).check();
      await page.getByRole('button', { name: 'Check prediction & reveal' }).click();
      await expect(page.getByRole('heading', { name: 'Let’s correct the model' })).toBeVisible();
      await expect(page.getByRole('status')).toContainText(step.action);

      const actor = model.components.find((component: { id: string }) => component.id === step.actor_id);
      await page.getByRole('button', { name: new RegExp(actor.name) }).click();
      await expect(page.getByText(actor.responsibility, { exact: true })).toBeVisible();

      await page.getByText('Inspect the evidence', { exact: true }).click();
      await expect(page.getByText(step.proof.command, { exact: true })).toBeVisible();
      const evidence = page.locator('details.mental-model-evidence');
      await expect(evidence).toContainText(step.proof.limitation);

      const failureToggle = page.getByRole('checkbox', { name: new RegExp(step.failure.condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
      await failureToggle.check();
      const nextCheck = page.locator('.mental-model-feedback p').filter({ hasText: 'Next check:' });
      await expect(nextCheck).toContainText(step.failure.next_check);
      await failureToggle.uncheck();

      if (index + 1 < model.steps.length) {
        await page.getByRole('button', { name: 'Predict next step' }).click();
      }
    }

    for (const transfer of model.transfer_questions) {
      await expect(page.getByText(transfer.prompt, { exact: true })).toBeVisible();
    }

    await page.getByRole('button', { name: 'Replay scenario' }).click();
    await expect(page.getByText(`1 of ${model.steps.length} steps`, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check prediction & reveal' })).toBeDisabled();
  });
});
