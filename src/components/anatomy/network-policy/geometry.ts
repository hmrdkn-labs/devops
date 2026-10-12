import * as k from '@/lib/anatomy/vendor/iso-kit';
import type { Hatch, PodId } from './model';

/**
 * Concept -> mechanism: a bench of four Pod cells under a gantry. Each cell has two roof hatches.
 * The egress (out) hatch is a flush plate with a chevron pointing away from its Pod. The ingress
 * (in) hatch is a plate with a dotted socket outline and a chevron pointing into its Pod. A lowered
 * lid is an armed policy checking traffic: accent edges and a latch. A raised lid is open, or stored
 * but not enforced: dashed edges mark the stored case. One overhead carrier runs one probe, the
 * cartridge, from the source's out hatch to the destination's in hatch, past the Service tower when
 * the probe is Service-addressed. A dropped probe stops above the gate that dropped it and a flat
 * cross on the roof marks that hatch. Solids: bench and feet, four cells (foot, body, seam, screws,
 * name plate), eight hatches (plate, hole, lid, chevron, latch or socket), the Service tower, two
 * gantry posts, a rail with a position ruler, a trolley, a hanger, a cartridge and its port tag.
 * About 80 purposeful parts; no decorative cables.
 */
const BENCH = { x: -172, y: -68, w: 344, d: 136, r: 8 };
const LAYOUT: Record<PodId, number> = { client: -120, 'web-a': -40, 'web-b': 40, db: 120 };
const TOWER_X = -80;
const ROOF = 30;
/** Top of a closed lid. */
const LID_TOP = 34;
/** How far a raised lid lifts. */
export const LID_LIFT = 12;
/** Cartridge bottom while travelling overhead. */
const HOVER = 46;
/** Cartridge bottom hovering just above a closed lid. */
const STOP = 40;
/** Cartridge bottom seated in an open hatch. */
const SEAT = 30;
export const CARTRIDGE_H = 14;
const LID = 13;
const HOLE = 12;
const PLATE = 18;
const TROLLEY_BOTTOM = 62;
const RAIL_BOTTOM = 72;
const RAIL_TOP = 76;

export const HEIGHT = { hover: HOVER, stop: STOP, seat: SEAT } as const;

/** Points that bound everything drawn. The viewBox is cropped to their projection, so the object fills the frame. */
const FRAME: k.Point3[] = [
  ...k.boxCorners(BENCH, -16, 0),
  ...[-168, 168].flatMap((x) => [-4, 4].flatMap((y) => [0, RAIL_TOP].map((z): k.Point3 => [x, y, z]))),
  [TOWER_X, 0, 44],
];
const P = k.fitProjection(FRAME, 720, 460, { pad: 0, azimuth: 35, elevation: 32 });

const framed = FRAME.map((point) => k.iso(point, P));
const framedX = framed.map(([x]) => x);
const framedY = framed.map(([, y]) => y);
const MARGIN = 28;
export const VIEW = {
  x: Math.min(...framedX) - MARGIN,
  y: Math.min(...framedY) - MARGIN,
  width: Math.max(...framedX) - Math.min(...framedX) + 2 * MARGIN,
  height: Math.max(...framedY) - Math.min(...framedY) + 2 * MARGIN,
};

const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, .6), { tone, lit });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, .7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: .45 });
};

/** Hatch centre x. Out hatches sit on the +x half of a cell, in hatches on the -x half. */
function hatchX(hatch: Hatch): number {
  const side = hatch.endsWith('-out') ? 'out' : 'in';
  const pod = hatch.slice(0, hatch.length - side.length - 1) as PodId;
  return LAYOUT[pod] + (side === 'out' ? 11 : -11);
}

export const stationX = (station: Hatch | 'tower'): number => (station === 'tower' ? TOWER_X : hatchX(station));

export const benchSvg = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(BENCH, -14, 10, P)}"/>`];
  const feet = k.corners(BENCH, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(BENCH, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(BENCH, 5), 0, P), { tone: 'faint' }), screws(BENCH, 0));
  return out.join('');
})();

export function cellSvg(pod: PodId): string {
  const x = LAYOUT[pod];
  const plan = rect(x - 22, -22, 44, 44, 4);
  const foot = rect(x - 26, -26, 52, 52, 5);
  return [
    S(foot, 0, 2, 'lo'),
    S(plan, 2, ROOF - 2, 'mid'),
    k.lineSvg(k.planOutline(k.insetPlan(plan, 4), ROOF, P), { tone: 'faint' }),
    screws(k.insetPlan(plan, 2), ROOF),
    S(rect(x - 9, 22, 18, 2, .6), 6, 6, 'lo'),
  ].join('');
}

/** Flush hatch plate with its opening. An ingress plate also carries a dotted socket outline. */
export function rimSvg(hatch: Hatch): string {
  const hx = hatchX(hatch);
  const plate = rect(hx - PLATE / 2, -PLATE / 2, PLATE, PLATE, 2);
  const hole = rect(hx - HOLE / 2, -HOLE / 2, HOLE, HOLE, 1);
  const socket = hatch.endsWith('-in') ? k.lineSvg(k.planOutline(k.insetPlan(plate, 2), ROOF + .6, P), { tone: 'mid', dotted: true }) : '';
  return S(plate, ROOF, .6, 'lo') + `<path class="np-hole" d="${k.planOutline(hole, ROOF + .6, P)}"/>` + socket;
}

