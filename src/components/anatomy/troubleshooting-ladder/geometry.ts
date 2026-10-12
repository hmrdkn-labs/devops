import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Static world layout. One unit is about one millimetre of the fixture; the figure is not to scale. */
export const bench = { x: -190, y: -120, w: 380, d: 216, r: 6 };

/** A view box in SVG units. The wide frame keeps label gutters; the narrow frame crops to the object and its short labels. */
export interface Frame { x: number; y: number; w: number; h: number }
export const FRAME: Frame = { x: 0, y: 0, w: 760, h: 470 };
export const FRAME_NARROW: Frame = { x: 150, y: 30, w: 430, h: 390 };
const GUTTER = { left: 104, right: 150, top: 40, bottom: 56 } as const;
/** The object is fitted into the wide frame minus the gutters, then shifted so its box sits inside them. */
const fitted = k.fitProjection(k.boxCorners(bench, -20, 160), FRAME.w - GUTTER.left - GUTTER.right, FRAME.h - GUTTER.top - GUTTER.bottom, { pad: 0, azimuth: 35, elevation: 30 });
export const P: k.Projection = { ...fitted, origin: [fitted.origin[0] + GUTTER.left, fitted.origin[1] + GUTTER.top] };

/** Screen position as a percent of the given frame, for HTML labels that sit beside world-space parts. */
export function screenAt(anchor: k.Point3, frame: Frame = FRAME) {
  const [sx, sy] = k.iso(anchor, P);
  return { left: `${((sx - frame.x) / frame.w) * 100}%`, top: `${((sy - frame.y) / frame.h) * 100}%` };
}

/** Height of each rung of the ladder, bottom first. Read rung i moves the probe carriage to RUNG_Z[i]. */
export const RUNG_Z = [26, 48, 70, 92, 114, 136] as const;
/** Cell lift when its container is not running. A Ready-false but running container stays seated. */
export const CELL_LIFT = 18;
/** Gate blade lift when the Service selector matches the Pod labels. */
export const BLADE_LIFT = 44;
/** Puck travel from before the gate into the Service tray. */
export const PUCK_TRAVEL = 72;

/** Lamp of rung i sits just left of the ladder upright, at the height of the rung. */
export const lampAt = (index: number): k.Point3 => [-172, -101, (RUNG_Z[index] ?? RUNG_Z[0]) + 2];

/**
 * Label anchors in the world, each in a gutter next to its part, with a leader from the part.
 * pod: right of the housing post, above the bench. container: in front of the bench, below the housing.
 * node: left of the socket. service: in front of the tray, below the bench edge.
 */
export const LABEL = {
  pod: [41, -41, 150] as k.Point3,
  container: [-6, 136, 0] as k.Point3,
  node: [-74, 66, 2] as k.Point3,
  service: [140, 70, 0] as k.Point3,
} as const;

type Plan = k.Plan;
const rect = (x: number, y: number, w: number, d: number, r = 1): Plan => ({ x, y, w, d, r });
const slab = (plan: Plan, z: number, height: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, height, P, 4, 0.6), { tone, lit });
const screws = (plan: Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};

export const haloArt = `<path class="iso-halo" d="${k.haloOf(bench, -16, 10, P)}"/>`;

export const benchArt = (() => {
  const feet = k.corners(bench, 14).map(([x, y]) => slab(rect(x - 5, y - 5, 10, 10, 2), -16, 6, 'lo')).join('');
  return feet +
    slab(bench, -10, 10, 'lo') +
    k.lineSvg(k.planOutline(k.insetPlan(bench, 5), 0, P), { tone: 'faint' }) +
    screws(bench, 0);
})();

/** The ladder frame: two uprights and six rungs. */
export const ladderArt = (() => {
  const uprights = slab(rect(-160, -104, 6, 6), 0, 152, 'mid') + slab(rect(-122, -104, 6, 6), 0, 152, 'mid');
  const rungs = RUNG_Z.map((z) => slab(rect(-160, -104, 44, 5, 1), z, 4, 'mid')).join('');
  return uprights + rungs;
})();

