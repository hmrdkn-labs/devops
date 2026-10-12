import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism: the HPA reads one metric, writes one number, and leaves placement to other controllers.
 * Dial: live CPU use of Ready Pods as a share of the request, against the 50% target and its ±10% band.
 * Carriage on the replica rail: spec.replicas, written only by the HPA. Stop plate: maxReplicas.
 * Node racks: nodes with four bays each; a Pod in a bay is assigned. Pending tray: unassigned Pods.
 * Lamp on a Pod: Ready. Load tube (front right): traffic outside the cluster.
 * On-machine text has two copies per label (long for wide figures, short for narrow ones); figure.css picks
 * the size tier so every label stays readable at its width and fits the object it names.
 * Positions are plan coordinates in world units; y grows toward the viewer.
 */
const bed = { x: -160, y: -98, w: 320, d: 196, r: 8 };
export const P = k.fitProjection(k.boxCorners(bed, -12, 52), 720, 440, { pad: 10, azimuth: 35, elevation: 32 });

/** The viewBox is the scene's own bounds on screen, so the bench fills the canvas. */
const screen = k.boxCorners(bed, -12, 52).map((point) => k.iso(point, P));
const minX = Math.min(...screen.map(([x]) => x));
const maxX = Math.max(...screen.map(([x]) => x));
const minY = Math.min(...screen.map(([, y]) => y));
const maxY = Math.max(...screen.map(([, y]) => y));
export const VIEW_BOX = `${minX - 6} ${minY - 6} ${maxX - minX + 12} ${maxY - minY + 12}`;

const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.5), { tone, lit });
const outline = (plan: k.Plan, z: number, tone: k.Tone = 'faint') => k.lineSvg(k.planOutline(plan, z, P), { tone });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};
/** On-machine text. The long copy shows on wide figures, the short copy on narrow ones (see figure.css tiers). */
const label = (at: string, long: string, short: string, tone: k.Tone = 'mid', anchor: 'start' | 'middle' | 'end' = 'middle') =>
  `<g class="as-long">${k.faceTextSvg(at, long, { size: 5.6, tone, anchor })}</g>` +
  `<g class="as-short">${k.faceTextSvg(at, short, { size: 8, tone, anchor })}</g>`;

/** Plan positions shared with the Figure's Pod placement. */
export const RACK_X = [-120, -40, 40, 120];
export const BAY_OFF = [-28.5, -9.5, 9.5, 28.5];
export const BAY_Y = -64;
export const BAY_Z = 6.8;
export const TRAY_Y = 34;
export const TRAY_Z = 3;
export const TRAY_SLOT_X = (index: number) => -58 + 26 * index;

export const bedSvg = [
  `<path class="iso-halo" d="${k.haloOf(bed, -12, 8, P)}"/>`,
  k.corners(bed, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))
    .map(([x, y]) => S(rect(x - 6, y - 6, 12, 12, 3), -12, 4, 'lo')).join(''),
  S(bed, -8, 8, 'lo'),
  outline(k.insetPlan(bed, 5), 0),
  screws(bed, 0),
  S(rect(-140, -95, 84, 8, 1), 0, 1, 'lo'),
].join('');

const shelf = (cx: number) => rect(cx - 36, -84, 72, 34, 2);

/** Back half of a node rack: shelf, bay pockets, back posts and back beam. */
export function rackBack(cx: number): string {
  const out = [
    S(shelf(cx), 0, 6, 'mid'),
    S(rect(cx - 36, -84, 4, 4), 6, 40, 'mid'),
    S(rect(cx + 32, -84, 4, 4), 6, 40, 'mid'),
    S(rect(cx - 36, -84, 72, 4), 40, 6, 'mid'),
  ];
  for (const offset of BAY_OFF) {
    const bx = cx + offset;
    out.push(S(rect(bx - 6.5, BAY_Y - 6.5, 13, 13, 0.5), 6, 0.8, 'lo'), outline(rect(bx - 7, BAY_Y - 7, 14, 14, 1), BAY_Z));
  }
  return out.join('');
}

/** Front half of a node rack: front posts and beam. Drawn after Pods, so it sits in front of them. */
export const rackFront = (cx: number) =>
  S(rect(cx - 36, -54, 4, 4), 6, 40, 'mid') + S(rect(cx + 32, -54, 4, 4), 6, 40, 'mid') + S(rect(cx - 36, -54, 72, 4), 40, 6, 'mid');

/** Identity and assigned-Pod count on the front beam of a provisioned node. */
export const rackTag = (cx: number, node: number, count: number) =>
  label(k.topMatrix([cx, -52], 46, P), `node-${node} · ${count} Pods`, `n${node} · ${count}`, 'hi');

/** Ghost floor for a node that has not been provisioned yet; hidden once the rack rises. */
export const rackGhost = (cx: number, node: number) =>
  S(shelf(cx), 0, 1.2, 'faint') + outline(k.insetPlan(shelf(cx), 2), 1.2, 'lo') +
  label(k.topMatrix([cx, -52], 1.2, P), `node-${node} · absent`, `n${node} · off`, 'lo');

export const trayBack = S(rect(-72, 22, 170, 28, 2), 0, 3, 'mid') + S(rect(-72, 22, 170, 3, 1), 3, 4, 'lo') +
  S(rect(-72, 22, 4, 28, 1), 3, 4, 'lo') + S(rect(94, 22, 4, 28, 1), 3, 4, 'lo');