/** The lid at its closed position. The Figure moves it with transform. Egress chevrons point out; ingress chevrons point in. */
export function lidSvg(hatch: Hatch): string {
  const hx = hatchX(hatch);
  const lid = rect(hx - LID / 2, -LID / 2, LID, LID, 1.5);
  const tip = hatch.endsWith('-out') ? 2.4 : -2.4;
  const chevron = k.lineSvg(k.onTop([[hx - tip, -2.4], [hx + tip, 0], [hx - tip, 2.4]], LID_TOP + .05, P), { tone: 'mid' });
  const latch = `<g class="np-latch">${k.solidSvg(k.slabOf(rect(hx - 2.5, 2.5, 5, 3, .8), LID_TOP, 2, P, 4, .3), { tone: 'hi' })}</g>`;
  return S(lid, ROOF, LID_TOP - ROOF, 'hi') + chevron + latch;
}

/** A flat cross on the roof in front of a hatch, with its gate name. The Figure shows it only where a probe stopped. */
export function stopMarkSvg(hatch: Hatch): string {
  const hx = hatchX(hatch);
  const z = ROOF + .8;
  const cross = k.lineSvg(k.lineOnTop([hx - 3, 13], [hx + 3, 19], z, P) + k.lineOnTop([hx + 3, 13], [hx - 3, 19], z, P), { tone: 'red' });
  const [tx, ty] = k.iso([hx - 5, 15, ROOF], P);
  const name = hatch.endsWith('-out') ? 'egress' : 'ingress';
  return cross + `<text class="np-id np-stop-label" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="end">${name}</text>`;
}

const anchorOf = (pod: PodId): k.Flat => k.iso([LAYOUT[pod], 52, 0], P);
/** Identity labels sit on the bench in front of each cell, in clear space. */
export const podLabels: Record<PodId, k.Flat> = { client: anchorOf('client'), 'web-a': anchorOf('web-a'), 'web-b': anchorOf('web-b'), db: anchorOf('db') };

export const towerSvg = (() => {
  const plinth = rect(TOWER_X - 8, -8, 16, 16, 2);
  const column = rect(TOWER_X - 6, -6, 12, 12, 2);
  const cap = rect(TOWER_X - 10, -10, 20, 20, 2.5);
  return [
    S(plinth, 0, 3, 'lo'),
    S(column, 3, 37, 'mid'),
    S(cap, 40, 3, 'hi'),
    k.lineSvg(k.planOutline(k.insetPlan(cap, 2), 43, P), { tone: 'faint' }),
    screws(cap, 43),
  ].join('');
})();

const post = (x: number) => S(rect(x - 4, -4, 8, 8, 1.5), 0, RAIL_BOTTOM, 'mid') + S(rect(x - 6, -6, 12, 12, 2), 0, 3, 'lo');
export const backPostSvg = post(-164);
export const frontPostSvg = post(164);
export const railSvg = S(rect(-168, -4, 336, 8, 2), RAIL_BOTTOM, RAIL_TOP - RAIL_BOTTOM, 'hi') +
  k.lineSvg(k.planOutline(k.insetPlan(rect(-168, -4, 336, 8, 2), 1.5), RAIL_TOP, P), { tone: 'faint' });

/** Position ruler on the rail's front edge: a minor tick every 20 units, a major tick every 40. */
export const rulerSvg = (() => {
  const ticks = k.topTicks(-160, 160, 20, 2, 4, RAIL_TOP, [1.6, 3.2], P);
  return k.lineSvg(ticks.minor, { tone: 'faint' }) + k.lineSvg(ticks.major, { tone: 'mid' });
})();

/** Built at x=0; moved with transform. */
export const trolleySvg = S(rect(-7, -7, 14, 14, 2), TROLLEY_BOTTOM, RAIL_BOTTOM - TROLLEY_BOTTOM, 'hi') +
  k.dotsSvg([k.iso([0, 0, TROLLEY_BOTTOM], P)], { size: .8, tone: 'hi' });

/** Built at x=0, bottom at z=0; moved with transform. */
export const cartridgeSvg = S(rect(-8, -8, 16, 16, 2), 0, CARTRIDGE_H - 2, 'hi', true) +
  S(rect(-7, -7, 14, 14, 1.5), CARTRIDGE_H - 2, 2, 'hi') +
  k.lineSvg(k.planOutline(k.insetPlan(rect(-7, -7, 14, 14, 1.5), 1.5), CARTRIDGE_H, P), { tone: 'faint' });

/** Port tag beside the cartridge's top, in the cartridge's own frame, upright so the port reads at any carrier position. */
const cartridgeTop = k.iso([0, 0, CARTRIDGE_H], P);
export const PORT_TAG = {
  x: cartridgeTop[0] + 12, y: cartridgeTop[1] - 24, width: 30, height: 14,
  textX: cartridgeTop[0] + 27, textY: cartridgeTop[1] - 13.5,
};

export const hangerPath = (z: number) => k.segment([0, 0, TROLLEY_BOTTOM], [0, 0, z], P);

export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);
