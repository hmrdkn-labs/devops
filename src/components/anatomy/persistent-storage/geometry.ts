import * as k from '@/lib/anatomy/vendor/iso-kit';
import type { CartPlace, Zone } from './model';

/**
 * Storage apparatus on a bench, read left to right: a claim desk, two zone lanes (rear = zone a,
 * front = zone b), a provisioner post and head for each zone bay, and a shelf for Released volumes.
 * Each lane carries a node platform, a gate that lifts when the bound volume is reachable from that
 * zone, a cable that exists only while a Pod is mounted, and a bay where the volume sits.
 * Identity text is not drawn here: Figure.tsx places HTML tags beside the parts they name.
 */
const bed = { x: -150, y: -96, w: 300, d: 192, r: 8 };

export const LANE_Y: Record<Zone, number> = { a: -44, b: 40 };
/** World x positions along the lanes. The Pod cart is 30 units long, centred on these. */
export const X = { park: -104, stop: -59, gate: -40, platform: 40, bay: 100, shelf: 139 } as const;
/** Head height above the bay: rest clears the strongbox, low sits just above its lid. */
export const HEAD = { x: 100, rest: 50, low: 25 } as const;
export const LIFT = 38;
export const CART_Z = 4;
/** Cart centre x for each place a Pod can wait at: parking, the stop before a closed gate, or the node platform. */
export const PLACE_X: Record<CartPlace, number> = { parking: X.park, gate: X.stop, platform: X.platform };

const gateBox = { x: X.gate - 4, y: LANE_Y.a - 26, w: 8, d: LANE_Y.b + 26 - (LANE_Y.a - 26), r: 0 };
/** Each zone's provisioner post sits just behind its bay, so the head slides in front of the post and never blocks the bay. */
const postPlan = (zone: Zone) => ({ x: HEAD.x - 4, y: LANE_Y[zone] - 18, w: 8, d: 4, r: 0 });
const POST_TOP = 66;

/** Every part's extent in world units. The projection and the SVG view are both computed from these, so no blank band is drawn. */
const drawn: k.Point3[] = [
  ...k.boxCorners(bed, -16, 10),
  ...k.boxCorners(gateBox, 0, 72),
  ...(['a', 'b'] as Zone[]).flatMap((zone) => k.boxCorners(postPlan(zone), 0, POST_TOP)),
];

export const P = k.fitProjection(drawn, 720, 460, { pad: 26, azimuth: 35, elevation: 32 });

/** The SVG view is the projected bounds of the drawn parts plus a small margin. */
export const view = (() => {
  const flat = drawn.map((point) => k.iso(point, P));
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const margin = 6;
  const x = Math.min(...xs) - margin;
  const y = Math.min(...ys) - margin;
  return { x, y, w: Math.max(...xs) + margin - x, h: Math.max(...ys) + margin - y };
})();
export const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

/** A world point as a percentage of the stage, so HTML tags sit beside the part they name. */
export function locate(point: [number, number, number]): { left: number; top: number } {
  const [x, y] = k.iso(point, P);
  return { left: ((x - view.x) / view.w) * 100, top: ((y - view.y) / view.h) * 100 };
}

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, .6), { tone, lit });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, .7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: .45 });
};
const pillar = (cx: number, cy: number, radius: number, z: number, height: number, tone: k.Tone = 'lo') =>
  k.solidSvg(k.cylinder(cx, cy, radius, z, height, P, 20, .3), { tone });

export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);

export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  return out.join('');
})();

/** Claim desk: parts that exist all the time. */
export const desk = (() => {
  const plan = rect(-146, -12, 22, 24, 2);
  return S(plan, 0, 10, 'lo') + k.lineSvg(k.planOutline(k.insetPlan(plan, 3), 10, P), { tone: 'faint' }) + screws(plan, 10);
})();

/** The claim slip on the desk, lit so it reads against the desk. Drawn only while the PVC exists. */
export const slip = (() => S(rect(-142, -8, 14, 16, 1), 10, 3, 'hi', true))();

/** The provisioner post of one zone: a fixed column behind its bay that the head slides on. */
export function postSvg(zone: Zone): string {
  const post = postPlan(zone);
  return pillar(post.x + post.w / 2, post.y + post.d / 2, 2.6, 0, POST_TOP, 'mid');
}

/** The provisioner head of one zone, built at rest over its bay and moved vertically by transform. */
export function headSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const block = rect(HEAD.x - 9, y - 7, 18, 14, 2);
  const arm = rect(HEAD.x - 2.5, y - 18, 5, 11, 1);
  return S(block, 0, 14, 'hi') + S(arm, 0, 6, 'mid');
}

