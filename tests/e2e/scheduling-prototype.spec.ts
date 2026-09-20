import { test, expect } from '@playwright/test';

test('Pod scheduling teaches read, prediction, changed condition, proof, and independent explanation', async ({ page }) => {
  await page.goto('/models/pod-scheduling/');
  const lesson = page.locator('.scheduling-prototype');
  await expect(lesson).toContainText('Why can a Pod stay Pending?');
  await expect(lesson).toContainText('no score or mastery claim');

  await page.getByRole('button', { name: 'Try the placement decision' }).click();
  await expect(page.getByRole('heading', { name: 'Inspect the Pod and three nodes' })).toBeVisible();
  await expect(page.locator('.scheduling-pod')).toContainText('prefers zone=west');
  await expect(lesson).toContainText('A toleration matches here only when its key, value, and NoSchedule effect equal the taint');
  await expect(page.locator('.scheduling-node')).toHaveCount(3);
  await page.getByRole('radio', { name: 'node-b and node-c' }).check();
  await page.getByRole('button', { name: 'Check prediction' }).click();
  await expect(page.getByRole('status')).toContainText('Correct answer: No nodes');
  await expect(page.locator('.scheduling-choice[data-state="incorrect"]')).toContainText('Your answer · Incorrect');
  await expect(page.locator('.scheduling-choice[data-state="correct"]')).toContainText('Correct answer');
  await expect(page.locator('.scheduling-node').filter({ hasText: 'node-a' })).toContainText('Filtered out');

  await page.getByRole('button', { name: 'Change one condition' }).click();
  await page.getByRole('radio', { name: 'Only node-b becomes feasible' }).check();
  await page.getByRole('button', { name: 'Check prediction' }).click();
  await expect(page.getByRole('status')).toContainText('did not attract the Pod');
  await expect(lesson).toContainText('Toleration permits');

  await page.getByRole('button', { name: 'Trace what happens next' }).click();
  await expect(lesson).toContainText('kube-scheduler');
  await expect(lesson).toContainText('API server');
  await expect(lesson).toContainText('Node kubelet and runtime');
  await page.getByText('Inspect representative evidence').click();
  await expect(lesson).toContainText('Does not prove:');
  await expect(lesson).toContainText('not a live cluster observation');

  await page.getByRole('button', { name: 'Try a different scenario' }).click();
  await page.getByRole('radio', { name: 'Only node-z' }).check();
  await page.getByRole('button', { name: 'Check prediction' }).click();
  await expect(page.getByRole('status')).toContainText('Correct answer: node-y and node-z');
  await page.getByRole('textbox', { name: /In your own words/ }).fill('Preferences rank only feasible nodes. I would inspect scheduling events and the binding separately from startup.');
  await page.getByText('Compare with a model explanation').click();
  await expect(lesson).toContainText('Separates hard filtering from preference ranking.');
  await expect(lesson).toContainText('not graded or saved');
});

test('stage changes and prediction feedback remain visible on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/models/pod-scheduling/');
  await page.getByRole('button', { name: 'Try the placement decision' }).click();

  const stageHeading = page.getByRole('heading', { name: 'Inspect the Pod and three nodes' });
  await expect(stageHeading).toBeFocused();
  const stageBox = await stageHeading.boundingBox();
  expect(stageBox).not.toBeNull();
  expect(stageBox!.y).toBeGreaterThanOrEqual(0);
  expect(stageBox!.y + stageBox!.height).toBeLessThanOrEqual(844);

  await page.getByRole('radio', { name: 'node-b and node-c' }).check();
  await page.getByRole('button', { name: 'Check prediction' }).click();
  const feedback = page.locator('.scheduling-feedback');
  await expect(feedback).toBeFocused();
  const feedbackBox = await feedback.boundingBox();
  expect(feedbackBox).not.toBeNull();
  expect(feedbackBox!.y).toBeGreaterThanOrEqual(0);
  expect(feedbackBox!.y).toBeLessThan(844);

  await page.getByRole('button', { name: 'Change one condition' }).click();
  const changedHeading = page.getByRole('heading', { name: 'Change one condition' });
  await expect(changedHeading).toBeFocused();
  const changedBox = await changedHeading.boundingBox();
  expect(changedBox).not.toBeNull();
  expect(changedBox!.y).toBeGreaterThanOrEqual(0);
  expect(changedBox!.y + changedBox!.height).toBeLessThanOrEqual(844);
});
