import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const css = readFileSync('src/styles/global.css', 'utf8');

function tokenBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (!body) throw new Error(`Missing token block: ${selector}`);
  return Object.fromEntries(Array.from(body.matchAll(/--([a-z-]+):\s*([^;]+);/g), ([, name, value]) => [name, value.trim().toLowerCase()]));
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/../g)?.map((value) => Number.parseInt(value, 16) / 255);
  if (!channels || channels.length !== 3) throw new Error(`Expected six-digit hex color, received ${hex}`);
  const [red, green, blue] = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(foreground: string, background: string) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const light = tokenBlock(":root,\nhtml[data-theme='light']");
const dark = tokenBlock("html[data-theme='dark']");
const systemDark = tokenBlock("html[data-theme='system']");

describe('semantic visual tokens', () => {
  test('uses the approved warm-paper, cobalt, and slate roles', () => {
    expect(light).toMatchObject({
      canvas: '#f7f5f0', surface: '#ffffff', ink: '#202b33', muted: '#52616b',
      accent: '#2358c4', 'accent-ink': '#ffffff', success: '#23745a', warning: '#8a5400',
      danger: '#b34436', 'line-strong': '#788690',
    });
    expect(dark).toMatchObject({
      canvas: '#151c24', surface: '#1d2732', ink: '#f1f3f5', muted: '#b2bec9',
      accent: '#a9c2ff', 'accent-ink': '#142238', success: '#82ceaf', warning: '#e5b96b',
      danger: '#ffb3a7', 'line-strong': '#778793',
    });
  });

  test('keeps explicit dark and system-dark semantic roles in parity', () => {
    for (const role of ['canvas', 'surface', 'surface-subtle', 'surface-raised', 'ink', 'muted', 'faint', 'line', 'line-strong', 'accent', 'accent-strong', 'accent-soft', 'accent-ink', 'success', 'warning', 'danger', 'code', 'code-ink', 'ring']) {
      expect(systemDark[role], role).toBe(dark[role]);
    }
  });

  test.each([
    ['light primary text', light.ink, light.canvas, 4.5],
    ['light secondary text', light.muted, light.canvas, 4.5],
    ['light primary control', light['accent-ink'], light.accent, 4.5],
    ['light primary hover', light['accent-ink'], light['accent-strong'], 4.5],
    ['light selected control', light['accent-strong'], light['accent-soft'], 4.5],
    ['light control boundary', light['line-strong'], light.surface, 3],
    ['light focus ring', light.ring, light.canvas, 3],
    ['dark primary text', dark.ink, dark.canvas, 4.5],
    ['dark secondary text', dark.muted, dark.canvas, 4.5],
    ['dark primary control', dark['accent-ink'], dark.accent, 4.5],
    ['dark primary hover', dark['accent-ink'], dark['accent-strong'], 4.5],
    ['dark selected control', dark['accent-strong'], dark['accent-soft'], 4.5],
    ['dark control boundary', dark['line-strong'], dark.surface, 3],
    ['dark focus ring', dark.ring, dark.canvas, 3],
  ] as const)('%s meets its contrast boundary', (_label, foreground, background, minimum) => {
    expect(contrast(foreground!, background!)).toBeGreaterThanOrEqual(minimum);
  });

  test('primary controls consume semantic text and interactive-boundary tokens', () => {
    expect(css).toMatch(/\.button\.primary\s*\{[^}]*color:\s*var\(--accent-ink\)/s);
    expect(css).toMatch(/\.lesson-primary\s*\{[^}]*color:\s*var\(--accent-ink\)/s);
    expect(css).toMatch(/input, textarea, select\s*\{[^}]*border:\s*1px solid var\(--line-strong\)/s);
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--ring\)/s);
  });

  test('essential study status text does not fall back to ten-pixel metadata', () => {
    for (const selector of ['.study-workspace-bar > span', '.workspace-message', '.save-status', '.unit-learning-status small']) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rule = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule, selector).toMatch(/(?:font-size|font):\s*(?:[^;]*\s)?\.875rem/);
    }
  });
});
