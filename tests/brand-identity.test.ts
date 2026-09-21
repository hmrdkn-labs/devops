import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const sourcePath = 'docs/assets/beaver-2026-09-21/A1.png';
const characterDerivatives = [
  { size: 32, bytes: 1_941, hash: 'd4e0d11884704f0140abccf4ed1ce6e09ff19ff133a04e28f048724f8e2e4418' },
  { size: 64, bytes: 5_642, hash: '81cfbf36633880e8c1474bd8fa76ad6e519fba86eca4b8d116990842daa4b288' },
  { size: 144, bytes: 22_093, hash: '0432c4acea383596009e114e3ba29e60aa4ad0f6e7bcdd42abf6ea82f974ddca' },
  { size: 288, bytes: 82_098, hash: '5599f96b633960a3f42a7798473805f3a11fa90eed74bb3457ce4cb25cbd098b' },
] as const;
const markSourcePath = 'docs/assets/beaver-logo-poses-2026-09-21/P2-selected-mark-crop.png';
const markDerivatives = [
  { size: 32, bytes: 1_902, hash: 'd7111d8a178b4ceb760cd729dbe3da92dea645148f1566a59093410bc4329da3' },
  { size: 64, bytes: 4_893, hash: '1dc3518a24c2fbf6067085fb58f5966b7647856b61516e8b80365506aeed9241' },
  { size: 144, bytes: 18_974, hash: '2d28decc0860ef3ede0ff86930df43459a031c4a5149f676d554af0731a09ab1' },
  { size: 288, bytes: 69_912, hash: '5a7819be0f7a95dcfcdd7dc09b4b7df7e57fafc9e3b26d34413a8d95840553c7' },
  { size: 512, bytes: 199_779, hash: '37000f24944ce5829d8514f6997449c048a65d35687ff7f890e052941b6161c1' },
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

  test('pins small, proportional A1 character derivatives for larger character surfaces', () => {
    for (const expected of characterDerivatives) {
      const derivative = readFileSync(`public/assets/brand/beaver-a1-${expected.size}.png`);
      expect(derivative.byteLength).toBe(expected.bytes);
      expect(createHash('sha256').update(derivative).digest('hex')).toBe(expected.hash);
      expect(pngDimensions(derivative)).toEqual({ width: expected.size, height: expected.size });
    }
  });

  test('pins the selected cropped P2 production mark and its derivatives', () => {
    const source = readFileSync(markSourcePath);
    expect(source.byteLength).toBe(441_621);
    expect(createHash('sha256').update(source).digest('hex'))
      .toBe('9bd12afdb065316cee44894ee4d52a2255d4db8afc9ef91ed7d4611faca567e2');
    expect(pngDimensions(source)).toEqual({ width: 820, height: 820 });

    for (const expected of markDerivatives) {
      const derivative = readFileSync(`public/assets/brand/devops-mark-${expected.size}.png`);
      expect(derivative.byteLength).toBe(expected.bytes);
      expect(createHash('sha256').update(derivative).digest('hex')).toBe(expected.hash);
      expect(pngDimensions(derivative)).toEqual({ width: expected.size, height: expected.size });
    }
  });

  test('uses the cropped P2 mark in navigation while keeping the full character on the home welcome', () => {
    const component = readFileSync('src/components/BrandMark.astro', 'utf8');
    const character = readFileSync('src/components/BrandCharacter.astro', 'utf8');
    const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
    const home = readFileSync('src/pages/index.astro', 'utf8');

    expect(component).toContain('/assets/brand/devops-mark-${size}.png');
    expect(component).toContain('/assets/brand/devops-mark-${size * 2}.png');
    expect(character).toContain('/assets/brand/beaver-a1-${size}.png');
    expect(layout).toContain('href="/assets/brand/devops-mark-64.png"');
    expect(layout.match(/rel="icon"/g)).toHaveLength(1);
    expect(layout).toContain('href="/assets/brand/apple-touch-icon.png"');
    expect(layout).not.toContain('astro:assets');
    expect(layout).toContain('<BrandMark class="brand-mark" size={32}');
    expect(layout).toContain('<span class="brand-name">DevOps <small>hmrdkn-labs</small></span>');
    expect(home).toContain('<BrandCharacter class="home-welcome-mark" size={144}');
    expect(home).toContain('/learn/container-lifecycle?mode=reference');
  });
});
