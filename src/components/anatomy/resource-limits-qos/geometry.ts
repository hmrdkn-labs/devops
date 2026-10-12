import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism: one namespace and one node as a working machine.
 * An admission lane runs left to right through three gates: the LimitRange gate, the ResourceQuota gate and the
 * scheduler's fit gate. A blade lifts only for a check that passed; a closed gate stops the Pod cartridge.
 * The node platform holds three resident cartridges and the candidate. The tank's fill is node memory in use,
 * and its ring is the eviction line. Evicted cartridges slide to the tray. Physical order is explanatory:
 * the real admission and scheduler order are the order of the gates.
 * Each cartridge is drawn once at the plan origin and moved by translation; the Figure owns every position.
 */
export const bed = { x: -150, y: -100, w: 300, d: 200, r: 8 };
/** Canvas in SVG units, cropped to the machine: the bed footprint is about 1.64:1, so 720x440 leaves 20 units of margin top and bottom. Phones give the SVG a fixed 280px box and letterbox it. */
export const W = 720;
export const H = 440;
/** Fit to the bed footprint and its base height only: the machine's parts all project inside it, so no empty band above. */
export const P = k.fitProjection(k.boxCorners(bed, -16, 0), W, H, { pad: 20, azimuth: 35, elevation: 32 });

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone, lit });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};

export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  return out.join('');
})();

export const LANE_Y = -36;
export const GATE_X = { limitrange: -80, quota: -50, fit: -20 } as const;
/** Plan positions of the Pod cartridge on the lane, on the node platform, and in the tray. */
export const START = { x: -122, y: LANE_Y };
export const STOP = { limitrange: GATE_X.limitrange - 16, quota: GATE_X.quota - 16, fit: GATE_X.fit - 16, end: 60 } as const;
export const BAY = { candidate: { x: 60, y: LANE_Y }, checkout: { x: 104, y: -74 }, search: { x: 104, y: 4 }, batch: { x: 104, y: 52 } } as const;
export const NODE_PLATE = rect(26, -96, 118, 190, 4);
export const TANK = { x: 134, y: 78, radius: 12, height: 110 } as const;

export const lane = (() => {
  const out: string[] = [];
  for (const dy of [-18, 14]) {
    const rail = rect(-132, LANE_Y + dy, 166, 4);
    out.push(S(rail, 0, 3), screws(rail, 3));
  }
  for (const x of [-134, 30]) out.push(S(rect(x, LANE_Y - 21, 4, 42), 0, 8), screws(rect(x, LANE_Y - 21, 4, 42), 8));
  return out.join('');
})();

export const platform = (() => {
  const out: string[] = [S(NODE_PLATE, 0, 3, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(NODE_PLATE, 4), 3, P), { tone: 'faint' }), screws(NODE_PLATE, 3)];
  for (const bay of Object.values(BAY)) {
    out.push(k.lineSvg(k.planOutline(rect(bay.x - 18, bay.y - 14, 36, 28, 2), 3.1, P), { tone: 'mid' }));
  }
  return out.join('');
})();

export const tray = (() => {
  const plate = rect(-140, 58, 86, 40, 3);
  return S(plate, 0, 3, 'lo') + k.lineSvg(k.planOutline(k.insetPlan(plate, 4), 3.1, P), { tone: 'faint' }) + screws(plate, 3);
})();

/** Shell of the memory tank; the fill and the eviction ring are drawn from state in the Figure. */
export const tankShell = k.solidSvg(k.cylinder(TANK.x, TANK.y, TANK.radius, 3, TANK.height, P, 36, 0.5), { tone: 'lo' });
export const tankFill = (height: number) => (height <= 0 ? '' : k.solidSvg(k.cylinder(TANK.x, TANK.y, TANK.radius - 2.5, 3, height, P, 36, 0.3), { tone: 'hi' }));
export const tankRing = (z: number) => k.lineSvg(k.ring(TANK.x, TANK.y, TANK.radius + 1.5, z, P, 40), { tone: 'red' });

/** A gate frame: two posts and a bridge. The blade is drawn separately so it can lift. */
export function gate(x: number): string {
  const out: string[] = [];
  out.push(S(rect(x - 3, LANE_Y - 26, 6, 6), 0, 26), S(rect(x - 3, LANE_Y + 20, 6, 6), 0, 26));
  out.push(S(rect(x - 3, LANE_Y - 26, 6, 52), 26, 5, 'hi'));
  return out.join('');
}

/** A check's blade. It sits below the bridge while closed and rises above it while open. */
export function blade(x: number): string {
  const plan = rect(x - 2, LANE_Y - 20, 4, 40);
  return S(plan, 3, 16, 'hi') + k.lineSvg(k.sideSeam(plan, 19, P, 4), { tone: 'faint' });
}

export const LIFT = 28;

/** The Pod cartridge, drawn at the plan origin and moved by translation. Its base sits on z = 3. */
export const cartridge = (() => {
  const out = [S(rect(-14, -11, 28, 22, 2), 3, 16, 'hi', true)];
  out.push(S(rect(-12, -9, 24, 18, 2), 19, 3, 'hi'));
  out.push(S(rect(-8, -5, 16, 10, 1), 22, 1, 'lo'));
  for (const x of [-16, 13]) out.push(S(rect(x, -8, 3, 16, 1), 3, 2, 'lo'));
  out.push(k.lineSvg(k.planOutline(rect(-12, -9, 24, 18, 2), 22, P), { tone: 'faint' }));
  return out.join('');
})();

export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);
