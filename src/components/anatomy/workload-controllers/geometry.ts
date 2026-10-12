import * as k from '@/lib/anatomy/vendor/iso-kit';
import type { NodeId } from './model';

/** Concept → mechanism: a controller bench. Node bays hold Pod cartridges in sockets; unassigned
 * cartridges wait in the tray; finished ones move to the shelf; the drawers hold claim blocks that
 * outlive their Pods; the knob on the console points at the controller that owns the applied kind.
 * Purposeful parts: base (feet, groove, screws, label), four node bays (plate, screws, label plate,
 * two socket cradles each), the unassigned tray (rail and four cradles), the finished shelf (plate and
 * twelve cradles), four claim drawers with handles, a console with a knob, five pointer marks and notch
 * dots, and a cartridge (body, lid, handle, lamp, identity face) per Pod.
 * Physical placement explains identity and ownership; it is not a claim about scheduler internals.
 */
const bed = { x: -160, y: -100, w: 330, d: 196, r: 8 };
const P = k.fitProjection(k.boxCorners(bed, -16, 80), 760, 470, { pad: 34, azimuth: 40, elevation: 34 });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone, lit });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};

const SOCKET_OFFSET = [-15, 15] as const;
const BAY_X: Record<NodeId, number> = { 'node-a': -104, 'node-b': -30, 'node-c': 44, 'node-d': 118 };
const TRAY_X = [-118, -90, -62, -34] as const;
const SHELF_COLUMN_X = [-120, -74, -28, 18, 64, 110] as const;
const SHELF_ROW_Y = [-88, -60] as const;
export const DRAWER_X = [66, 92, 118, 144] as const;
const TRAY_Y = 73;
const CRADLE_Z = 4;
/** Cartridge base sits on a cradle (top at z 5). Seated = 5, partly inserted = 13. */
const SEAT_Z = 5;
const PARTIAL_Z = 13;
const CONSOLE_TOP = 46;
const KNOB = { x: -150, y: -65, r: 8 };

const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  const label = rect(-150, 80, 70, 12, 2);
  out.push(S(label, 0, 1, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(label, 2), 1, P), { tone: 'faint' }),
    k.faceTextSvg(k.topMatrix([-145, 87], 1.1, P), 'CONTROLLERS', { size: 3, tone: 'mid' }));
  return out.join('');
})();

const shelf = (() => {
  const plate = rect(-138, -100, 268, 62, 2);
  const out = [S(plate, 0, 4, 'lo'), screws(plate, 4)];
  for (const y of SHELF_ROW_Y) {
    for (const x of SHELF_COLUMN_X) out.push(S(rect(x - 13, y - 11, 26, 22, 1), CRADLE_Z, 1, 'lo'));
  }
  return out.join('');
})();

const console_ = (() => {
  const body = rect(-158, -100, 16, 72, 2);
  const out = [S(body, 0, CONSOLE_TOP, 'mid'), k.lineSvg(k.planOutline(k.insetPlan(body, 2), CONSOLE_TOP, P), { tone: 'faint' })];
  out.push(k.solidSvg(k.cylinder(KNOB.x, KNOB.y, KNOB.r, CONSOLE_TOP, 6, P), { tone: 'hi' }));
  const notches = Array.from({ length: 5 }, (_, index) => {
    const angle = ((90 - index * 45) * Math.PI) / 180;
    return [KNOB.x + Math.cos(angle) * (KNOB.r + 3), KNOB.y + Math.sin(angle) * (KNOB.r + 3), CONSOLE_TOP] as [number, number, number];
  });
  out.push(k.dotsSvg(notches.map((point) => k.iso(point, P)), { size: 0.5, tone: 'mid' }));
  return out.join('');
})();

