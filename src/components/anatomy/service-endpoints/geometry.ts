import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism: a Service is a fixed desk number (the ClusterIP plate). Three Pod booths stand
 * on a rail; each booth's lamp is its Ready condition and its label card is its match to the Service
 * selector. A roster board (EndpointSlice) lifts a slat only for booths that are Ready and matching.
 * A dial (kube-proxy rule table) on the desk routes through a bus that drops only to listed booths.
 * Purposeful parts: bedplate and feet, screws, groove, rail with end stops, roster board with cap, slats
 * and slot outlines, booth plinths, bodies, caps, seams, lamps, label slots and cards, the desk, its post
 * and plate, the rule dial with ticks and position rings, a client terminal, and the bus with drops.
 * Physical layout is explanatory: the real scheduler, kubelet and proxies are not in this fixture.
 */
const bed: k.Plan = { x: -150, y: -100, w: 300, d: 200, r: 8 };
export const P = k.fitProjection(k.boxCorners(bed, -16, 112), 720, 430, { pad: 30, azimuth: 35, elevation: 32 });

export const BOOTH_X = [-78, 0, 78] as const;
export const BUS_Y = 56;
export const DESK_BUS_X = -90;
export const DIAL = { x: -104, y: 70, r: 6.5 } as const;
export const DIAL_ANGLES = [200, 270, 340] as const;
export const DIAL_REST = 90;
export const PLATE_Z = 64;
/** Vertical slat travel: listed slats rise to SLAT_UP, unlisted slats sink by SLAT_SINK. */
export const SLAT_UP = 0;
export const SLAT_SINK = -18;
/** The label card leaves its slot by CARD_OUT when its label does not match the selector. */
export const CARD_OUT = 8;
export const CLIENT_TOP = [-138, 0, 30] as const;

const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone, lit });
const at = (x: number, y: number, z: number): k.Flat => k.iso([x, y, z], P);
const faceRect = (x0: number, x1: number, z0: number, z1: number, y: number) =>
  k.pathOf([at(x0, y, z0), at(x1, y, z0), at(x1, y, z1), at(x0, y, z1)], true);
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};
const byDepth = (points: k.Plane[]) =>
  [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(bed, 20))) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  return out.join('');
})();

export const rail = (() => {
  const beam = rect(-130, -34, 260, 4, 1);
  return [S(beam, 0, 3, 'mid'), S(rect(-134, -36, 5, 10, 1), 0, 8), S(rect(129, -36, 5, 10, 1), 0, 8),
    screws(beam, 3)].join('');
})();

const panel = rect(-110, -76, 220, 6, 1);
const SLOT_Y = -70;
/** Roster board: a standing panel whose front face carries one slot per booth. */
export const board = (() => {
  const cap = rect(-112, -78, 224, 8, 2);
  const out = [S(rect(-112, -80, 224, 14, 2), 0, 4, 'lo'), S(panel, 4, 60), k.lineSvg(k.sideSeam(panel, 34, P, 4), { tone: 'faint' }),
    S(cap, 64, 4, 'hi'), screws(cap, 68)];
  for (const x of BOOTH_X) out.push(k.lineSvg(faceRect(x - 16, x + 16, 12, 46, SLOT_Y), { tone: 'faint' }));
  return out.join('');
})();

/** A roster slat for one booth: the solid is built at the listed height and sinks when unlisted. */
export const slat = (x: number) => S(rect(x - 14, SLOT_Y, 28, 2, 0.8), 30, 12, 'hi');

export const booth = (x: number) => {
  const body = rect(x - 19, -19, 38, 38, 3);
  return [S(rect(x - 22, -22, 44, 44, 3), 0, 3, 'lo'), S(body, 3, 25, 'mid'),
    k.lineSvg(k.sideSeam(body, 16, P, 4), { tone: 'faint' }), S(rect(x - 17, -17, 34, 34, 2), 28, 2, 'hi'),
    screws(rect(x - 17, -17, 34, 34, 2), 30), k.lineSvg(faceRect(x - 12, x + 12, 10, 22, 19), { tone: 'faint' })].join('');
};

/** Ready lamp on each booth; its colour is set by CSS from the Ready condition. */
export const lamp = (x: number) => k.solidSvg(k.cylinder(x, 0, 4.5, 30, 5, P, 24), { tone: 'mid' });

/** The label card: inside its slot when the label matches the selector, lifted out of it when not. */
export const card = (x: number) => k.solidSvg(k.slabOf(rect(x - 10, 19, 20, 1.2, 0.3), 12, 8, P, 2, 0.3), { tone: 'hi' });