export const trayFront = S(rect(-72, 47, 170, 3, 1), 0, 7, 'lo');
/** Pending count, set just below the tray's front lip. */
export const trayTag = (pending: number) =>
  label(k.topMatrix([-72, 62], 0, P), `pending · ${pending}`, `pending ${pending}`, 'mid', 'start');

const HOUSING = rect(-150, 22, 50, 46, 3);
const DIAL = { x: -125, y: 40, r: 12.5 };
/** Dial sweep: 0% at 10 o'clock, 100% at 12 o'clock, 200% at 2 o'clock; angles from 12 o'clock as iso-kit's radialTicks uses. */
const sweep = (percent: number) => ((-120 + (Math.min(200, Math.max(0, percent)) / 200) * 240) * Math.PI) / 180;
export const dialPoint = (percent: number, radius: number): k.Plane =>
  [DIAL.x + Math.sin(sweep(percent)) * radius, DIAL.y - Math.cos(sweep(percent)) * radius];
const DIAL_CENTER: k.Plane = [DIAL.x, DIAL.y];
const DIAL_Z = 29.6;

export const housingSvg = (() => {
  const ticks = k.radialTicks(DIAL.x, DIAL.y, DIAL.r, 20, 5, 29.1, [1, 2.2], P, sweep(0), sweep(200) - sweep(0));
  const band = Array.from({ length: 9 }, (_, index) => dialPoint(45 + index * 1.25, 9.5));
  return [
    S(HOUSING, 0, 26, 'mid'),
    outline(k.insetPlan(HOUSING, 2), 26),
    label(k.topMatrix([DIAL.x, 68.5], 26, P), 'target 50%', '50%', 'mid'),
    k.solidSvg(k.cylinder(DIAL.x, DIAL.y, 15, 26, 3, P, 40, 0.5), { tone: 'hi' }),
    k.lineSvg(ticks.minor, { tone: 'lo' }),
    k.lineSvg(ticks.major, { tone: 'mid' }),
    k.lineSvg(k.onTop(band, 29.2, P), { tone: 'lit' }),
    k.lineSvg(k.lineOnTop(dialPoint(50, 8), dialPoint(50, 12.5), 29.3, P), { tone: 'hi' }),
  ].join('');
})();
export const pivotSvg = k.dotsSvg([k.iso([DIAL.x, DIAL.y, 29.8], P)], { size: 1.6, tone: 'hi' });

export const LOAD = rect(96, 58, 48, 36, 3);
export const loadSvg = S(LOAD, 0, 10, 'mid') + S(rect(102, 62, 16, 28, 1), 10, 1.2, 'lo');
/** Traffic level: 2 units at 0 m, 26 at 1000 m; the tube's floor is at z 11.2. */
export const loadLevel = (traffic: number) => S(rect(105, 65, 10, 22, 0.5), 11.2, 2 + (traffic / 1000) * 24, 'hi', true);
export const loadTag = (traffic: number) =>
  label(k.topMatrix([143, 60], 10, P), `load ${traffic}m`, `${traffic}m`, 'hi', 'end');

const RAIL = rect(-150, 78, 100, 7, 1);
/** Replica v sits at x = railX(v); the rail reads 0 to 8. */
export const railX = (replicas: number) => -140 + 10 * replicas;
export const railSvg = (() => {
  const ticks = k.topTicks(-140, -60, 10, 2, 78, 4, [1.5, 3], P);
  const numbers = [0, 2, 4, 6, 8].map((value) => label(k.topMatrix([railX(value), 97], 4, P), String(value), String(value))).join('');
  return S(RAIL, 0, 4, 'mid') + k.lineSvg(ticks.minor, { tone: 'faint' }) + k.lineSvg(ticks.major, { tone: 'lo' }) + numbers;
})();
/** Carriage at rest x = railX(0); the Figure translates it by 10 units per replica. */
export const carriageBody = (replicas: number) =>
  S(rect(-143.5, 74, 7, 15, 1), 4, 10, 'hi', true) + label(k.topMatrix([-140, 81.5], 14, P), String(replicas), String(replicas), 'hi');
/** Max stop at rest x = railX(0); the Figure translates it by 10 units per maxReplicas step. */
export const stopBody = (maxReplicas: number) =>
  S(rect(-141, 70, 2, 22, 0.4), 4, 14, 'lo') + label(k.topMatrix([-140, 68.5], 18, P), String(maxReplicas), String(maxReplicas));
export const minStop = S(rect(railX(2) - 1, 70, 2, 22, 0.4), 4, 12, 'lo') + label(k.topMatrix([railX(2), 68.5], 16, P), '2', '2');

/** One Pod, built at its base centre so the Figure can place it with translateAlong. Name on the lid. */
export const podBody = (id: number) =>
  k.solidSvg(k.slabOf(rect(-6, -6, 12, 12, 1), 0, 9, P, 4, 0.5), { tone: 'hi' }) +
  label(k.topMatrix([0, 2.5], 9, P), `web-${id}`, `${id}`);
/** Lamp position on the lid corner; its fill follows Ready in the Figure. */
export const LAMP = k.iso([4.2, -4.2, 9], P);

/** Needle path from the dial centre; empty when there is no CPU target to read. */
export const needleD = (percent: number) => k.lineOnTop(DIAL_CENTER, dialPoint(percent, DIAL.r - 2), DIAL_Z, P);