/** Five pointers, one per controller in kinds order; the figure shows only the owning one. */
export const pointers: string[] = Array.from({ length: 5 }, (_, index) => {
  const angle = ((90 - index * 45) * Math.PI) / 180;
  const from: k.Plane = [KNOB.x, KNOB.y];
  const to: k.Plane = [KNOB.x + Math.cos(angle) * (KNOB.r - 2), KNOB.y + Math.sin(angle) * (KNOB.r - 2)];
  return k.lineSvg(k.pathOf([k.iso([...from, CONSOLE_TOP + 6], P), k.iso([...to, CONSOLE_TOP + 6], P)]), { tone: 'lit' });
});

export const chassis = base + shelf + console_;

/** One bay per node. The figure dims it when the node is absent. */
export function bay(node: NodeId): string {
  const cx = BAY_X[node];
  const plate = rect(cx - 30, -32, 60, 62, 2);
  const out = [S(plate, 0, 4, 'mid'), k.lineSvg(k.planOutline(k.insetPlan(plate, 3), 4, P), { tone: 'faint' }), screws(plate, 4)];
  for (const dy of SOCKET_OFFSET) out.push(S(rect(cx - 13, dy - 11, 26, 22, 1), CRADLE_Z, 1, 'lo'));
  const label = rect(cx - 18, 34, 36, 9, 1);
  out.push(S(label, 0, 2, 'lo'), k.faceTextSvg(k.topMatrix([cx - 15, 37.5], 2, P), node, { size: 4.2, tone: 'mid' }));
  return out.join('');
}

export const tray = (() => {
  const rail = rect(-134, 58, 118, 28, 2);
  const out = [S(rail, 0, 4, 'lo'), screws(rail, 4)];
  for (const x of TRAY_X) out.push(S(rect(x - 13, TRAY_Y - 11, 26, 22, 1), CRADLE_Z, 1, 'lo'));
  return out.join('');
})();

export const drawers: string[] = DRAWER_X.map((x) => {
  const box = rect(x - 10, 62, 20, 22, 2);
  return S(rect(x - 11, 61, 22, 24, 1), 0, 1, 'faint') + S(box, 0, 8, 'mid') +
    k.lineSvg(k.sideSeam(box, 4, P, 4), { tone: 'faint' }) +
    S(rect(x - 4, 80, 8, 2, 1), 8, 1, 'lo');
});

/** A claim block (PVC) resting on its drawer. The figure shows it only while the claim is retained. */
export const claim = (x: number): string => S(rect(x - 6, 66, 12, 12, 1), 8, 4, 'hi');

/** One cartridge at the origin: body, lid and handle. Built once; moved with `move`. */
const cartridge = (() => {
  const body = rect(-11, -11, 22, 22, 2);
  const lid = rect(-11, -11, 22, 22, 2);
  return S(body, 0, 16, 'hi') + k.lineSvg(k.planOutline(k.insetPlan(lid, 2), 16, P), { tone: 'faint' }) +
    S(rect(-5, -2, 10, 4, 1), 16, 2, 'lo');
})();

const lamp = k.iso([0, 6, 16], P);
/** Cartridge art with its Pod identity on the lid and a lamp that is lit only when the Pod is Ready. */
export function cartridgeArt(uid: number, ready: boolean): string {
  return cartridge +
    k.faceTextSvg(k.topMatrix([-8, -7], 16, P), `p${uid}`, { size: 3.6, tone: 'hi' }) +
    `<circle class="wc-lamp" data-ready="${ready}" cx="${lamp[0]}" cy="${lamp[1]}" r="1.6"/>`;
}

export const move = (x: number, y: number, z: number) => k.translateAlong(P, [x, y, z]);
export const trayAt = (index: number): [number, number, number] => [TRAY_X[index] ?? TRAY_X[0], TRAY_Y, SEAT_Z];
export const bayAt = (node: NodeId, socket: number, seated: boolean): [number, number, number] =>
  [BAY_X[node], SOCKET_OFFSET[socket] ?? 0, seated ? SEAT_Z : PARTIAL_Z];
export const shelfAt = (index: number): [number, number, number] =>
  [SHELF_COLUMN_X[index % 6] ?? 0, SHELF_ROW_Y[Math.floor(index / 6)] ?? SHELF_ROW_Y[1], SEAT_Z];
