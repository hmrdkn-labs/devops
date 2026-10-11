import * as k from '@/lib/anatomy/vendor/iso-kit';
import type { ActorId } from './model';

/**
 * Concept → mechanism (written before geometry):
 * Control-plane ownership → four service drawers in an open rack.
 * API state → removable storage cartridges, not application data.
 * Controller ownership → two relay boards in one controller tray.
 * Node assignment → scheduler selector dial; execution → separate node cartridge.
 * Inspection → a drawer pulls along its own retained rails, without changing API state.
 * Checkpoint → an ordinal carriage on a console ruler, NOT a network packet.
 * Completion → each actor's mechanical witness latch shifts; runtime cartridge seats.
 * Analogy limit: real actors coordinate asynchronously through the API, not a serial bus.
 *
 * Purposeful parts inventory (families instantiated below, 40+ actual parts):
 * 01 baseplate, 02-05 feet, 06 perimeter groove, 07-10 base screws,
 * 11 rack backplane, 12 left rear upright, 13 right rear upright,
 * 14 crown beam, 15-18 shelf floors, 19-26 retained drawer rails,
 * 27-30 tray floors, 31-34 front panels, 35-42 handle pedestals,
 * 43-46 pull bars, 47-54 board standoffs, 55-58 circuit boards,
 * 59-61 API gate chips, 62-64 storage cartridges,
 * 65 Deployment relay, 66 ReplicaSet relay, 67 scheduler dial housing,
 * 68 dial bezel, 69 rooted dial ticks, 70 selector pointer,
 * 71-74 witness guides, 75-78 sliding witness latches,
 * 79 node backplane, 80 node pedestal, 81-82 node shelves,
 * 83-86 node rails, 87-88 node trays, 89-90 node front panels,
 * 91-94 node handle mounts, 95-96 node pulls, 97 kubelet processor,
 * 98 runtime cartridge, 99 cartridge lid, 100-103 cartridge fasteners,
 * 104 progress rail, 105 ruler strip, 106-107 end stops,
 * 108 travelling index shoe, 109 shoe pointer, 110 console nameplate,
 * 111-112 console controls, plus screw rings and closed cooling slots.
 */
const base: k.Plan = { x: -128, y: -58, w: 270, d: 208, r: 9 };
export const projection = k.fitProjection(
  [...k.boxCorners(base, -12, 0), ...k.boxCorners({ x: -118, y: -46, w: 124, d: 88, r: 2 }, 0, 152)],
  760, 490, { pad: 34, azimuth: 52, elevation: 28 },
);
const P = projection;
const slab = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid') => k.solidSvg(k.slabOf(plan, z, h, P, 5, h > 2 ? .65 : 0), { tone });
const box = (x: number, y: number, w: number, d: number, z: number, h: number, tone: k.Tone = 'mid') => slab({ x, y, w, d, r: Math.min(1.5, w / 3, d / 3) }, z, h, tone);
const line = (d: string, tone: k.LineTone = 'lo') => k.lineSvg(d, { tone });
const screws = (plan: k.Plan, z: number, inset = 3) => {
  const points = k.corners(plan, inset);
  return line(points.map(([x, y]) => k.ring(x, y, 1.3, z, P, 20)).join(''), 'faint') +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: .45 });
};
const vents = (x: number, y: number, w: number, z: number) => line(
  Array.from({ length: 5 }, (_, i) => k.planOutline({ x, y: y + i * 3, w, d: 1, r: .5 }, z, P, 4)).join(''), 'faint',
);
const feet = k.corners(base, 19).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
export const foundation = [
  `<path class="iso-halo" d="${k.haloOf(base, -12, 5, P)}"/>`,
  ...feet.map(([x, y]) => k.solidSvg(k.cylinder(x, y, 6, -12, 5, P, 32), { tone: 'lo' })),
  slab(base, -7, 7, 'lo'), line(k.planOutline(k.insetPlan(base, 5), 0, P), 'faint'), screws(base, 0, 11),
  // Rack has an open front. The backplane and rear posts support the crown and shelves.
  box(-118, -46, 124, 5, 0, 145, 'lo'),
  box(-118, -41, 5, 63, 0, 145), box(1, -41, 5, 63, 0, 145),
  box(-118, -46, 124, 68, 145, 5),
  vents(-97, -32, 75, 150),
  // Node chassis is a separate physical assembly, not another control-plane drawer.
  box(28, -42, 103, 5, 0, 72, 'lo'), box(28, -37, 5, 98, 0, 72),
  box(126, -37, 5, 98, 0, 72), box(28, -42, 103, 98, 72, 4),
  vents(47, -24, 55, 76),
].join('');

