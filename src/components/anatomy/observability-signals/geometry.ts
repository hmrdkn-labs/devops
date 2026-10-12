import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism (original art, not upstream example art).
 * Instruments stand on a rear shelf above the Pod row, so none is hidden by a cabinet:
 * Events = a printer tape (keeps about one hour); Logs = a cassette holding one container instance's lines;
 * Metrics = a dial that reads the metrics backend's p99 for the window (not kubectl top);
 * Traces = a rack that keeps only sampled cards.
 * Probes = two lamps on each cabinet: R (readiness, drives the gate on the Service belt) and L (liveness, never moves a gate).
 * A gate is raised only while its Pod is Ready, so it stands for Service endpoint membership.
 * Analogy limit: the bench shows one fixture moment; each instrument keeps its own history.
 */
const base: k.Plan = { x: -270, y: -124, w: 540, d: 290, r: 10 };
export const projection = k.fitProjection(
  [...k.boxCorners(base, -6, 200), [0, 172, -6]],
  760, 470, { pad: 20, azimuth: 52, elevation: 34 },
);

/** Cabinet centres along x: Pods a, b and c, left to right. */
export const CABINET_X: readonly number[] = [-134, 0, 134];
const CABINET_FRONT_Y = 24;
const GATE_Y = 38;
const RAISED_Z = 62;
/** Gate bar drawn raised; a closed gate is the same bar translated down by GATE_TRAVEL. */
export const GATE_TRAVEL = -46;
const FACE_Y = -81.8;

const bayPlan = (x: number): k.Plan => ({ x: x - 50, y: -106, w: 100, d: 24, r: 4 });
const face = (x0: number, z0: number, x1: number, z1: number) =>
  k.pathOf(k.pointsAt([[x0, FACE_Y, z0], [x1, FACE_Y, z0], [x1, FACE_Y, z1], [x0, FACE_Y, z1]], projection), true);
const windowFace = (x0: number, z0: number, x1: number, z1: number, cls = 'obs-window') =>
  `<path class="${cls}" d="${face(x0, z0, x1, z1)}"/>`;
const faceLine = (x0: number, z0: number, x1: number, z1: number) =>
  k.lineSvg(k.pathOf(k.pointsAt([[x0, FACE_Y, z0], [x1, FACE_Y, z1]], projection)), { tone: 'lo' });
const faceCircle = (cx: number, cz: number, radius: number, steps = 40) => k.pathOf(
  k.pointsAt(Array.from({ length: steps }, (_, step) => {
    const angle = (step / steps) * Math.PI * 2;
    return [cx + radius * Math.cos(angle), FACE_Y, cz + radius * Math.sin(angle)] as [number, number, number];
  }), projection),
  true,
);

function box(plan: k.Plan, z: number, height: number, tone: k.Tone = 'mid', lit = false, seam?: number) {
  return k.solidSvg(k.slabOf(plan, z, height, projection, 5, 0.7), {
    tone, lit, inner: seam === undefined ? '' : k.lineSvg(k.sideSeam(plan, seam, projection, 5), { tone: 'faint' }),
  });
}

function bolts(plan: k.Plan, top: number, inset: number) {
  const points = k.corners(plan, inset);
  return points.map(([x, y]) => k.lineSvg(k.ring(x, y, 1.5, top, projection, 16), { tone: 'lo' })).join('') +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, top], projection)), { size: 0.6 });
}

const feet = k.corners(base, 12);
export const chassis = [
  `<path class="iso-halo" d="${k.haloOf(base, -6, 2, projection)}"/>`,
  ...feet.map(([x, y]) => box({ x: x - 6, y: y - 6, w: 12, d: 12, r: 2 }, -6, 6, 'lo')),
  box(base, 0, 8, 'lo'),
  k.lineSvg(k.planOutline(k.insetPlan(base, 6), 8, projection), { tone: 'lo' }),
  bolts(base, 8, 12),
].join('');

/** Rear shelf on two uprights; the four instruments stand on it, above the cabinets. */
export const shelf = [
  box({ x: -262, y: -110, w: 524, d: 28, r: 3 }, 96, 8, 'mid'),
  box({ x: -262, y: -108, w: 8, d: 12, r: 1 }, 8, 88, 'lo'),
  box({ x: 254, y: -108, w: 8, d: 12, r: 1 }, 8, 88, 'lo'),
].join('');

