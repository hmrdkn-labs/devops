import * as k from '@/lib/anatomy/vendor/iso-kit';

/**
 * Concept → mechanism (original art, not upstream example art).
 * A labelled filing press. The manifest card waits in a feeder tray. Apply slides the card under
 * the press head (the API server's validation gate); the head strikes only as a stamp, and the
 * spec drawer reads what was stored. The status drawer changes only when the controller syncs.
 * Pods sit in four sockets: Pending partly seated, Ready fully seated.
 * Analogy limits: nothing runs when a stamp lands; Pods are owned objects, not stored spec;
 * drawer notches are fixture counters, not real resourceVersion values.
 *
 * Purposeful parts (about 70 solids): base plate on four feet with halo, corner screws, groove;
 * feeder tray, two guide rails, card with a five-notch replica row and a two-notch selector row,
 * rule lines; anvil and lamp housing; two guide posts on collars with seam rings; crossbeam with
 * screws; press head with two sleeves, two arms, label plate and screws; record cabinet body,
 * top deck, spec and status drawers with their cards, notch rows and rule lines; Pod tray with four
 * sockets and four cartridges. Lamps, LEDs and identity labels are rendered by the figure.
 */
export const VIEW_W = 760;
export const VIEW_H = 452;
const base: k.Plan = { x: -200, y: -112, w: 400, d: 226, r: 10 };
const crossbeam: k.Plan = { x: -42, y: -44, w: 84, d: 16, r: 2 };
const body: k.Plan = { x: 100, y: -70, w: 96, d: 136, r: 4 };
/** Fit to the parts' real extents (footprint, press top, cabinet top), not to an empty tall box. */
const P = k.fitProjection([...k.boxCorners(base, 0, 14), ...k.boxCorners(crossbeam, 0, 126), ...k.boxCorners(body, 0, 56)], VIEW_W, VIEW_H, { pad: 24, azimuth: 52, elevation: 34 });
export const projection = P;

/** Feeder card centre to anvil centre, in world units. */
export const CARD_TRAVEL = 144;
/** Head drop from its raised position to the stamp position. */
export const HEAD_TRAVEL = 56;
export const HEAD_RAISED = 84;
/** Notch pitch on the feeder card and on the cabinet cards. */
export const FEEDER_PITCH = 12;
export const CABINET_PITCH = 14;
export const podX = [-36, -12, 12, 36] as const;

function box(plan: k.Plan, z: number, height: number, tone: k.Tone = 'mid', lit = false) {
  return k.solidSvg(k.slabOf(plan, z, height, P, 5, 0.7), { tone, lit });
}
function outline(plan: k.Plan, z: number, tone: k.Tone = 'lo') {
  return k.lineSvg(k.planOutline(plan, z, P), { tone });
}
function screws(plan: k.Plan, z: number, inset: number) {
  const points = k.corners(plan, inset);
  return points.map(([x, y]) => k.lineSvg(k.ring(x, y, 1.5, z, P, 14), { tone: 'lo' })).join('') +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.5 });
}
const notch = (x: number, y: number, w = 8): k.Plan => ({ x, y, w, d: 5, r: 1 });

export const chassis = [
  `<path class="iso-halo" d="${k.haloOf(base, 0, 4, P)}"/>`,
  ...k.corners(base, 22).map(([x, y]) => k.solidSvg(k.cylinder(x, y, 6, 0, 8, P, 24, 0.8), { tone: 'lo' })),
  box(base, 8, 6, 'lo'),
  outline(k.insetPlan(base, 6), 14, 'faint'),
  screws(base, 14, 12),
].join('');

const feederTray: k.Plan = { x: -186, y: -40, w: 84, d: 80, r: 4 };
export const feederTrayArt = [
  box(feederTray, 14, 4, 'mid'),
  outline(k.insetPlan(feederTray, 5), 18, 'faint'),
  box({ x: -186, y: -44, w: 84, d: 3, r: 1 }, 18, 6, 'mid'),
  box({ x: -186, y: 37, w: 84, d: 3, r: 1 }, 18, 6, 'mid'),
].join('');

/** The manifest card at rest. Its replica and selector tabs are moved by the figure. */
export const cardArt = [
  box({ x: -178, y: -28, w: 68, d: 56, r: 2 }, 18, 2, 'hi'),
  ...[0, 1, 2, 3, 4].map((i) => outline(notch(-170 + i * FEEDER_PITCH, -16), 20, 'lo')),
  ...[0, 1].map((j) => outline(notch(-170 + j * FEEDER_PITCH, 4), 20, 'lo')),
  k.lineSvg(k.lineOnTop([-170, -23], [-130, -23], 20.05, P), { tone: 'lo', free: true }),
  k.lineSvg(k.lineOnTop([-170, 12], [-132, 12], 20.05, P), { tone: 'lo', free: true }),
  k.lineSvg(k.lineOnTop([-170, 20], [-146, 20], 20.05, P), { tone: 'lo', free: true }),
].join('');
export const replicaTab = box(notch(-170, -16), 20, 1.2, 'hi', true);
export const selectorTab = box(notch(-170, 4), 20, 1.2, 'hi', true);

