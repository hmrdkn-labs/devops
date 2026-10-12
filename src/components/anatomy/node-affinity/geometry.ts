import * as k from '@/lib/anatomy/vendor/iso-kit';

/**
 * Concept → mechanism, designed before geometry:
 * Node labels are keyed cards held in three reader beds, engraved node-a, node-b and
 * node-c from left to right. Each bed has three feeler combs: left for the nodeSelector
 * label check, right for the required-affinity label check, and middle for request
 * capacity, a separate predicate. A feeler lifts only after evaluation, when its own
 * check applies and passes. A graduated score plunger rises only on eligible beds.
 * The lit Pod carriage travels along the selector rail, then seats over the chosen bed.
 * A retained carriage after a label change represents IgnoredDuringExecution, not
 * migration. This is a bench analogy, not literal scheduler hardware or measured timing.
 * Purposeful parts inventory (over 80 solids, plus fasteners/face details):
 * base: four feet, four foot pads, base casting, service lid, maker plate (11);
 * gantry: four pedestal shoes, four posts, rear crossbeam, two guide rails,
 * four rail end stops, scale strip (16); each of three reader beds: tray floor,
 * left/right tray walls, rear stop, two travel rails, two card sockets, two label cards,
 * three comb mounts, three sliding feeler combs, score housing, score plunger (50);
 * carriage: deck, two bearing shoes, Pod cartridge, lid, two latch tabs,
 * handle stems and handle bridge (10). Fasteners seat on real top faces;
 * closed card grooves and score scales attach to their hosts, never float.
 */
const base: k.Plan = { x: -166, y: -76, w: 332, d: 192, r: 9 };
export const projection = k.fitProjection(k.boxCorners(base, -12, 92), 720, 420, { pad: 28, elevation: 36, azimuth: 38 });
export const laneX = [-106, 0, 106];
/** Feeler x positions per bed: nodeSelector (left), request capacity (middle), required affinity (right). */
const combX = (x: number) => [x - 33, x - 5, x + 22];
const parts: string[] = [];
function box(x: number, y: number, w: number, d: number, z: number, h: number, tone: k.Tone = 'mid', lit = false) {
  const plan = { x, y, w, d, r: Math.min(2, w / 4, d / 4) };
  const screws = w > 15 && d > 10 ? k.dotsSvg(k.pointsAt(k.corners(plan, 3).map(([a, b]) => [a, b, z + h] as k.Point3), projection), { size: .65 }) : '';
  return k.solidSvg(k.slabOf(plan, z, h, projection, 4, .5), { tone, lit, inner: screws });
}
// Wide horizontal assemblies are painted bottom-to-top. Reader lanes are
// separated by 24 units; local back-to-front order is explicit within each bed.
for (const [x, y] of k.corners(base, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], projection) - k.depthOf([b[0], b[1], 0], projection))) {
  parts.push(box(x - 8, y - 8, 16, 16, -12, 3, 'lo'), box(x - 6, y - 6, 12, 12, -9, 5, 'lo'));
}
parts.push(k.solidSvg(k.slabOf(base, -4, 8, projection, 8, 1.2), { tone: 'lo', inner: k.lineSvg(k.sideSeam(base, 0, projection), { tone: 'faint' }) }));
parts.push(box(-145, 78, 58, 24, 4, 1, 'lo'), box(96, 80, 45, 20, 4, 1, 'lo'));
parts.push(k.faceTextSvg(k.topMatrix([101, 90], 5, projection), 'LABEL SORTER', { size: 3.5 }));
for (const x of [-153, 141]) for (const y of [-65, 52]) {
  parts.push(box(x - 3, y - 3, 18, 18, 4, 3), box(x, y, 12, 12, 7, 70));
}
parts.push(box(-153, -65, 306, 12, 77, 10));
for (const y of [-48, -31]) parts.push(box(-143, y, 286, 5, 4, 6));
for (const x of [-149, 141]) for (const y of [-49, -32]) parts.push(box(x, y, 8, 7, 4, 13));
parts.push(box(-134, -20, 268, 7, 4, .8, 'lo'));
const ticks = k.topTicks(-130, 130, 5, 5, -20, 4.8, [2, 4], projection, 'x');
parts.push(k.lineSvg(ticks.minor, { tone: 'faint' }), k.lineSvg(ticks.major, { tone: 'lo' }));
export const foundation = parts.join('');
export const beds = laneX.map(x => {
  const art = [box(x - 40, 4, 80, 92, 4, 3, 'lo')];
  art.push(box(x - 40, 4, 80, 4, 7, 5), box(x - 40, 8, 4, 88, 7, 5), box(x + 36, 8, 4, 88, 7, 5));
  for (const rx of [x - 24, x + 21]) art.push(box(rx, -25, 3, 121, 7, 3));
  for (const cx of [x - 16, x + 2]) {
    art.push(box(cx, 15, 14, 32, 7, 2), box(cx + 2, 17, 10, 28, 9, 2, 'hi'));
    art.push(k.lineSvg(k.planOutline({ x: cx + 4, y: 21, w: 6, d: 19, r: 1 }, 11, projection), { tone: 'faint' }));
  }
  for (const cx of combX(x)) art.push(box(cx, -8, 11, 12, 4, 20));
  art.push(box(x + 25, 70, 10, 12, 7, 8));
  return art.join('');
});
/** Engraved identity on each bed's tray floor, matching the node cards' names. */
export const bedNames = laneX.map((x, index) =>
  k.faceTextSvg(k.topMatrix([x - 12, 92], 7, projection), `node-${'abc'[index]}`, { size: 4 }));
export const combs = laneX.map(x => combX(x).map(cx => {
  let art = box(cx + 4, -5, 3, 6, 4, 20) + box(cx, -8, 11, 12, 24, 3, 'hi');
  // Feeler teeth leave the reader housing into the card bed; raising the comb
  // visibly releases that check, rather than depicting a taint barrier.
  for (let tooth = 0; tooth < 3; tooth++) art += box(cx + 1 + tooth * 3, 4, 2, 12, 24, 3, 'hi');
  return art;
}));
// Stationary visible-region clips hide each telescoping stem inside its sleeve.
export const combClips = laneX.map(x => combX(x).map(cx =>
  k.slabOf({ x: cx, y: -8, w: 11, d: 24, r: 0 }, 24, 20, projection, 2).fill));
export const scoreClips = laneX.map(x =>
  k.slabOf({ x: x + 26, y: 72, w: 8, d: 8, r: 0 }, 15, 25, projection, 2).fill);
export const plungers = laneX.map(x =>
  box(x + 28, 74, 4, 4, -5, 20) + box(x + 26, 72, 8, 8, 15, 3, 'hi'));
export const carriage = [
  box(-24, -49, 48, 24, 10, 3),
  box(-21, -48, 8, 5, 13, 3), box(13, -31, 8, 5, 13, 3),
  box(-15, -44, 30, 14, 16, 9, 'hi', true),
  box(-14, -43, 28, 12, 25, 1, 'hi'),
  box(-19, -39, 4, 5, 16, 3), box(15, -39, 4, 5, 16, 3),
  box(-10, -40, 3, 5, 26, 4), box(7, -40, 3, 5, 26, 4),
  box(-10, -40, 20, 5, 30, 2),
].join('');