export const client = (() => {
  const body = rect(-146, -34, 16, 50, 2);
  return [S(body, 0, 26, 'mid'), S(rect(-144, -32, 12, 46, 1), 26, 2, 'hi'),
    k.lineSvg(k.lineOnTop([-142, -24], [-134, -24], 28, P), { tone: 'lo' }),
    k.lineSvg(k.lineOnTop([-142, -18], [-136, -18], 28, P), { tone: 'lo' }),
    S(rect(-132, -16, 4, 12, 1), 26, 4, 'lo')].join('');
})();

/** The Service desk: a plate on a post, which is the only address clients use. */
export const desk = (() => {
  const body = rect(-146, 48, 56, 40, 3);
  const top = rect(-144, 50, 52, 36, 2);
  return [S(body, 0, 24, 'mid'), k.lineSvg(k.sideSeam(body, 12, P, 4), { tone: 'faint' }), S(top, 24, 3, 'hi'),
    screws(top, 27), k.solidSvg(k.cylinder(-127, 53, 3, 27, 34, P, 20), { tone: 'mid' }),
    k.solidSvg(k.cylinder(-127, 53, 4.6, 27, 2.5, P, 20), { tone: 'lo' })].join('');
})();

export const plate = (() => {
  const p = rect(-146, 46, 38, 14, 2);
  return [S(p, 61, 3, 'hi', true), screws(p, PLATE_Z),
    k.lineSvg(k.lineOnTop([-140, 53], [-114, 53], PLATE_Z, P), { tone: 'lo' }),
    k.lineSvg(k.lineOnTop([-140, 50], [-122, 50], PLATE_Z, P), { tone: 'faint' })].join('');
})();

const dialAt = (angle: number, radius: number) => {
  const rad = (angle * Math.PI) / 180;
  return [DIAL.x + radius * Math.cos(rad), DIAL.y + radius * Math.sin(rad)] as const;
};

/** The rule dial: its pointer is rebuilt per frame from the in-flight destination. */
export const dial = (() => {
  const ticks = k.radialTicks(DIAL.x, DIAL.y, DIAL.r, 24, 6, 30, [0.8, 1.6], P);
  const marks = DIAL_ANGLES.map((angle) => {
    const [x, y] = dialAt(angle, 5);
    return k.lineSvg(k.ring(x, y, 0.9, 30, P, 12), { tone: 'mid' });
  });
  return [k.solidSvg(k.cylinder(DIAL.x, DIAL.y, 8, 27, 3, P, 36), { tone: 'mid' }),
    k.lineSvg(k.ring(DIAL.x, DIAL.y, 7.4, 30, P, 36), { tone: 'faint' }), k.lineSvg(ticks.minor, { tone: 'lo' }),
    k.lineSvg(ticks.major, { tone: 'mid' }), ...marks,
    k.solidSvg(k.cylinder(DIAL.x, DIAL.y, 2, 30, 2.5, P, 16), { tone: 'hi' })].join('');
})();

export const pointer = (angle: number, length: number) => {
  const [x, y] = dialAt(angle, length);
  return k.lineOnTop([DIAL.x, DIAL.y], [x, y], 31, P);
};

/** Bus from the desk side to the booth fronts; each drop is solid when its booth is listed, dotted otherwise. */
export const bus = k.wireSvg(at(DESK_BUS_X, BUS_Y, 1), at(BOOTH_X[2], BUS_Y, 1), { tone: 'lo' });
export const drop = (x: number, listed: boolean) =>
  k.wireSvg(at(x, BUS_Y, 1), at(x, 22, 1), { tone: listed ? 'mid' : 'faint', dotted: !listed });

/** Points of a request's route in screen space; listed routes reach a booth, unlisted routes stop at the dial. */
export function routeScreen(slot: number | null): k.Flat[] {
  const head = [at(...CLIENT_TOP), at(-127, 53, PLATE_Z + 2), at(DIAL.x, DIAL.y, 33)];
  if (slot === null) return head;
  const x = BOOTH_X[slot]!;
  return [...head, at(DESK_BUS_X, BUS_Y, 1), at(x, BUS_Y, 1), at(x, 22, 1)];
}

/** Floor ring around a booth; the figure shows it only for the booth the last request reached. */
export const servedRing = (x: number) => k.lineSvg(k.ring(x, 0, 36, 0.5, P, 48), { tone: 'hi' });

export const move = (z: number) => k.translateAlong(P, [0, 0, z]);
export const tagAt = (x: number, y: number, z: number) => {
  const [sx, sy] = at(x, y, z);
  return { left: `${(sx / 720) * 100}%`, top: `${(sy / 430) * 100}%` };
};
