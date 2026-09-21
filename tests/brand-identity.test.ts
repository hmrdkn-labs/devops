import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const sourcePath = 'docs/assets/beaver-2026-09-21/A1.png';
const derivatives = [
  { size: 32, bytes: 1_941, hash: 'd4e0d11884704f0140abccf4ed1ce6e09ff19ff133a04e28f048724f8e2e4418' },
  { size: 64, bytes: 5_642, hash: '81cfbf36633880e8c1474bd8fa76ad6e519fba86eca4b8d116990842daa4b288' },
  { size: 144, bytes: 22_093, hash: '0432c4acea383596009e114e3ba29e60aa4ad0f6e7bcdd42abf6ea82f974ddca' },
  { size: 288, bytes: 82_098, hash: '5599f96b633960a3f42a7798473805f3a11fa90eed74bb3457ce4cb25cbd098b' },
] as const;

function pngDimensions(source: Uint8Array) {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe('selected beaver identity', () => {
  test('pins the exact selected A1 source asset', () => {
    const source = readFileSync(sourcePath);

    expect(source.byteLength).toBe(1_082_749);
    expect(createHash('sha256').update(source).digest('hex'))
      .toBe('5890d0143f18db40c6f4e4fa26994c84b0a7432cf38e3e784bd694e2e330128e');
    expect(String.fromCharCode(...source.subarray(12, 16))).toBe('IHDR');
    expect(pngDimensions(source)).toEqual({ width: 1254, height: 1254 });
  });

  test('pins small, proportional A1 derivatives for static and server-rendered routes', () => {
    for (const expected of derivatives) {
      const derivative = readFileSync(`public/assets/brand/beaver-a1-${expected.size}.png`);
      expect(derivative.byteLength).toBe(expected.bytes);
      expect(createHash('sha256').update(derivative).digest('hex')).toBe(expected.hash);
      expect(pngDimensions(derivative)).toEqual({ width: expected.size, height: expected.size });
    }
  });

  test('uses versioned A1 derivatives without replacing the wordmark', () => {
    const component = readFileSync('src/components/BrandMark.astro', 'utf8');
    const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
    const home = readFileSync('src/pages/index.astro', 'utf8');

    expect(component).toContain('/assets/brand/beaver-a1-${size}.png');
    expect(component).toContain('/assets/brand/beaver-a1-${size * 2}.png');
    expect(layout).toContain('href="/assets/brand/beaver-a1-64.png"');
    expect(layout).not.toContain('astro:assets');
    expect(layout).toContain('<BrandMark class="brand-mark" size={32}');
    expect(layout).toContain('<span class="brand-name">DevOps <small>hmrdkn-labs</small></span>');
    expect(home).toContain('<BrandMark class="home-welcome-mark" size={144}');
    expect(home).toContain('/learn/container-lifecycle?mode=reference');
  });
});
