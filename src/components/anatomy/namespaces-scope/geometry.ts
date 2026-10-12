import * as k from '@/lib/anatomy/vendor/iso-kit';
import { cardKey, namespacedIdentities, type NamespaceName } from './model';

/**
 * Concept → mechanism (written before geometry):
 * Namespace = a labelled pull-out drawer in a shared chest; the drawer holds namespaced index cards.
 * Cluster-scoped objects = cards in a separate tower with no drawers: they belong to no namespace.
 * Namespace deletion = the drawer's contents are cleared; the tower is untouched.
 * Network path = a cable across the front port rail from team-a's socket to team-b's socket; a lid covers
 * team-b's socket while a deny-ingress NetworkPolicy exists there. The chest's back is open: a namespace is not a wall.
 * Analogy limit: index cards are stored intent, not running Pods; the cable is a path fixture, not a packet trace.
 *
 * Purposeful parts: chest plinth, four feet, perimeter groove, corner screws; left and right side panels;
 * rear top rail (open back); divider; four bay runners; per drawer a tray (floor, two walls, back wall),
 * six slot plates, five blank identity cards, a front panel and handle; front port rail, two sockets, cable
 * and a team-b lid; tower plinth, feet, two side panels, two shelves, a label plate and two blank ClusterRole cards.
 * No text is engraved on the parts: at phone size engraved text is unreadable, so every name, phase and identity
 * is an HTML label beside the figure (see Figure.tsx).
 */
export const viewWidth = 760;
const viewHeight = 440;
const chest: k.Plan = { x: -132, y: -74, w: 264, d: 160, r: 6 };
const tower: k.Plan = { x: 150, y: -74, w: 76, d: 160, r: 4 };
export const projection = k.fitProjection(
  k.boxCorners({ x: -132, y: -74, w: 354, d: 160, r: 0 }, -12, 60),
  viewWidth, viewHeight, { pad: 30, azimuth: 40, elevation: 30 },
);
const P = projection;
const DRAWER_BOTTOM = 6;
/** Height a card or the lid starts above its resting place; motion lowers it into place. */
export const CARD_LIFT = 14;
/** How far a selected drawer slides toward the viewer. */
export const PULL_DISTANCE = 12;
export const DRAWER_WIDTH = 108;
/** Left edge of each drawer on the chest floor, in model units. */
export const drawerOrigin: Record<NamespaceName, number> = { 'team-a': -119, 'team-b': 11 };

const slab = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, h > 2 ? .6 : 0), { tone, lit });
const box = (x: number, y: number, w: number, d: number, z: number, h: number, tone: k.Tone = 'mid') =>
  slab({ x, y, w, d, r: Math.min(1.2, w / 3, d / 3) }, z, h, tone);
const line = (d: string, tone: k.LineTone = 'lo') => k.lineSvg(d, { tone });
const screws = (plan: k.Plan, z: number, inset = 3) => {
  const points = k.corners(plan, inset);
  return line(points.map(([x, y]) => k.ring(x, y, 1.1, z, P, 18)).join(''), 'faint') +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: .42 });
};
const feet = (plan: k.Plan) => k.corners(plan, 12)
  .sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P))
  .map(([x, y]) => k.solidSvg(k.cylinder(x, y, 5, -12, 4, P, 28), { tone: 'lo' })).join('');

/** One identity card: a thin, unlabelled index card. Its identity is the HTML chip in the status panel. */
function card(x: number, y: number, w: number, d: number, z: number): string {
  const plan: k.Plan = { x, y, w, d, r: 1 };
  return slab(plan, z, 2, 'hi') +
    line(k.planOutline(k.insetPlan(plan, 2), z + 2, P), 'faint');
}

export const chestBase = [
  `<path class="iso-halo" d="${k.haloOf(chest, -12, 6, P)}"/>`,
  feet(chest),
  slab(chest, -8, 8, 'lo'),
  line(k.planOutline(k.insetPlan(chest, 4), 0, P), 'faint'),
  screws(chest, 0, 9),
  // Open back: the rear top rail frames the chest, but no rear panel closes it.
  box(-126, -74, 252, 6, 40, 4, 'mid'),
  screws({ x: -126, y: -74, w: 252, d: 6, r: 1 }, 44, 10),
  box(-132, -74, 6, 160, 0, 44),
].join('');

export const divider = box(-4, -68, 8, 126, 0, 40, 'mid');
export const chestRight = box(126, -74, 6, 160, 0, 44, 'mid');
export const frontRail = box(-120, 70, 240, 6, 0, 4, 'lo');

