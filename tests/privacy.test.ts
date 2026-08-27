import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('public artifact privacy', () => {
  it('contains no learner answers or notes in the public search index', () => {
    const index = readFileSync('public/search-index.json', 'utf8');
    expect(index).not.toContain('answer_markdown');
    expect(index).not.toContain('private_answer');
    expect(index).not.toContain('note_markdown');
  });

  it('keeps guest learning state out of browser persistence', () => {
    const studyFlow = readFileSync('src/components/StudyFlow.tsx', 'utf8');
    expect(studyFlow).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('does not publish live Cloudflare binding IDs or OAuth secrets', () => {
    const wrangler = readFileSync('wrangler.jsonc', 'utf8');
    expect(wrangler).not.toContain('database_id');
    expect(wrangler).not.toMatch(/client_secret|BETTER_AUTH_SECRET/);
  });
});
