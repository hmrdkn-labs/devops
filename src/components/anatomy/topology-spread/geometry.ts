import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism: a two-zone spread bench. Each zone is a tray holding two node bays, so zone and node are both visible.
 * A Pod is a solid cartridge stacked in its node's bay; stack height is that node's matching-Pod count, and the depth strip along
 * each bay's back edge lights one dot per assigned level, so a stack of two reads without the tag. The pending Pod is a dashed
 * wireframe on the queue pad; it becomes a solid cartridge only when it is bound. A low gate stands at each bay's front edge:
 * upright while the node has not passed the spread filter in the last run, lying flat once it has. ScheduleAnyway has no filter,
 * so every gate lies flat there while its score only ranks the bays.
 * Analogy limits: bays are Nodes, trays are zones; the stack pitch is not a quota; the drawing shows no scheduler plugin order.
 * Purposeful parts inventory (before geometry):
 * 01 base plate; 02–05 feet; 06 base rebate line; 07–08 zone-a and zone-b trays; 09 partition rail; 10–17 tray screws;
 * 18–19 zone nameplates with embossed labels; 20 queue pad; 21 queue rebate; 22 queue label;
 * 23–26 bay plates; 27–30 bay recess lines; 31–38 bay corner screws; 39–42 depth-strip channels (one per bay);
 * 43–58 depth-strip lights (four per bay); 59–66 gate posts (two per bay); 67–70 upright gates; 71–74 flat gates;
 * 75–82 cartridge bodies (drawn per slot); 83–86 cartridge lids; 87–90 lid screws; 91–94 handles;
 * 95 pending wireframe (dashed); 96–97 tray rails along the trays' inner edges.
 */
export const VIEW = { width: 760, height: 360 } as const;
const baseRect: k.Plan = { x: -172, y: -120, w: 344, d: 274, r: 10 };
/** Frames the platform and up to four stacked cartridges; a fourth cartridge may run slightly past the top edge. */
export const P = k.fitProjection(k.boxCorners(baseRect, -14, 96), VIEW.width, VIEW.height, { pad: 14, azimuth: 35, elevation: 32 });

const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, .6), { tone, lit });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, .7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: .45 });
};

/** Bay centres in node order (node-a1, node-a2, node-b1, node-b2). Two bays per zone tray, stacked front to back. */
export const bayCenters: ReadonlyArray<readonly [number, number]> = [[-89, -60], [-89, 28], [89, -60], [89, 28]];
export const trayCenters: ReadonlyArray<readonly [number, number]> = [[-89, 0], [89, 0]];
const BAY_W = 112;
const BAY_D = 72;
const bayPlate = (index: number): k.Plan => {
  const [cx, cy] = bayCenters[index]!;
  return rect(cx - BAY_W / 2, cy - BAY_D / 2, BAY_W, BAY_D, 3);
};
/** The gate sits on the bay's front edge (the +y side), in the aisle toward the queue. */
const gateEdge = (index: number) => bayCenters[index]![1] + BAY_D / 2;
const gatePlan = (index: number): k.Plan => rect(bayCenters[index]![0] - BAY_W / 2, gateEdge(index) - 2, BAY_W, 4, 1);

/** Stack geometry: floor at the bay top, one cartridge per slot. MAX_SLOTS is the drawn stack; higher counts show as an overflow tag. */
export const MAX_SLOTS = 4;
const FLOOR = 7;
const PITCH = 20;
const LID_TOP = 17;
export const zStack = (slot: number) => FLOOR + slot * PITCH;

export const QUEUE: [number, number, number] = [0, 126, 4];
/** Position of the pending cartridge: queue at travel 0, bay slot at travel 1, with an arc overhead in between. */
export function moverAt(travel: number, destination: { bay: number; slot: number } | null): [number, number, number] {
  if (!destination) return QUEUE;
  const [cx, cy] = bayCenters[destination.bay]!;
  const z = zStack(destination.slot);
  const [qx, qy, qz] = QUEUE;
  return [qx + (cx - qx) * travel, qy + (cy - qy) * travel, qz + (z - qz) * travel + 30 * Math.sin(Math.PI * travel)];
}

/** Depth strip: one light per stack level, set on the bay floor along its back edge. Lit when a Pod is assigned at that level. */
const stripAt = (bay: number, level: number) => {
  const [cx, cy] = bayCenters[bay]!;
  return k.iso([cx - 36 + level * 24, cy - BAY_D / 2 + 8, 7], P);
};
export const depthLights = bayCenters.map((_, bay) => Array.from({ length: MAX_SLOTS }, (_slot, level) => {
  const [x, y] = stripAt(bay, level);
  return { x, y };
}));

const baseArt = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(baseRect, -14, 10, P)}"/>`];
  const feet = k.corners(baseRect, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -14, 6, 'lo'));
  out.push(S(baseRect, -8, 8, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(baseRect, 5), 0, P), { tone: 'faint' }));
  return out.join('');
})();

