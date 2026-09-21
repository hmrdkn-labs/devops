import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { pathSchema, practiceSetSchema } from '../src/lib/content/schema';

const kcnaPath = pathSchema.parse(parse(readFileSync('content/paths/kcna.yaml', 'utf8')));
const kcnaPractice = practiceSetSchema.parse(parse(readFileSync('content/practice/kcna-mcq.yaml', 'utf8')));

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

  it('keeps independent questions and later-review cards for every KCNA objective', () => {
    for (const entry of kcnaPath.units) {
      const slug = entry.unit_id.replace('fpp:', '');
      const metadata = parse(readFileSync(`content/units/${slug}/metadata.yaml`, 'utf8'));
      const questions = parse(readFileSync(`content/units/${slug}/questions.yaml`, 'utf8')).questions;
      const cards = parse(readFileSync(`content/units/${slug}/cards.yaml`, 'utf8')).cards;
      expect(questions.length, `${slug} independent questions`).toBeGreaterThanOrEqual(3);
      for (const objective of metadata.objectives) {
        expect(questions.some((question: { objective_ids: string[] }) => question.objective_ids.includes(objective.id)), `${objective.id} question coverage`).toBe(true);
        expect(cards.some((card: { objective_ids: string[] }) => card.objective_ids.includes(objective.id)), `${objective.id} later-review coverage`).toBe(true);
      }
    }
  });

  it('provides meaningful module-filtered practice for the audited thin and novice pilot areas', () => {
    const expectedMinimums = {
      'kubernetes-fundamentals': 4,
      'kubernetes-resources': 4,
      security: 6,
      storage: 6,
      'service-mesh': 6,
    };
    for (const [module, minimum] of Object.entries(expectedMinimums)) {
      const questions = kcnaPractice.questions.filter((question) => question.course_module === module);
      expect(questions.length, module).toBeGreaterThanOrEqual(minimum);
      expect(new Set(questions.map((question) => question.category)).size, `${module} practice variety`).toBeGreaterThanOrEqual(2);
    }
  });

  it('does not turn the enrichment block into an answer-position cue', () => {
    const prefixes = [
      'practice:kcna/q-fundamentals-',
      'practice:kcna/q-resources-',
      'practice:kcna/q-security-serviceaccount-',
      'practice:kcna/q-security-imagepull-',
      'practice:kcna/q-security-pod-network-',
      'practice:kcna/q-security-auth-can-i',
      'practice:kcna/q-storage-rwo-',
      'practice:kcna/q-storage-wait-',
      'practice:kcna/q-storage-reclaim-',
      'practice:kcna/q-storage-pvc-evidence',
      'practice:kcna/q-mesh-routing-',
      'practice:kcna/q-mesh-gateway-',
      'practice:kcna/q-mesh-observability-',
    ];
    const enrichment = kcnaPractice.questions.filter((question) => prefixes.some((prefix) => question.id.startsWith(prefix)));
    expect(enrichment).toHaveLength(19);
    const singleAnswerPositions = enrichment
      .filter((question) => question.select === 'single')
      .map((question) => question.options.findIndex((option) => option.id === question.answer_ids[0]));
    expect(new Set(singleAnswerPositions)).toEqual(new Set([0, 1, 2, 3]));
  });
});