export const towerBase = [
  `<path class="iso-halo" d="${k.haloOf(tower, -12, 6, P)}"/>`,
  feet(tower),
  slab(tower, -8, 8, 'lo'),
  box(tower.x, tower.y, 4, tower.d, 0, 60),
  box(154, -70, 68, 152, 26, 2, 'mid'),
  slab({ x: 160, y: -48, w: 56, d: 22, r: 1.5 }, 28, 1, 'lo'),
  box(154, -70, 68, 152, 52, 2, 'mid'),
  screws({ x: 154, y: -70, w: 68, d: 152, r: 1 }, 54, 5),
].join('');
export const towerRightSide = box(218, -74, 4, 160, 0, 60);

/** Cluster-scoped cards sit on the tower's upper shelf: there is no namespace slot. */
export const towerCards: Record<'web' | 'api', string> = {
  web: card(158, -50, 26, 36, 54),
  api: card(188, -50, 26, 36, 54),
};

/** Drawer card slots: column and row on the floor. */
const slotOf: Record<string, [number, number]> = {
  'Deployment/web': [0, 0],
  'Deployment/api': [1, 0],
  'Service/web': [2, 0],
  'Service/api': [0, 1],
  'NetworkPolicy/deny-ingress': [1, 1],
};
/** Card keys in painter order: the figure renders one ref per key in each drawer. */
export const cardKeys = namespacedIdentities.map(cardKey);

export interface DrawerParts {
  /** Floor, walls and empty-slot outline: painted before the cards. */
  tray: string;
  /** Front panel and handle: painted after the cards. */
  front: string;
  /** One card per Kind/name key. */
  cards: Record<string, string>;
}

function drawerParts(x0: number): DrawerParts {
  const w = DRAWER_WIDTH;
  const floor: k.Plan = { x: x0 + 3, y: -56, w: w - 6, d: 104, r: 1 };
  const slotPlan = (column: number, row: number): k.Plan => ({ x: x0 + 8 + column * 32, y: -44 + row * 40, w: 28, d: 30, r: 1 });
  const cards: Record<string, string> = {};
  for (const key of cardKeys) {
    const [column, row] = slotOf[key]!;
    const plan = slotPlan(column, row);
    cards[key] = card(plan.x, plan.y, plan.w, plan.d, DRAWER_BOTTOM + 2);
  }
  const empty = slotPlan(2, 1);
  const tray = [
    slab(floor, DRAWER_BOTTOM, 2, 'mid'),
    box(floor.x, floor.y, 3, floor.d, DRAWER_BOTTOM + 2, 16, 'mid'),
    box(floor.x + floor.w - 3, floor.y, 3, floor.d, DRAWER_BOTTOM + 2, 16, 'mid'),
    box(floor.x, floor.y, floor.w, 3, DRAWER_BOTTOM + 2, 16, 'mid'),
    line(k.planOutline(k.insetPlan(empty, 2), DRAWER_BOTTOM + 2, P), 'faint'),
  ].join('');
  const front = [
    box(x0 - 2, 48, w + 4, 6, DRAWER_BOTTOM, 24, 'hi'),
    line(k.planOutline(k.insetPlan({ x: x0 - 2, y: 48, w: w + 4, d: 6, r: 1 }, 1), DRAWER_BOTTOM + 24, P), 'faint'),
    box(x0 + w / 2 - 12, 54, 24, 3, DRAWER_BOTTOM + 14, 3, 'lo'),
  ].join('');
  return { tray, front, cards };
}

export const drawers: Record<NamespaceName, DrawerParts> = {
  'team-a': drawerParts(drawerOrigin['team-a']),
  'team-b': drawerParts(drawerOrigin['team-b']),
};

/** Runners on each bay wall; the drawer slides between them. */
export const bayRunners = [drawerOrigin['team-a'], drawerOrigin['team-b']].map((x0) =>
  box(x0 - 4, -62, 3, 118, 2, 4, 'lo') + box(x0 + DRAWER_WIDTH + 1, -62, 3, 118, 2, 4, 'lo'),
).join('');

const socketSvg = (x: number, y: number) => [
  k.solidSvg(k.cylinder(x, y, 3.5, 4, 4, P, 24), { tone: 'hi' }),
  k.dotsSvg([k.iso([x, y, 8], P)], { size: .5 }),
].join('');
export const socketA = socketSvg(-60, 73);
export const socketB = socketSvg(60, 73);
/** The cable runs across the port rail; its terminal dots land on the two sockets. */
export const cable = k.wireSvg(k.iso([-60, 73, 8], P), k.iso([60, 73, 8], P), { tone: 'lo', ends: 'both', size: 1.1 });
/** A lid over team-b's socket: present while a deny-ingress NetworkPolicy exists in team-b. */
export const lid = k.solidSvg(k.cylinder(60, 73, 4.5, 8, 4, P, 28), { tone: 'hi', lit: true }) +
  line(k.ring(60, 73, 4.5, 12, P, 28), 'faint');
