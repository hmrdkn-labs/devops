import * as k from '@/lib/anatomy/vendor/iso-kit';
import { initialCluster, initialConfig, rivalPod, type NodeName, type PodState } from './model';

/**
 * Concept → mechanism: two open racks, one per node, stand apart on the back of the bed. A Pod is a block
 * whose height is its CPU request (100 units per 1000m). Blocks stack on each rack, under a visible rim at
 * 1000m, so the open space between the stack top and the rim is the CPU not yet requested.
 * The queue tray is on the front-left, in scheduling order. A nominated Pod hovers over its node's cradle.
 * A removed Pod stands in the bin on the front-right.
 * Painter order: each rack is split into a back half (drawn before the blocks) and a front half (drawn after),
 * so the front posts and rim rails stay in front of the blocks inside the rack.
 */
const bed = { x: -150, y: -84, w: 300, d: 168, r: 8 };
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });

/** Rack centres on the plan. node-a is on the left and node-b on the right, far enough apart to read separately. */
export const rackAt: Record<NodeName, { x: number; y: number }> = {
  'node-a': { x: -84, y: -36 },
  'node-b': { x: 84, y: -36 },
};
const RACK_HALF = 15;
export const RACK_TOP = 104;
const CRADLE_PLATE_Z = 116;
export const CRADLE_Z = 119;

const fitPoints: k.Point3[] = [
  ...k.boxCorners(bed, -16, 0),
  ...Object.values(rackAt).flatMap(({ x, y }) =>
    k.boxCorners(rect(x - RACK_HALF, y - RACK_HALF, RACK_HALF * 2, RACK_HALF * 2, 2), 0, 190)),
];
export const P = k.fitProjection(fitPoints, 720, 430, { pad: 12, azimuth: 35, elevation: 32 });

/**
 * The canvas is cropped to what is drawn, so the object fills the card instead of floating in empty space.
 * Positions for HTML labels are converted with the same box.
 */
