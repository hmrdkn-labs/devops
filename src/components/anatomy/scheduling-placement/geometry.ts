import * as k from '@/lib/anatomy/vendor/iso-kit';

/* Concept → mechanism (original capacity comparator bench):
 * Allocatable is each ruler's full span; existing requests are its fixed shoe;
 * available budget is the remaining interval; a moving comparator jaw reads the
 * incoming request against both rulers. Filtering lifts only feasible dock flags.
 * Scoring traverses a rail carriage to one feasible dock; binding slides the
 * request cartridge into its socket. A separate execution latch rises only on
 * the node-execution step. This is an accounting instrument, not Pod transport.
 *
 * Purposeful parts, before geometry (76 major parts, excluding fasteners):
 * Base: deck, inset groove, four foot pads, four foot stems, front trim,
 * instruction plate (12). Structure: two transit rails, four rail seats,
 * two end stops, three dock foundations, six transfer guide rails (17).
 * Three comparators each: CPU ruler, memory ruler, CPU occupied shoe,
 * memory occupied shoe, CPU request jaw, memory request jaw, CPU stop,
 * memory stop, dock flag, flag mounting shoe (30).
 * Subject: carriage plate, four bearing shoes, cartridge shell, cartridge lid,
 * two contact fingers, pull neck, pull handle, execution latch (12).
 * Finish: three dock socket floors, three socket back stops (6).
 * All scales have edge-rooted ticks; all seams wrap the parent silhouette;
 * fasteners occupy actual plate corners. No decorative pipes or loose wires.
 * Painter constraints: deck below supported assemblies, far dock before near
 * carriage; comparator tracks separate in y; request jaws slide along their own
 * scales. Cartridge travels above guide rails, never through another dock.
 */

const base: k.Plan = { x: -62, y: -108, w: 300, d: 198, r: 9 };
export const P = k.fitProjection(k.boxCorners(base, -14, 50), 760, 440, { pad: 24, azimuth: 58, elevation: 38 });
export const CENTERS = [0, 88, 176];
export const INITIAL_X = -36;
export const TRACK_LENGTH = 62;
export const GAUGE_Y = [-83, -59];
const items: { layer: number; depth: number; markup: string }[] = [];

function plate(plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', details = '') {
  items.push({ layer: z < -4 ? 0 : z === -4 ? 1 : 2, depth: k.depthOf([plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2], P), markup: k.solidSvg(k.slabOf(plan, z, h, P, 5, .6), { tone, inner: details }) });
}

function screws(plan: k.Plan, z: number) {
  return k.corners(plan, 3).map(([x, y]) => k.lineSvg(k.ring(x, y, 1.1, z, P, 16), { tone: 'lo' }) + k.dotsSvg([k.iso([x, y, z], P)], { size: .45 })).join('');
}

