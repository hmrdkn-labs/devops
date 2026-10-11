import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism (original art, not upstream example art).
 * Deployment = bolted recipe console and sliding template key.
 * ReplicaSets = independent keyed cartridge beds, one per template revision.
 * Pod = removable cartridge; Created rides the insertion rails, Ready seats fully.
 * Desired count = adjustable stop on an indexed capacity ruler.
 * Deletion = cartridge leaves the bed; replacement has a new identity in the ledger.
 * Rollout = new bed fills while old bed drains, never a cartridge transfer.
 * Analogy limit: beds are ownership groups, NOT nodes; rails are NOT scheduling.
 *
 * Purposeful parts inventory, before geometry (over 40 physical parts):
 * 01 base casting; 02 perimeter rebate; 03–06 rubber feet;
 * 07–10 foot flanges; 11–14 corner fasteners; 15 console plinth;
 * 16 console shell; 17 service lid; 18 lid seam; 19–22 lid bolts;
 * 23 recipe-key track; 24 key carriage; 25 key thumb grip;
 * 26 console legend plate; 27–28 plate screws;
 * 29 old bed; 30 new bed; 31–34 bed support pads;
 * 35–38 rear/front bed sills; 39–42 bed side returns;
 * 43–50 paired insertion rails for four old slots;
 * 51–58 paired insertion rails for four new slots;
 * 59–66 rear cartridge sockets; 67–74 socket connector tongues;
 * 75–82 socket bolts; 83 ruler foundation; 84 ruler inlay;
 * 85–86 ruler end stops; 87 sliding count stop; 88 stop grip;
 * 89–92 ruler bolts; eight optional cartridge assemblies each have
 * a case, lid, wrapped lid seam, two grip mounts, a pull bar, keyed nose,
 * identity badge, two badge rivets and three closed ventilation slots.
 * All fasteners sit on host tops; rails meet sockets; shells sit on beds.
 */
const base: k.Plan = { x: -172, y: -100, w: 336, d: 262, r: 12 };
export const projection = k.fitProjection(k.boxCorners(base, -16, 80), 760, 470, { pad: 34, azimuth: 56, elevation: 37 });

function box(plan: k.Plan, z: number, height: number, tone: k.Tone = 'mid', lit = false, seam?: number) {
  return k.solidSvg(k.slabOf(plan, z, height, projection, 5, .7), {
    tone, lit, inner: seam === undefined ? '' : k.lineSvg(k.sideSeam(plan, seam, projection, 5), { tone: 'faint' }),
  });
}
function bolts(plan: k.Plan, top: number, inset: number) {
  const points = k.corners(plan, inset);
  return points.map(([x, y]) => k.lineSvg(k.ring(x, y, 1.5, top, projection, 16), { tone: 'lo' })).join('') +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, top], projection)), { size: .6 });
}
const feet = k.corners(base, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], projection) - k.depthOf([b[0], b[1], 0], projection));
const lid: k.Plan = { x: -158, y: -65, w: 58, d: 83, r: 5 };
const keyTrack: k.Plan = { x: -148, y: -53, w: 18, d: 58, r: 2 };
export const chassis = [
  `<path class="iso-halo" d="${k.haloOf(base, -16, 3, projection)}"/>`,
  ...feet.map(([x, y]) => box({ x: x - 8, y: y - 8, w: 16, d: 16, r: 3 }, -16, 4, 'lo') + box({ x: x - 6, y: y - 6, w: 12, d: 12, r: 3 }, -12, 4, 'lo')),
  box(base, -8, 8, 'lo'),
  k.lineSvg(k.planOutline(k.insetPlan(base, 5), 0, projection), { tone: 'lo' }), bolts(base, 0, 11),
  box({ x: -163, y: -70, w: 68, d: 93, r: 5 }, 0, 4, 'lo'),
  box({ x: -158, y: -65, w: 58, d: 83, r: 5 }, 4, 48, 'mid', false, 44),
  box(lid, 52, 3, 'mid'), bolts(lid, 55, 5),
  box(keyTrack, 55, 1, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(keyTrack, 2), 56, projection), { tone: 'faint' }),
  box({ x: -125, y: -46, w: 18, d: 38, r: 2 }, 55, .7, 'lo'),
  ...[0, 1, 2].map((i) => k.lineSvg(k.lineOnTop([-122, -40 + i * 8], [-110, -40 + i * 8], 55.7, projection), { tone: 'lo', free: true })),
  k.dotsSvg(k.pointsAt([[-116, -43, 55.7], [-116, -11, 55.7]], projection), { size: .6 }),
].join('');
export const templateKey = box({ x: -147, y: -52, w: 16, d: 23, r: 2 }, 56, 3, 'hi') + box({ x: -143, y: -47, w: 8, d: 13, r: 2 }, 59, 4, 'mid');