/** Zone plate at each lane's rail start; its identity is a HTML tag. */
export const zonePlate = (zone: Zone): string => S(rect(-146, LANE_Y[zone] - 7, 16, 14, 2), 0, 1.2, 'lo');

export function floorSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const out: string[] = [];
  for (const offset of [-17, 13]) {
    const rail = rect(-126, y + offset, 250, 4);
    out.push(S(rail, 0, 4), screws(rail, 4));
  }
  for (const x of [-130, 123]) out.push(S(rect(x, y - 21, 5, 42), 0, 8), screws(rect(x, y - 21, 5, 42), 8));
  const strip = rect(-120, y + 23, 236, 6);
  const ticks = k.topTicks(-116, 116, 8, 5, y + 23, 1, [2, 4], P);
  out.push(S(strip, 0, 1, 'lo'), k.lineSvg(ticks.minor, { tone: 'faint' }), k.lineSvg(ticks.major, { tone: 'lo' }));
  return out.join('');
}

/** Node platform with its plug and the cable's landing. */
export function platformSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const plat = rect(X.platform - 15, y - 14, 30, 28, 2);
  return S(plat, CART_Z, 8, 'mid') + k.lineSvg(k.planOutline(k.insetPlan(plat, 3), CART_Z + 8, P), { tone: 'faint' }) +
    pillar(X.platform + 15, y, 2.6, CART_Z + 2, 6);
}

/** The Pod cart, built at world x = 0 and moved along its lane by transform. */
export function cartSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const body = rect(-15, y - 11, 30, 22, 2);
  return S(body, CART_Z, 10, 'hi', true) + k.lineSvg(k.planOutline(k.insetPlan(body, 2), CART_Z + 10, P), { tone: 'faint' }) +
    S(rect(-10, y + 9, 20, 3, 1), CART_Z + 10, 4, 'lo');
}

/** Gate posts and top bridge; the blade rides inside them. */
export function gateFrame(zone: Zone): string {
  const y = LANE_Y[zone];
  const out: string[] = [];
  for (const yy of [y - 26, y + 22]) out.push(S(rect(X.gate - 4, yy, 8, 4, 1), 4, 66, 'mid'));
  out.push(S(rect(X.gate - 4, y - 26, 8, 52, 1), 68, 4, 'mid'));
  return out.join('');
}

/** The lift blade; built at rest (closed, blocking the lane) and moved by transform. */
export function bladeSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const plan = rect(X.gate - 3, y - 21, 6, 42, 1);
  return S(plan, 10, 16, 'hi') + k.lineSvg(k.sideSeam(plan, 18, P, 4), { tone: 'faint' });
}

/** Bay floor where a bound volume sits; Released volumes go to the shelf. */
export function baySvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const bay = rect(X.bay - 16, y - 16, 32, 32, 2);
  return S(bay, 0, 3, 'lo') + k.lineSvg(k.planOutline(k.insetPlan(bay, 3), 3, P), { tone: 'faint' }) + screws(k.insetPlan(bay, 3), 3);
}

/** The volume: a strongbox with its reclaim switch on the front face. */
export function boxSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const body = rect(X.bay - 13, y - 10, 26, 20, 2);
  return S(body, 3, 16, 'hi', false) + k.lineSvg(k.planOutline(k.insetPlan(body, 3), 19, P), { tone: 'faint' }) +
    pillar(X.bay + 13, y, 1.6, 9, 6, 'lo');
}

/** Reclaim switch on the strongbox's front face: lower for Delete, higher for Retain. */
export function switchSvg(zone: Zone, position: 'Delete' | 'Retain'): string {
  const y = LANE_Y[zone];
  const z = position === 'Delete' ? 5 : 11;
  return S(rect(X.bay - 4, y + 10, 8, 3, 1), z, 4, 'hi');
}

/** A cable from the volume's face to the node plug while a Pod is mounted. */
export function cableSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  const from = k.iso([X.bay - 13, y, 11], P);
  const to = k.iso([X.platform + 15, y, 11], P);
  return k.wireSvg(from, to, { via: [k.iso([(X.bay + X.platform) / 2, y, 16], P)], tone: 'lo', size: 1.1 });
}

/** The shelf for Released volumes. */
export function shelfSvg(zone: Zone): string {
  const y = LANE_Y[zone];
  return S(rect(X.shelf - 10, y - 12, 20, 24, 2), 0, 3, 'lo');
}

/** One Released volume on its zone's shelf; index 0 is the bottom box. */
export function shelfItemSvg(zone: Zone, index: number): string {
  const y = LANE_Y[zone];
  const z = 3 + index * 6;
  return S(rect(X.shelf - 7, y - 8, 14, 16, 1), z, 6, 'mid');
}
