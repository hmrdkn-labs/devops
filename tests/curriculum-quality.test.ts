import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

// This rejects a known retired generator, not factual or pedagogical quality.
// Source correctness, worked cases, and model usefulness require independent review.
describe('bespoke curriculum regression', () => {
  for (const slug of readdirSync('content/units')) {
    it(`${slug} does not restore generated transfer-question boilerplate`, () => {
      const questions = parse(readFileSync(`content/units/${slug}/questions.yaml`, 'utf8')).questions;
      for (const question of questions) {
        expect(question.prompt).not.toMatch(/^Plan this exercise before touching the system:/);
        expect(question.model_answer).not.toMatch(/^A strong evidence-first plan is:/);
      }
    });
  }
});