/** Instrument bays. Each bay's front face is a plane at FACE_Y; faces are drawn in front of their body. */
const BAY_X = { events: -200, metrics: -67, traces: 67, logs: 200 } as const;
const bayBody = (x: number) => box(bayPlan(x), 104, 60, 'mid') +
  k.lineSvg(k.planOutline(k.insetPlan(bayPlan(x), 4), 164, projection), { tone: 'lo' });

const eventsFace = windowFace(BAY_X.events - 22, 150, BAY_X.events + 22, 154) +
  k.lineSvg(k.lineOnTop([BAY_X.events - 26, -82], [BAY_X.events + 26, -82], 164, projection), { tone: 'lo' });
/** Printer tape: one row per retained event. Expired rows leave the tape. */
export function eventsTape(rows: number): string {
  const bottom = 148 - (4 + 8 * rows);
  const sheet = `<path class="obs-tape" d="${face(BAY_X.events - 20, bottom, BAY_X.events + 20, 148)}"/>`;
  const lines = Array.from({ length: rows }, (_, index) => faceLine(BAY_X.events - 15, 144 - index * 8, BAY_X.events + 15, 144 - index * 8)).join('');
  return sheet + lines;
}

/** Metrics dial: a face with 11 ticks and a needle driven by the backend's p99. */
export const DIAL = { cx: BAY_X.metrics, z: 130, radius: 22 };
const dialTicks = Array.from({ length: 11 }, (_, index) => {
  const angle = ((-135 + index * 27) * Math.PI) / 180;
  const major = index % 5 === 0;
  const inner = major ? 16.5 : 18.5;
  const sx = Math.sin(angle);
  const cz = Math.cos(angle);
  return faceLine(DIAL.cx + inner * sx, DIAL.z + inner * cz, DIAL.cx + 20 * sx, DIAL.z + 20 * cz);
}).join('');
const metricsFace = `<path class="obs-dial" d="${faceCircle(DIAL.cx, DIAL.z, DIAL.radius)}"/>` +
  k.lineSvg(faceCircle(DIAL.cx, DIAL.z, DIAL.radius), { tone: 'mid' }) + dialTicks +
  k.dotsSvg(k.pointsAt([[DIAL.cx, FACE_Y, DIAL.z]], projection), { size: 1, tone: 'hi' });

/** Needle from the pivot; angle in degrees from 12 o'clock (see model dialAngle). */
export function needleArt(angle: number): string {
  const radians = (angle * Math.PI) / 180;
  return k.pathOf(k.pointsAt([
    [DIAL.cx, FACE_Y, DIAL.z],
    [DIAL.cx + 18 * Math.sin(radians), FACE_Y, DIAL.z + 18 * Math.cos(radians)],
  ], projection));
}

/** Traces rack: three sampled-card slots; a card stands in a slot only when a sampled trace exists. */
const RACK_SLOTS = [-24, 0, 24].map((offset) => BAY_X.traces + offset);
const tracesFace = RACK_SLOTS.map((x) => windowFace(x - 8, 112, x + 8, 152)).join('');
export function cardsFace(count: number): string {
  return RACK_SLOTS.slice(0, count).map((x) => `<path class="obs-card" d="${face(x - 6, 116, x + 6, 148)}"/>`).join('');
}

/** Logs cassette: a window with two reels, and one row per retained log line of the subject instance. */
const logsFace = windowFace(BAY_X.logs - 22, 110, BAY_X.logs + 22, 152) +
  `<path class="obs-reel" d="${faceCircle(BAY_X.logs - 10, 140, 6, 24)}"/>` +
  `<path class="obs-reel" d="${faceCircle(BAY_X.logs + 10, 140, 6, 24)}"/>` +
  faceLine(BAY_X.logs - 10, 140, BAY_X.logs + 10, 140);
export function logLines(count: number): string {
  return Array.from({ length: Math.min(count, 5) }, (_, index) =>
    faceLine(BAY_X.logs - 17, 113 + index * 4.5, BAY_X.logs + 17, 113 + index * 4.5)).join('');
}