const anvil: k.Plan = { x: -36, y: -30, w: 72, d: 60, r: 3 };
const postX = [-30, 30];
export const pressStatic = [
  box(anvil, 14, 4, 'mid'),
  outline(k.insetPlan(anvil, 6), 18, 'faint'),
  box({ x: -14, y: 30, w: 28, d: 6, r: 1 }, 14, 8, 'mid'),
  ...postX.map((x) => k.solidSvg(k.cylinder(x, -36, 4.6, 14, 8, P, 24), { tone: 'mid' })),
  ...postX.map((x) => k.solidSvg(k.cylinder(x, -36, 3.2, 22, 94, P, 20), { tone: 'mid' })),
  ...postX.map((x) => k.lineSvg(k.sideArc(x, -36, 3.2, 60, P, 16), { tone: 'faint' })),
  box(crossbeam, 116, 10, 'hi'),
  screws(crossbeam, 126, 4),
].join('');

const head: k.Plan = { x: -36, y: -28, w: 72, d: 56, r: 3 };
/** Head art at its raised position; the figure drops the whole group by HEAD_TRAVEL. */
export const headArt = [
  box({ x: -34, y: -34, w: 8, d: 6, r: 1 }, HEAD_RAISED, 16, 'mid'),
  box({ x: 26, y: -34, w: 8, d: 6, r: 1 }, HEAD_RAISED, 16, 'mid'),
  ...postX.map((x) => k.solidSvg(k.cylinder(x, -36, 4.6, HEAD_RAISED, 16, P, 24), { tone: 'mid' })),
  box(head, HEAD_RAISED, 16, 'hi'),
  outline(k.insetPlan(head, 4), HEAD_RAISED + 16, 'faint'),
  box({ x: -22, y: -18, w: 44, d: 14, r: 1 }, 100, 1, 'lo'),
  outline({ x: -20, y: -16, w: 40, d: 10, r: 1 }, 101, 'lo'),
  screws(head, 100, 6),
].join('');

const specTray: k.Plan = { x: 104, y: -64, w: 88, d: 56, r: 3 };
const statusTray: k.Plan = { x: 104, y: 6, w: 88, d: 56, r: 3 };
const specCard: k.Plan = { x: 108, y: -60, w: 80, d: 48, r: 2 };
const statusCard: k.Plan = { x: 108, y: 10, w: 80, d: 48, r: 2 };
/** Cabinet notch rows: replica row (0–4), selector row (web/api) for the spec card; replica and ready rows (0–4) for status. */
export const cabinetArt = [
  box(body, 14, 32, 'mid'),
  outline(k.insetPlan(body, 5), 46, 'faint'),
  box({ x: 102, y: -68, w: 92, d: 132, r: 3 }, 46, 3, 'hi'),
  box(specTray, 49, 4, 'mid'),
  box(statusTray, 49, 4, 'mid'),
  box(specCard, 53, 2, 'hi'),
  box(statusCard, 53, 2, 'hi'),
  ...[0, 1, 2, 3, 4].map((i) => outline(notch(112 + i * CABINET_PITCH, -50, 10), 55, 'lo')),
  ...[0, 1].map((j) => outline(notch(112 + j * CABINET_PITCH, -40, 10), 55, 'lo')),
  ...[0, 1, 2, 3, 4].map((i) => outline(notch(112 + i * CABINET_PITCH, 18, 10), 55, 'lo')),
  ...[0, 1, 2, 3, 4].map((i) => outline(notch(112 + i * CABINET_PITCH, 30, 10), 55, 'lo')),
  outline(notch(112, 42, 10), 55, 'lo'),
].join('');
export const specReplicaTab = box(notch(112, -50, 10), 55, 1.2, 'hi', true);
export const specSelectorTab = box(notch(112, -40, 10), 55, 1.2, 'hi', true);
export const statusReplicaTab = box(notch(112, 18, 10), 55, 1.2, 'hi', true);
export const statusReadyTab = box(notch(112, 30, 10), 55, 1.2, 'hi', true);

const podTray: k.Plan = { x: -50, y: 66, w: 100, d: 28, r: 3 };
export const podTrayArt = [
  box(podTray, 14, 4, 'mid'),
  ...podX.map((x) => outline({ x: x - 8, y: 72, w: 16, d: 16, r: 2 }, 18, 'lo')),
].join('');
/** One cartridge at its socket. Seated position is z 18; the figure offsets it for Pending. */
export const podArt = podX.map((x) => box({ x: x - 6, y: 74, w: 12, d: 12, r: 2 }, 18, 12, 'hi') +
  outline({ x: x - 4, y: 76, w: 8, d: 8, r: 1.5 }, 30, 'lo'));