export const banks = ([-75, 30] as const).map((y) => {
  const bed: k.Plan = { x: -83, y, w: 232, d: 72, r: 4 };
  const supports = [-76, 133].map((x) => box({ x, y: y + 6, w: 10, d: 60, r: 2 }, 0, 3, 'lo')).join('');
  const floor = supports + box(bed, 3, 4, 'lo') + bolts(bed, 7, 5) +
    box({ x: -82, y, w: 230, d: 5, r: 1 }, 7, 8, 'mid') +
    [-83, 145].map((x) => box({ x, y: y + 5, w: 4, d: 62, r: 1 }, 7, 5, 'mid')).join('');
  const slots = [0, 1, 2, 3].map((slot) => {
    const x = -70 + slot * 53;
    const hardware = [x + 2, x + 30].map((railX) => box({ x: railX, y: y + 13, w: 3, d: 48, r: .5 }, 7, 2, 'mid')).join('') +
      box({ x, y: y + 5, w: 35, d: 8, r: 1 }, 7, 5, 'mid') +
      box({ x: x + 7, y: y + 13, w: 21, d: 2, r: .3 }, 7, 2, 'lo') +
      k.dotsSvg(k.pointsAt([[x + 3, y + 9, 12], [x + 32, y + 9, 12]], projection), { size: .65 });
    const shell: k.Plan = { x, y: y + 15, w: 35, d: 43, r: 3 };
    const badge: k.Plan = { x: x + 8, y: y + 34, w: 19, d: 13, r: 1 };
    const art = box(shell, 9, 26, 'hi', false, 31) +
      box(k.insetPlan(shell, 1), 35, 2, 'hi') +
      box({ x: x + 12, y: y + 13, w: 11, d: 2, r: .3 }, 9, 4, 'mid');
    return { x, y, hardware, art: art +
      box(badge, 37, .7, 'mid') +
      k.dotsSvg(k.pointsAt([[x + 10, y + 40, 37.7], [x + 25, y + 40, 37.7]], projection), { size: .55 }) +
      [0, 1, 2].map((i) => k.lineSvg(k.planOutline({ x: x + 7, y: y + 20 + i * 3.5, w: 21, d: 1.3, r: .6 }, 37, projection), { tone: 'lo' })).join('') +
      [x + 5, x + 26].map((mountX) => box({ x: mountX, y: y + 58, w: 4, d: 3, r: .5 }, 16, 9, 'mid')).join('') +
      box({ x: x + 5, y: y + 61, w: 25, d: 3, r: 1 }, 20, 5, 'hi'),
    };
  });
  // Low front sill cannot intersect cartridges: its top is 8, their bottom is 9.
  return { floor, slots, front: box({ x: -82, y: y + 67, w: 230, d: 5, r: 1 }, 7, 1, 'mid') };
});
const ruler: k.Plan = { x: -77, y: 136, w: 223, d: 13, r: 2 };
const ticks = k.topTicks(-68, 144.1, 10.6, 5, 137, 5, [3, 7], projection);
export const rulerArt = box(ruler, 0, 4, 'mid') + box(k.insetPlan(ruler, 1), 4, 1, 'lo') +
  k.lineSvg(ticks.minor, { tone: 'lo' }) + k.lineSvg(ticks.major, { tone: 'mid' }) +
  [-79, 151].map((x) => box({ x, y: 134, w: 4, d: 17, r: 1 }, 0, 8, 'mid')).join('') + bolts(ruler, 5, 3);
export const countStop = box({ x: -71, y: 134, w: 6, d: 17, r: 1 }, 5, 4, 'hi', true) +
  box({ x: -71, y: 140, w: 6, d: 5, r: 1 }, 9, 4, 'hi', true);
