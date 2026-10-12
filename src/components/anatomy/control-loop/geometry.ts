import * as k from '@/lib/anatomy/vendor/iso-kit';

/**
 * Concept → mechanism (original art). A control loop is a balance comparator.
 * Left pan = spec.replicas (desired); right pan = observed Pod objects (live), coloured by Ready.
 * The beam tilts toward the heavier side, so a level beam means the loop has nothing to write.
 * API desk = stored objects: spec tray, status tray, Pod tray. The desk is the only thing the controller reaches.
 * Outbox = requests sent to the API. Node enclosure = containers, behind glass the controller never reaches.
 * Bell = watch hints: they wake the loop; they carry no state a pass needs.
 * Analogy limit: pans hold counts, not weights; the beam compares, it does not decide what the API does.
 */
const VIEW_W = 760;
const PAD = 12;
const base: k.Plan = { x: -262, y: -126, w: 524, d: 256, r: 12 };
const corners = k.boxCorners(base, -16, 150);
const measure = k.fitProjection(corners, VIEW_W, 4000, { pad: PAD, azimuth: 56, elevation: 37 });
const screenY = corners.map((point) => k.iso(point, measure)[1]);
/** View height that frames the machine's own bounds, so no empty canvas is drawn above or below it. */
export const VIEW_H = Math.ceil(Math.max(...screenY) - Math.min(...screenY) + 2 * PAD);
export const projection = k.fitProjection(corners, VIEW_W, VIEW_H, { pad: PAD, azimuth: 56, elevation: 37 });

/** Beam pivot height, swing per count of imbalance, and the pan rows at zero tilt. */
export const BEAM_Z = 124;
export const SWING = 7;
export const LEFT_X = -60;
export const RIGHT_X = 52;
const PAN_Y = -30;
const PLATE_TOP = 84;
const CHIP_X = [-30, -10, 10, 30];
const SOCKET_X = [133, 161, 189, 217];
const SLOT_X = [-226, -201, -176, -151];

function box(plan: k.Plan, z: number, height: number, tone: k.Tone = 'mid', lit = false, className?: string) {
  return k.solidSvg(k.slabOf(plan, z, height, projection, 5, 0.7), { tone, lit, className });
}
function cylinder(cx: number, cy: number, radius: number, z: number, height: number, tone: k.Tone = 'hi', className?: string) {
  return k.solidSvg(k.cylinder(cx, cy, radius, z, height, projection, 24, 0.5), { tone, className });
}
function bolts(plan: k.Plan, top: number, inset: number) {
  const points = k.corners(plan, inset);
  return points.map(([x, y]) => k.lineSvg(k.ring(x, y, 1.5, top, projection, 16), { tone: 'lo' })).join('') +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, top], projection)), { size: 0.6 });
}

/** Screen position of a world point, for labels that must sit on the object. */
export const screenAt = (x: number, y: number, z: number) => k.iso([x, y, z], projection);

// ---- Chassis and API desk -------------------------------------------------

export const chassis = [
  `<path class="iso-halo" d="${k.haloOf(base, -16, 3, projection)}"/>`,
  ...k.corners(base, 20).map(([x, y]) => box({ x: x - 7, y: y - 7, w: 14, d: 14, r: 3 }, -16, 8, 'lo')),
  box(base, -8, 8, 'lo'),
  k.lineSvg(k.planOutline(k.insetPlan(base, 5), 0, projection), { tone: 'lo' }),
  bolts(base, 0, 11),
].join('');

const desk: k.Plan = { x: -240, y: -108, w: 120, d: 150, r: 6 };
const trays = {
  spec: { x: -232, y: -100, w: 104, d: 40, r: 3 },
  status: { x: -232, y: -54, w: 104, d: 40, r: 3 },
  pods: { x: -232, y: -8, w: 104, d: 40, r: 3 },
} as const;

export const deskArt = [
  box(desk, 0, 40, 'mid'),
  bolts(desk, 40, 6),
  box(trays.spec, 40, 4, 'lo'),
  box(trays.status, 40, 4, 'lo'),
  box(trays.pods, 40, 4, 'lo'),
].join('');

/** Spec dial: its pointer is dynamic and reads spec.replicas on a 0–4 scale. */
const DIAL = { x: -196, y: -80, radius: 13 } as const;
const DIAL_TOP = 54;
export const dialArt = [
  cylinder(DIAL.x, DIAL.y, DIAL.radius, 44, 6, 'hi'),
  k.lineSvg(k.ring(DIAL.x, DIAL.y, DIAL.radius, 50, projection, 40), { tone: 'lo' }),
  cylinder(DIAL.x, DIAL.y, 3, 50, 4, 'lo'),
  k.dotsSvg([0, 1, 2, 3, 4].map((step) => {
    const angle = (-90 + step * 45) * (Math.PI / 180);
    return k.iso([DIAL.x + 10 * Math.cos(angle), DIAL.y + 10 * Math.sin(angle), DIAL_TOP], projection);
  }), { size: 0.7 }),
].join('');