export interface Bay {
  signal: 'events' | 'metrics' | 'traces' | 'logs';
  title: string;
  sub: string;
  /** Screen anchor above the bay: the title block is drawn above it. */
  label: [number, number];
  body: string;
  face: string;
}
const bayLabel = (x: number): [number, number] => {
  const [sx, sy] = k.iso([x, -94, 176], projection);
  return [sx, sy];
};
export const BAYS: Bay[] = [
  { signal: 'events', title: 'EVENTS', sub: 'control plane', label: bayLabel(BAY_X.events), body: bayBody(BAY_X.events), face: eventsFace },
  { signal: 'metrics', title: 'METRICS', sub: 'backend p99', label: bayLabel(BAY_X.metrics), body: bayBody(BAY_X.metrics), face: metricsFace },
  { signal: 'traces', title: 'TRACES', sub: 'sampled', label: bayLabel(BAY_X.traces), body: bayBody(BAY_X.traces), face: tracesFace },
  { signal: 'logs', title: 'LOGS', sub: 'subject stdout', label: bayLabel(BAY_X.logs), body: bayBody(BAY_X.logs), face: logsFace },
];

/** Cabinets: body, seam, lid, bolts and the front process window. */
const cabinetPlan = (cx: number): k.Plan => ({ x: cx - 52, y: -68, w: 104, d: 92, r: 6 });
const lidPlan = (cx: number): k.Plan => ({ x: cx - 48, y: -64, w: 96, d: 84, r: 4 });
export const cabinetArt = CABINET_X.map((cx) => [
  box(cabinetPlan(cx), 8, 74, 'mid', false, 52),
  box(lidPlan(cx), 82, 4, 'lo'),
  bolts(lidPlan(cx), 86, 5),
  `<path class="obs-window" d="${k.pathOf(k.pointsAt([[cx - 34, CABINET_FRONT_Y + 0.2, 34], [cx + 34, CABINET_FRONT_Y + 0.2, 34], [cx + 34, CABINET_FRONT_Y + 0.2, 58], [cx - 34, CABINET_FRONT_Y + 0.2, 58]], projection), true)}"/>`,
].join(''));

/** Probe lamps on the lid: R readiness on the left, L liveness on the right. */
export const lampArt = CABINET_X.map((cx) => ({
  ready: k.solidSvg(k.cylinder(cx - 22, 46, 5, 86, 5, projection, 20, 0.5), { tone: 'hi' }),
  live: k.solidSvg(k.cylinder(cx + 22, 46, 5, 86, 5, projection, 20, 0.5), { tone: 'hi' }),
}));
export const lampLabels = CABINET_X.map((cx) => ({
  ready: k.iso([cx - 22, 46, 100], projection),
  live: k.iso([cx + 22, 46, 100], projection),
}));

/** Gate posts stand in front of each cabinet on the belt; the bar slides between them. */
export const gateFrame = CABINET_X.map((cx) => [
  box({ x: cx - 46, y: GATE_Y - 2, w: 4, d: 4, r: 1 }, 8, 66, 'hi'),
  box({ x: cx + 42, y: GATE_Y - 2, w: 4, d: 4, r: 1 }, 8, 66, 'hi'),
].join(''));
export const gateBar = CABINET_X.map((cx) => box({ x: cx - 44, y: GATE_Y - 2, w: 88, d: 4, r: 1 }, RAISED_Z, 4, 'mid'));

/** Pod name plate on the bench front, under each cabinet's gate lane. */
export const podLabels = CABINET_X.map((cx) => k.iso([cx, 112, 8], projection));
/** Probes caption on the platform strip, under the pod-name row, one line naming the lamps. */
export const probesCaption = k.iso([0, 152, 8], projection);

/** Service belt: requests travel left to right toward the gates. */
const belt: k.Plan = { x: -262, y: 54, w: 524, d: 26, r: 3 };
export const service = [
  box(belt, 8, 6, 'mid'),
  k.lineSvg(k.lineOnTop([-256, 58], [256, 58], 14.2, projection), { tone: 'lo' }),
  k.lineSvg(k.lineOnTop([-256, 76], [256, 76], 14.2, projection), { tone: 'lo' }),
  k.lineSvg(k.lineOnTop([-256, 67], [256, 67], 14.2, projection), { tone: 'faint', dotted: true }),
  ...[-258, 258].map((x) => k.solidSvg(k.cylinder(x, 67, 4, 14, 12, projection, 20, 0.6), { tone: 'mid' })),
].join('');

/** Request cards on the belt in front of an open gate: one per 10 req/s, at most four. */
export function requestsArt(cx: number, rps: number): string {
  const count = Math.min(4, Math.round(rps / 10));
  if (count === 0) return '';
  const points = Array.from({ length: count }, (_, index) => [cx - 14 + index * 9, 64, 15.4] as [number, number, number]);
  return k.dotsSvg(k.pointsAt(points, projection), { size: 0.9, tone: 'hi' });
}