/** Read lamps sit on the outside of each rung, left of the uprights. */
export const rungLamps = RUNG_Z.map((_, index) => k.iso(lampAt(index), P));

/** The probe carriage that rides the uprights. Its translation is the rung it last read. */
export const sledArt = slab(rect(-152, -90, 36, 9, 2), 0, 6, 'hi', true) +
  k.lineSvg(k.ring(-146, -86, 1.2, 6, P, 12), { tone: 'lo' });

export const housingBackArt = (() => {
  const floor = slab(rect(-40, -44, 90, 84, 3), 0, 6, 'lo');
  const seat = slab(rect(-22, -24, 48, 44, 2), 6, 2, 'lo');
  const back = slab(rect(-40, -44, 90, 6, 1), 6, 70, 'mid');
  const left = slab(rect(-40, -44, 6, 84, 1), 6, 70, 'mid');
  const post = slab(rect(38, -44, 6, 6, 1), 6, 80, 'hi');
  return floor + seat + back + left + post;
})();

/** The container cell. Its translation is the lift: raised when the container is not running. */
export const cellArt = slab(rect(-18, -20, 40, 36, 2), 12, 34, 'hi');

export const housingFrontArt = (() => {
  const front = slab(rect(-40, 34, 90, 6, 1), 6, 34, 'mid');
  const right = slab(rect(44, -44, 6, 84, 1), 6, 34, 'mid');
  return front + right + screws(rect(-40, -44, 90, 84, 3), 0);
})();

/** Ready lamp on the back-right post. Lit when the Pod is Ready, not when it is running. */
export const readyLampAt = k.iso([41, -41, 84], P);

/** Node socket on the bench in front of the housing. The connector is seated only when spec.nodeName is set. */
export const socketArt = slab(rect(-36, 46, 22, 10, 1), 0, 2, 'lo');
export const connectorArt = slab(rect(-32, 49, 12, 5, 1), 2, 6, 'mid');

export const trayFloorArt = slab(rect(100, -40, 72, 80, 3), 0, 4, 'lo');
export const trayBackArt = slab(rect(100, -40, 72, 4, 1), 4, 14, 'mid') + slab(rect(100, -40, 4, 80, 1), 4, 14, 'mid');
export const trayFrontArt = slab(rect(100, 36, 72, 4, 1), 4, 14, 'mid') + slab(rect(168, -40, 4, 80, 1), 4, 14, 'mid');

/** The endpoint puck. It rests before the gate and moves into the tray only when the EndpointSlice lists the Pod. */
export const puckArt = k.solidSvg(k.cylinder(0, 0, 7, 0, 6, P, 24, 0.3), { tone: 'hi' });
export const puckRestX = 62;
export const puckInTrayX = puckRestX + PUCK_TRAVEL;

/** Gate: two posts and a blade. The blade lifts when the selector matches. */
export const gatePostsArt = slab(rect(71, -36, 4, 4, 0.5), 0, 40, 'mid') + slab(rect(71, 32, 4, 4, 0.5), 0, 40, 'mid');
export const bladeArt = slab(rect(73, -32, 3, 64, 0.5), 0, 40, 'hi');

/** Leaders from each part to its label gutter. Drawn last so they read above the parts. */
export const leaderArt = (() => {
  const from: Record<'pod' | 'container' | 'node' | 'service', [k.Point3, k.Point3]> = {
    pod: [[41, -41, 84], LABEL.pod],
    container: [[-6, 40, 40], LABEL.container],
    node: [[-30, 51, 4], LABEL.node],
    service: [[140, 40, 4], LABEL.service],
  };
  return Object.values(from).map(([a, b]) => k.lineSvg(k.segment(a, b, P), { tone: 'lo' })).join('') +
    Object.values(from).map(([, b]) => k.dotsSvg([k.iso(b, P)], { size: 0.7, tone: 'mid' })).join('');
})();