/** Pointer from the dial centre, at the angle for the given spec.replicas value. */
export function dialPointer(value: number) {
  const angle = (-90 + value * 45) * (Math.PI / 180);
  const from = k.iso([DIAL.x, DIAL.y, DIAL_TOP], projection);
  const tip = k.iso([DIAL.x + 11 * Math.cos(angle), DIAL.y + 11 * Math.sin(angle), DIAL_TOP], projection);
  return `M${from[0].toFixed(2)} ${from[1].toFixed(2)}L${tip[0].toFixed(2)} ${tip[1].toFixed(2)}`;
}

/** Three counter blocks on the status tray; the lamp beside them is data-driven in the figure. */
export const counterArt = [-222, -204, -186].map((x) => box({ x, y: -46, w: 12, d: 20, r: 2 }, 44, 8, 'hi')).join('');
export const statusLampArt = cylinder(-160, -34, 5, 44, 6, 'hi');

// ---- Pod tray: one plate, a Created card and a Ready card per slot ---------

export const podSlots = SLOT_X.map((x, slot) => ({
  plate: box({ x, y: 0, w: 21, d: 26, r: 2 }, 44, 1, 'lo'),
  created: box({ x: x + 2, y: 4, w: 17, d: 18, r: 2 }, 45, 4, 'mid', false, 'loop-created'),
  ready: box({ x: x + 2, y: 4, w: 17, d: 18, r: 2 }, 45, 10, 'hi', false, 'loop-ready'),
  /** Slot numeral on the plate's front edge: ties the object to the name chip row below the figure. */
  numeral: screenAt(x + 10.5, 25, 45),
  index: slot + 1,
}));

// ---- Watch bell ------------------------------------------------------------

export const bellArt = [
  box({ x: -236, y: -106, w: 5, d: 5, r: 1 }, 40, 70, 'mid'),
  box({ x: -236, y: -106, w: 40, d: 5, r: 1 }, 106, 4, 'mid'),
  cylinder(-212, -103, 9, 90, 14, 'hi'),
  cylinder(-212, -103, 2, 82, 8, 'lo'),
].join('');
/** Two hint lamps: lamp n is lit when at least n hints are pending. */
export const hintLampArt = [cylinder(-228, -96, 3, 86, 6, 'hi'), cylinder(-228, -96, 3, 92, 6, 'hi')];

// ---- Controller balance ----------------------------------------------------

export const controllerBackArt = [
  box({ x: -114, y: -104, w: 218, d: 148, r: 3 }, 0, 6, 'lo'),
  box({ x: -110, y: -100, w: 6, d: 6, r: 1 }, 6, 140, 'mid'),
  box({ x: 94, y: -100, w: 6, d: 6, r: 1 }, 6, 140, 'mid'),
  box({ x: -110, y: -100, w: 210, d: 6, r: 1 }, 146, 4, 'mid'),
  box({ x: -110, y: -100, w: 6, d: 140, r: 1 }, 146, 4, 'mid'),
  box({ x: 94, y: -100, w: 6, d: 140, r: 1 }, 146, 4, 'mid'),
].join('');
export const controllerFrontArt = [
  box({ x: -110, y: 34, w: 6, d: 6, r: 1 }, 6, 140, 'mid'),
  box({ x: 94, y: 34, w: 6, d: 6, r: 1 }, 6, 140, 'mid'),
  box({ x: -110, y: 34, w: 210, d: 6, r: 1 }, 146, 4, 'mid'),
].join('');
export const columnArt = box({ x: -10, y: -36, w: 12, d: 12, r: 2 }, 6, 112, 'mid') +
  cylinder(-4, -30, 7, 118, 12, 'hi');

/** Beam end height. Positive tilt means desired exceeds observed, so the left (desired) end sinks. */
export const endZ = (side: 'left' | 'right', tilt: number) => BEAM_Z + (side === 'left' ? -1 : 1) * SWING * tilt;

