import { expect, type Page } from '@playwright/test';

export async function open(page: Page, slug: string) {
  await page.goto(`/anatomy/${slug}/`);
  const figure = page.locator('.anatomy-figure');
  await expect(figure).toHaveAttribute('aria-busy', 'false');
  return figure;
}