const screens = fitPoints.map((point) => k.iso(point, P));
const x0 = Math.min(...screens.map(([x]) => x)) - 16;
const y0 = Math.min(...screens.map(([, y]) => y)) - 16;
const x1 = Math.max(...screens.map(([x]) => x)) + 16;
const y1 = Math.max(...screens.map(([, y]) => y)) + 16;
export const VIEW = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
export const viewBox = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`;

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid') =>
  k.solidSvg(k.slabOf(plan, z, h, P, 6, 0.5), { tone });

/** Queue tray on the front-left: slot centres in scheduling order, head first. */
export const queueSlotX = [-134, -112, -90, -68];
export const QUEUE_Y = 45;
export const QUEUE_Z = 4;
const TRAY = rect(-146, 34, 88, 22, 2);

/** Removed Pods stand in the bin on the front-right: 3 columns, 2 rows. */
const binSlots: Array<[number, number]> = [[78, 42], [102, 42], [126, 42], [78, 62], [102, 62], [126, 62]];
export function binSlot(index: number): { x: number; y: number; z: number } {
  const [x, y] = binSlots[index % binSlots.length] ?? [78, 42];
  return { x, y, z: 3 };
}

/** Pod block geometry at the origin; each frame it is translated to its position. `lit` marks the Pod the reader follows. */
export function blockSvg(requestM: number, tone: k.Tone, lit = false): string {
  const h = requestM / 10;
  const plan = rect(-9, -9, 18, 18, 1.2);
  const lid = k.insetPlan(plan, 2.4);
  return [
    k.solidSvg(k.slabOf(plan, 0, h, P, 6, 0.5), { tone, lit }),
    k.lineSvg(k.planOutline(lid, h, P), { tone: 'faint' }),
    k.lineSvg(k.sideSeam(plan, h / 2, P, 6), { tone: 'faint' }),
    S(rect(-3.5, -1.5, 7, 3, 0.5), h, 2.5, 'lo'),
    k.dotsSvg(k.corners(plan, 2.4).map(([x, y]) => k.iso([x, y, h], P)), { size: 0.4, tone: 'lo' }),
  ].join('');
}

/** Tone and accent are fixed per Pod identity. State (queued, nominated, terminating) is shown by labels, not by paint. */
const paintOf: Record<string, { tone: k.Tone; lit: boolean }> = {
  'batch-1': { tone: 'mid', lit: false },
  'batch-2': { tone: 'mid', lit: false },
  'reports-1': { tone: 'mid', lit: false },
  'batch-3': { tone: 'mid', lit: false },
  'api-pod': { tone: 'hi', lit: true },
  'incident-high': { tone: 'hi', lit: false },
};

/** Every Pod name the figure can draw, in paint order. */
export const podPaint: readonly string[] = ['batch-1', 'batch-2', 'reports-1', 'batch-3', 'api-pod', 'incident-high'];

export const blockSvgs: Record<string, string> = Object.fromEntries(
  [...initialCluster(initialConfig).pods, rivalPod(0)].map((p: PodState) => {
    const paint = paintOf[p.name] ?? { tone: 'mid' as const, lit: false };
    return [p.name, blockSvg(p.requestM, paint.tone, paint.lit)];
  }),
);

/** An open rack: a foot, four posts up to the cradle plate, and a 1000m rim at the top of the stack. */
export function rackParts(node: NodeName): { back: string; front: string } {
  const { x: cx, y: cy } = rackAt[node];
  const centre = k.depthOf([cx, cy, 0], P);
  const back: string[] = [];
  const front: string[] = [];
  const place = (x: number, y: number, svg: string) => (k.depthOf([x, y, 0], P) > centre ? front : back).push(svg);

  const foot = rect(cx - RACK_HALF, cy - RACK_HALF, RACK_HALF * 2, RACK_HALF * 2, 2);
  back.push(S(foot, 0, 4, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(foot, 2), 4, P), { tone: 'faint' }));
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const px = cx + sx * 13 - 1.5;
    const py = cy + sy * 13 - 1.5;
    place(px + 1.5, py + 1.5, S(rect(px, py, 3, 3, 0.4), 4, CRADLE_PLATE_Z - 4));
  }
  // The rim is the 1000m line. It is a solid frame, so the free space under it reads at a glance.
  const rails: Array<[number, number, number, number]> = [
    [cx - 10, cy - 10, 20, 2],
    [cx - 10, cy + 8, 20, 2],
    [cx - 10, cy - 10, 2, 20],
    [cx + 8, cy - 10, 2, 20],
  ];
  for (const [x, y, w, d] of rails) place(x + w / 2, y + d / 2, S(rect(x, y, w, d, 0.3), RACK_TOP, 2, 'hi'));
  back.push(S(rect(cx - 13, cy - 13, 26, 26, 2), CRADLE_PLATE_Z, 3, 'mid'));
  return { back: back.join(''), front: front.join('') };
}

export const baseBack = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }));
  const plate = rect(-142, -79, 40, 10, 1);
  out.push(S(plate, 0, 1, 'lo'), k.faceTextSvg(k.topMatrix([-138, -75], 1.1, P), 'PRIORITY 05', { size: 3, tone: 'mid' }));
  return out.join('');
})();

export const trayBack = S(TRAY, 0, 4, 'lo');
export const trayFront = (() => {
  const parts = [
    S(rect(TRAY.x, TRAY.y, 3, TRAY.d), 4, 6, 'mid'),
    S(rect(TRAY.x + TRAY.w - 3, TRAY.y, 3, TRAY.d), 4, 6, 'mid'),
    S(rect(TRAY.x, TRAY.y + TRAY.d - 3, TRAY.w, 3), 4, 8, 'lo'),
  ];
  for (let i = 1; i < queueSlotX.length; i++) {
    const divider = ((queueSlotX[i - 1] ?? 0) + (queueSlotX[i] ?? 0)) / 2;
    parts.push(S(rect(divider - 0.8, TRAY.y, 1.6, TRAY.d), 4, 4, 'mid'));
  }
  return parts.join('');
})();

const BIN = rect(62, 30, 84, 46, 2);
export const binBack = [
  S(BIN, 0, 3, 'lo'),
  S(rect(62, 30, 2.5, 46), 3, 11, 'mid'),
  S(rect(62, 30, 84, 2.5), 3, 11, 'mid'),
].join('');
export const binFront = [
  S(rect(62, 73.5, 84, 2.5), 3, 11, 'mid'),
  S(rect(143.5, 30, 2.5, 46), 3, 11, 'mid'),
].join('');

export const move = (x: number, y: number, z: number) => k.translateAlong(P, [x, y, z]);