export function beamPath(tilt: number) {
  const a = k.iso([LEFT_X, PAN_Y, endZ('left', tilt)], projection);
  const b = k.iso([RIGHT_X, PAN_Y, endZ('right', tilt)], projection);
  return `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
}

/** Hanger chain of length 40 from a beam end down to the top of its pan plate. */
export function chainPath(x: number, end: number) {
  const top = k.iso([x, PAN_Y, end], projection);
  const bottom = k.iso([x, PAN_Y, PLATE_TOP + end - BEAM_Z], projection);
  return `M${top[0].toFixed(2)} ${top[1].toFixed(2)}L${bottom[0].toFixed(2)} ${bottom[1].toFixed(2)}`;
}

/** Each pan is authored at its level position and moved along z by its beam end. */
export const panPlateArt = (centre: number) => box({ x: centre - 44, y: PAN_Y - 16, w: 88, d: 32, r: 4 }, 80, 4, 'mid');

/** Numeric tag under each pan's front edge, screen-anchored so it reads at any tilt. */
export function panTags(centre: number) {
  const label = screenAt(centre, PAN_Y + 22, 80);
  return { label, value: [label[0], label[1] + 30] as const };
}

/** Desired chips: flat accent discs, one per spec count. */
export const desiredChipArt = (centre: number, index: number) =>
  cylinder(centre + CHIP_X[index]!, PAN_Y, 6, 84, 3, 'hi', 'loop-desired');
/** Observed chips: tall discs, coloured by the Pod's Ready condition. */
export const observedChipArt = (centre: number, index: number, ready: boolean) =>
  cylinder(centre + CHIP_X[index]!, PAN_Y, 6, 84, ready ? 9 : 5, ready ? 'hi' : 'mid', ready ? 'loop-ready' : 'loop-created');

// ---- Outbox ---------------------------------------------------------------

export const outboxArt = box({ x: -60, y: 66, w: 96, d: 30, r: 3 }, 6, 6, 'mid') +
  box({ x: -40, y: 72, w: 28, d: 14, r: 1 }, 12, 1, 'hi');
export const outboxLampArt = cylinder(-88, 81, 4, 6, 7, 'hi');

// ---- Node enclosure and sealed containers ----------------------------------

const node: k.Plan = { x: 120, y: -108, w: 132, d: 176, r: 8 };
export const nodeBackArt = [
  box(node, 0, 8, 'mid'),
  box({ x: 120, y: -108, w: 132, d: 6, r: 2 }, 8, 120, 'mid'),
  box({ x: 120, y: -108, w: 6, d: 176, r: 2 }, 8, 120, 'mid'),
  box({ x: 246, y: -108, w: 6, d: 176, r: 2 }, 8, 120, 'mid'),
  box({ x: 120, y: -108, w: 132, d: 6, r: 2 }, 128, 4, 'mid'),
  box({ x: 120, y: -108, w: 6, d: 176, r: 2 }, 128, 4, 'mid'),
  box({ x: 246, y: -108, w: 6, d: 176, r: 2 }, 128, 4, 'mid'),
  box({ x: 120, y: 62, w: 6, d: 6, r: 1 }, 8, 124, 'mid'),
  box({ x: 246, y: 62, w: 6, d: 6, r: 1 }, 8, 124, 'mid'),
  /** Gauge: containers seated on node-b. */
  cylinder(184, -104, 11, 132, 4, 'mid'),
  k.lineSvg(k.ring(184, -104, 9.5, 136, projection, 32), { tone: 'lo' }),
  cylinder(184, -104, 2, 136, 2, 'hi'),
].join('');
export const glassArt = box({ x: 126, y: 68, w: 120, d: 2, r: 0 }, 8, 116, 'hi', false, 'loop-glass');

export const socketArt = SOCKET_X.map((x) => box({ x, y: -50, w: 22, d: 36, r: 2 }, 8, 2, 'lo'));
export const cartridgeSlots = SOCKET_X.map((x, slot) => ({
  art: box({ x: x + 3, y: -46, w: 16, d: 28, r: 2 }, 10, 26, 'hi', false, 'loop-ready'),
  numeral: screenAt(x + 11, -10, 10),
  index: slot + 1,
}));

/** Needle for containers seated on node-b: 0 at the left stop, 4 at the right. */
export function needlePath(value: number) {
  const angle = (-90 + value * 45) * (Math.PI / 180);
  const from = k.iso([184, -104, 138], projection);
  const tip = k.iso([184 + 8 * Math.cos(angle), -104 + 8 * Math.sin(angle), 138], projection);
  return `M${from[0].toFixed(2)} ${from[1].toFixed(2)}L${tip[0].toFixed(2)} ${tip[1].toFixed(2)}`;
}

export const translateZ = (z: number) => k.translateAlong(projection, [0, 0, z]);