export interface Assembly { id: ActorId; shelf: string; tray: string; latch: string; }
function drawer(id: ActorId, x: number, y: number, width: number, z: number, depth: number): Assembly {
  const floor: k.Plan = { x: x + 7, y: y + 6, w: width - 14, d: depth - 10, r: 2 };
  const board: k.Plan = { x: floor.x + 5, y: floor.y + 4, w: floor.w - 10, d: floor.d - 12, r: 1 };
  const frontY = floor.y + floor.d;
  const shelf = box(x, y, width, depth, z - 5, 2, 'lo') +
    [floor.x + 2, floor.x + floor.w - 5].map((rx) => box(rx, y + 3, 3, depth + 16, z - 3, 3, 'lo')).join('');
  let electronics = '';
  if (id === 'api') electronics = [0, 1, 2].map((i) => box(board.x + 7 + i * 22, board.y + 7, 15, 12, z + 5, 4, 'hi')).join('');
  if (id === 'store') electronics = [0, 1, 2].map((i) => {
    const plan = { x: board.x + 7 + i * 22, y: board.y + 4, w: 15, d: 20, r: 1 };
    return slab(plan, z + 5, 6, 'hi') + line(k.planOutline(k.insetPlan(plan, 2), z + 11, P), 'faint');
  }).join('');
  if (id === 'controllers') electronics = [0, 1].map((i) => box(board.x + 9 + i * 35, board.y + 5, 23, 18, z + 5, 5, 'hi')).join('');
  if (id === 'scheduler') {
    const cx = board.x + 24, cy = board.y + 14;
    const ticks = k.radialTicks(cx, cy, 10, 20, 5, z + 11, [1.3, 2.8], P);
    electronics = k.solidSvg(k.cylinder(cx, cy, 13, z + 5, 6, P, 64, .5), { tone: 'hi' }) +
      line(k.ring(cx, cy, 11, z + 11, P, 64)) + line(ticks.minor, 'faint') + line(ticks.major) +
      k.lineSvg(k.lineOnTop([cx, cy], [cx + 7, cy - 4], z + 11, P), { tone: 'hi', free: true }) +
      k.dotsSvg([k.iso([cx, cy, z + 11], P)], { size: 1 });
  }
  if (id === 'kubelet') electronics = box(board.x + 8, board.y + 5, 30, 21, z + 5, 6, 'hi') + vents(board.x + 45, board.y + 7, 12, z + 5);
  if (id === 'runtime') {
    const cartridge = { x: board.x + 12, y: board.y + 4, w: 43, d: 26, r: 2 };
    electronics = `<g data-runtime-cartridge transform="${k.translateAlong(P, [0, 12, 0])}">` +
      slab(cartridge, z + 5, 7, 'hi') + slab(k.insetPlan(cartridge, 2), z + 12, 1, 'lo') +
      screws(cartridge, z + 13, 5) + vents(cartridge.x + 12, cartridge.y + 5, 18, z + 13) + '</g>';
  }
  const guide = { x: floor.x + floor.w - 15, y: frontY - 6, w: 11, d: 4, r: 1 };
  const tray = slab(floor, z, 2, 'mid') +
    [board.x + 3, board.x + board.w - 6].map((sx) => box(sx, board.y + 2, 3, board.d - 4, z + 2, 2, 'lo')).join('') +
    slab(board, z + 4, 1, 'lo') + electronics + screws(board, z + 5, 3) +
    box(floor.x, frontY, floor.w, 3, z, 13, 'mid') +
    box(floor.x + 15, frontY + 3, 3, 4, z + 4, 3) +
    box(floor.x + 42, frontY + 3, 3, 4, z + 4, 3) +
    box(floor.x + 15, frontY + 7, 30, 3, z + 4, 3, 'hi') +
    slab(guide, z + 2, 1, 'lo');
  const latch = box(guide.x, guide.y, 4, 4, z + 3, 3, 'hi');
  return { id, shelf, tray, latch };
}
export const assemblies: Assembly[] = [
  drawer('scheduler', -113, -39, 114, 12, 56),
  drawer('controllers', -113, -39, 114, 44, 56),
  drawer('store', -113, -39, 114, 76, 56),
  drawer('api', -113, -39, 114, 108, 56),
  drawer('runtime', 33, -35, 93, 10, 86),
  drawer('kubelet', 33, -35, 93, 43, 86),
];
const strip: k.Plan = { x: -109, y: 122, w: 224, d: 8, r: 1 };
const ticks = k.topTicks(-104, 106, 30, 1, strip.y, 5, [2, 5], P);
export const consoleFront = [
  slab(strip, 0, 5, 'lo'), line(ticks.major),
  box(-114, 118, 5, 19, 0, 9), box(115, 118, 5, 19, 0, 9),
  box(-100, 78, 79, 29, 0, 6),
  k.faceTextSvg(k.topMatrix([-91, 92], 6, P), 'K8S / CONTROL', { size: 4, tone: 'mid' }),
  ...[-9, 10].map((x) => k.solidSvg(k.cylinder(x, 92, 6, 0, 6, P, 40, .4), { tone: 'mid' }) + line(k.knurl(x, 92, 6, 0, 6, 24, P), 'faint')),
].join('');
export const indexShoe = box(-109, 120, 10, 12, 5, 4, 'hi') +
  line(k.lineOnTop([-104, 120], [-104, 132], 9, P), 'hi');