for (const [x, y] of k.corners(base, 18)) {
  plate({ x: x - 7, y: y - 7, w: 14, d: 14, r: 3 }, -14, 5, 'lo');
  plate({ x: x - 5, y: y - 5, w: 10, d: 10, r: 2 }, -9, 5, 'lo');
}
plate(base, -4, 8, 'lo', k.lineSvg(k.sideSeam(base, 1, P, 5), { tone: 'faint' }) + k.lineSvg(k.planOutline(k.insetPlan(base, 5), 4, P), { tone: 'faint' }) + screws(base, 4));
plate({ x: -49, y: 78, w: 274, d: 5, r: 1 }, 4, 2, 'lo');
const label = { x: -47, y: 59, w: 47, d: 14, r: 1 };
plate(label, 4, 1, 'lo', screws(label, 5) + [0, 1, 2].map((row) => k.lineSvg(k.lineOnTop([-40, 63 + row * 3], [-12 + row * 4, 63 + row * 3], 5, P), { tone: 'lo', free: true })).join(''));
for (const y of [22, 48]) {
  for (const x of [-48, 212]) plate({ x, y: y - 5, w: 10, d: 10, r: 1 }, 4, 10, 'lo');
  plate({ x: -48, y: y - 2, w: 270, d: 4, r: 1 }, 14, 4);
}
for (const x of [-52, 218]) {
  const stop = { x, y: 16, w: 6, d: 38, r: 1 };
  plate(stop, 4, 16, 'mid', screws(stop, 20));
}
const jaws: string[][] = [];
const flags: string[] = [];
for (const x of CENTERS) {
  const support = { x: x - 37, y: -95, w: 76, d: 81, r: 3 };
  plate(support, 4, 5, 'mid', screws(support, 9));
  for (const y of GAUGE_Y) {
    const ruler = { x: x - 31, y, w: TRACK_LENGTH, d: 12, r: 1 };
    const ticks = k.topTicks(x - 31, x + 31, TRACK_LENGTH / 16, 4, y, 10, [2, 4], P);
    plate(ruler, 9, 1, 'lo', k.lineSvg(ticks.minor, { tone: 'lo' }) + k.lineSvg(ticks.major, { tone: 'mid' }));
    plate({ x: x - 33, y, w: 2, d: 12, r: .3 }, 10, 5, 'mid');
  }
  jaws.push(GAUGE_Y.map((y) => k.solidSvg(k.slabOf({ x: x - 32, y: y + 1, w: 2, d: 10, r: .4 }, 13, 4, P, 3, .3), { tone: 'hi' })));
  plate({ x: x - 7, y: -40, w: 14, d: 10, r: 1 }, 9, 3, 'mid');
  plate({ x: x - 1, y: -39, w: 2, d: 1, r: .2 }, 12, 15, 'mid');
  flags.push(k.solidSvg(k.slabOf({ x: x - 5, y: -38, w: 10, d: 6, r: 1 }, 12, 3, P, 3), { tone: 'hi' }));
  plate({ x: x - 23, y: -27, w: 46, d: 26, r: 2 }, 9, 15, 'lo');
  plate({ x: x - 23, y: -30, w: 46, d: 3, r: 1 }, 9, 20, 'mid');
  plate({ x: x - 17, y: -1, w: 34, d: 20, r: .5 }, 4, 20, 'lo');
  for (const dx of [-22, 19]) plate({ x: x + dx, y: -13, w: 3, d: 32, r: .5 }, 4, 20, 'mid');
}
items.sort((a, b) => a.layer - b.layer || a.depth - b.depth);
export const STATIC = `<path class="iso-halo" d="${k.haloOf(base, -14, 6, P)}"/>` + items.map((item) => item.markup).join('');
export const REQUEST_JAWS = jaws;
export const FLAGS = flags;

const carriage = { x: INITIAL_X - 25, y: 19, w: 50, d: 33, r: 3 };
export const CARRIAGE = [-23, 17].flatMap((dx) => [22, 44].map((y) => k.solidSvg(k.slabOf({ x: INITIAL_X + dx, y, w: 6, d: 7, r: 1 }, 18, 3, P, 3), { tone: 'mid' }))).join('')
  + k.solidSvg(k.slabOf(carriage, 21, 3, P, 5, .6), { tone: 'mid', inner: screws(carriage, 24) });
const cartridge = { x: INITIAL_X - 17, y: 26, w: 34, d: 18, r: 2 };
export const CARTRIDGE = [-12, 8].map((dx) => k.solidSvg(k.slabOf({ x: INITIAL_X + dx, y: 22, w: 4, d: 4, r: .3 }, 24, 2, P, 3), { tone: 'hi' })).join('')
  + k.solidSvg(k.slabOf(cartridge, 24, 10, P, 5, .6), { tone: 'hi', lit: true, inner: k.lineSvg(k.sideSeam(cartridge, 31, P, 5), { tone: 'faint' }) })
  + k.solidSvg(k.slabOf(k.insetPlan(cartridge, 2), 34, 1, P, 5), { tone: 'hi', inner: screws(k.insetPlan(cartridge, 2), 35) })
  + k.solidSvg(k.slabOf({ x: INITIAL_X - 3, y: 44, w: 6, d: 3, r: .5 }, 26, 4, P, 3), { tone: 'mid' })
  + k.solidSvg(k.slabOf({ x: INITIAL_X - 9, y: 47, w: 18, d: 3, r: 1 }, 26, 4, P, 3), { tone: 'hi' })
  + k.solidSvg(k.slabOf({ x: INITIAL_X - 1, y: 30, w: 2, d: 1, r: .2 }, 35, 11, P, 3), { tone: 'mid' });
export const EXECUTION_LATCH = k.solidSvg(k.slabOf({ x: INITIAL_X - 5, y: 31, w: 10, d: 8, r: 1 }, 35, 2, P, 3), { tone: 'mid' });