const trays = [rect(-160, -108, 142, 212, 6), rect(18, -108, 142, 212, 6)];
const trayArt = trays.map((tray) => S(tray, 0, 4, 'mid') + screws(tray, 4) + S(rect(tray.x + 2, tray.y + 2, 4, tray.d - 4, 1), 4, 3, 'lo')).join('');
/** Zone nameplates: a raised plate on the tray's front-left corner, with the zone name embossed on it. */
const zoneNames = ['zone-a', 'zone-b'];
const nameplateArt = trays.map((tray, index) => {
  const plate = rect(tray.x + 6, 86, 56, 13, 2);
  return S(plate, 4, 2, 'hi') + k.lineSvg(k.planOutline(k.insetPlan(plate, 2), 6, P), { tone: 'faint' }) +
    k.faceTextSvg(k.topMatrix([tray.x + 9, 89], 6.1, P), zoneNames[index]!, { size: 3.4, tone: 'mid' });
}).join('');
const partition = S(rect(-6, -108, 12, 216), 0, 8, 'mid');
const queuePad = rect(-26, 118, 52, 14, 2);
const queueArt = S(queuePad, 0, 4, 'lo') + k.lineSvg(k.planOutline(k.insetPlan(queuePad, 2), 4, P), { tone: 'faint' }) +
  k.faceTextSvg(k.topMatrix([-22, 121], 4.1, P), 'queue', { size: 3, tone: 'mid' });

/** Static fixture art: base, trays, nameplates, partition, queue pad, bay plates, recess lines, screws, depth channels and gate posts. */
export const fixtures = baseArt + trayArt + nameplateArt + partition + queueArt + bayCenters.map((_, index) => {
  const plate = bayPlate(index);
  const [cx, cy] = bayCenters[index]!;
  const edge = gateEdge(index);
  return S(plate, 4, 3, 'mid') + k.lineSvg(k.planOutline(k.insetPlan(plate, 4), 7, P), { tone: 'faint' }) + screws(plate, 7) +
    S(rect(cx - BAY_W / 2 + 8, cy - BAY_D / 2 + 4, BAY_W - 16, 8, 2), 7, 1, 'lo') +
    S(rect(cx - BAY_W / 2 - 2, edge - 2, 4, 4), 4, 12, 'lo') + S(rect(cx + BAY_W / 2 - 2, edge - 2, 4, 4), 4, 12, 'lo');
}).join('');

/** Upright gate: the node has not passed the spread filter in the last run, or no run has happened yet. Low by design. */
export function gateUpright(index: number): string {
  return S(gatePlan(index), 4, 10, 'hi');
}
/** Flat gate: the spread filter passed this node in the last run. It lies on the tray and blocks no stack. */
export function gateFlat(index: number): string {
  return S(gatePlan(index), 4, 2, 'lo');
}

/** Solid cartridge: a body and a lid with a handle, built at the origin and placed by translation. */
export function cartridgeArt(): string {
  const body = rect(-20, -14, 40, 28, 2);
  const lid = rect(-18, -12, 36, 24, 2);
  return S(body, 0, 14, 'hi') + S(lid, 14, 3, 'hi') +
    k.lineSvg(k.planOutline(k.insetPlan(lid, 2), LID_TOP, P), { tone: 'faint' }) +
    k.dotsSvg([[-12, -7], [12, -7], [-12, 7], [12, 7]].map(([x, y]) => k.iso([x!, y!, LID_TOP], P)), { size: .6 }) +
    S(rect(-8, -1, 16, 2, 1), LID_TOP, 2, 'lo');
}

/** Pending cartridge: a dashed wireframe of the same footprint, so it reads as not yet bound. */
export function pendingCartridgeArt(): string {
  const body = rect(-20, -14, 40, 28, 2);
  const lid = rect(-18, -12, 36, 24, 2);
  const edges = k.corners(body, 0).map(([x, y]) => k.rise([x, y], 0, LID_TOP, P)).join('');
  return k.lineSvg(k.planOutline(body, 0, P) + k.planOutline(body, 14, P) + k.planOutline(lid, LID_TOP, P) + edges, { tone: 'hi', dashed: true });
}

/** Screen position (percent of the viewBox) for an HTML label that sits beside a world-space point. */
export function screenAt(x: number, y: number, z: number) {
  const [sx, sy] = k.iso([x, y, z], P);
  return { left: `${(sx / VIEW.width) * 100}%`, top: `${(sy / VIEW.height) * 100}%` };
}

/** SVG position of a stacked Pod's identity label, centred on its lid. */
export function identityAt(bay: number, slot: number): { x: number; y: number } {
  const [cx, cy] = bayCenters[bay]!;
  const [x, y] = k.iso([cx, cy, zStack(slot) + LID_TOP + 1], P);
  return { x, y };
}

export const trayLabelAt = (tray: number) => screenAt(trayCenters[tray]![0], 118, 6);
/** Node tag: in the aisle just past the bay's gate, so it never sits on a stack. */
export const bayLabelAt = (bay: number) => screenAt(bayCenters[bay]![0], gateEdge(bay) + 10, 6);
