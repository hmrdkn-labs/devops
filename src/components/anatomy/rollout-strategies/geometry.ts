import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism (original art, not upstream example art).
 * Service = a selector gate: a housing whose sliding track holds the version-label pointer.
 * Pointer over both lanes = selector app=web; over one lane = version=blue or version=green.
 * Lanes = two keyed beds: RS-v1 and RS-v2 (rolling), or two Deployments (blue-green, canary).
 * Pod = removable cartridge: raised out of its socket = Created, not Ready; seated = Ready.
 * Rails = routes from the gate into each lane; a rail is lit only while the Service routes to Ready Pods there.
 * Analogy limit: beds are owners, not nodes; rails show routing, not load balancing.
 *
 * Purposeful parts inventory (about 90):
 * 01 base casting; 02 perimeter rebate; 03–06 feet; 07–10 foot flanges;
 * 11–14 corner fasteners; 15 gate plinth; 16 gate housing; 17 housing seam; 18–21 housing bolts;
 * 22 selector track groove; 23 track inlay; 24 pointer knob; 25 span bar (both lanes);
 * 26–27 gate ports (collars); 28–29 track end screws; 30 housing label plate;
 * 31–34 bed supports; 35–38 bed sills; 39–42 bed side returns; 43–50 rails for four slots (rear);
 * 51–58 rails for four slots (front); 59–66 sockets; 67–74 socket tongues; 75–82 socket bolts;
 * eight cartridges, each with shell, lid, wrapped seam, two grip mounts, pull bar, badge plate,
 * badge rivets, version text and three closed vents.
 */
const base: k.Plan = { x: -172, y: -100, w: 336, d: 262, r: 12 };
export const projection = k.fitProjection(k.boxCorners(base, -16, 80), 760, 470, { pad: 34, azimuth: 56, elevation: 37 });

/** Lane beds, rear (RS-v1 / lane 0) and front (RS-v2 / lane 1). */
const bedYs = [-75, 30] as const;
/** Plan y of each lane's centre line; the selector pointer rests on the first one. */
export const laneCentre = bedYs.map((y) => y + 36.5) as [number, number];
/** Pointer position when the selector matches lane 0 alone. Pointer travel is measured from here. */
export const pointerRest = laneCentre[0];

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
const housing: k.Plan = { x: -160, y: -66, w: 56, d: 150, r: 5 };
const track: k.Plan = { x: -147, y: -50, w: 14, d: 126, r: 2 };

export const chassis = [
  `<path class="iso-halo" d="${k.haloOf(base, -16, 3, projection)}"/>`,
  ...feet.map(([x, y]) => box({ x: x - 8, y: y - 8, w: 16, d: 16, r: 3 }, -16, 4, 'lo') + box({ x: x - 6, y: y - 6, w: 12, d: 12, r: 3 }, -12, 4, 'lo')),
  box(base, -8, 8, 'lo'),
  k.lineSvg(k.planOutline(k.insetPlan(base, 5), 0, projection), { tone: 'lo' }), bolts(base, 0, 11),
  box({ x: -165, y: -71, w: 66, d: 160, r: 6 }, 0, 4, 'lo'),
  box(housing, 4, 46, 'mid', false, 44),
  k.lineSvg(k.planOutline(k.insetPlan(housing, 3), 50, projection), { tone: 'faint' }),
  bolts(housing, 50, 5),
  box(track, 50, 1, 'lo'),
  k.lineSvg(k.planOutline(k.insetPlan(track, 2), 51, projection), { tone: 'faint' }),
  box({ x: -158, y: -44, w: 4, d: 4, r: 1 }, 50, 2, 'mid'),
  box({ x: -158, y: 62, w: 4, d: 4, r: 1 }, 50, 2, 'mid'),
  box({ x: -150, y: -62, w: 26, d: 4, r: 1 }, 50, 0.7, 'lo'),
  k.lineSvg(k.lineOnTop([-144, -60], [-128, -60], 50.7, projection), { tone: 'lo', free: true }),
  ...laneCentre.map((y) => box({ x: -104, y: y - 4, w: 4, d: 8, r: 1 }, 14, 10, 'hi')).join(''),
  k.dotsSvg(k.pointsAt([[-110, laneCentre[0] - 6, 46], [-110, laneCentre[1] + 6, 46]], projection), { size: .6 }),
].join('');

/** Span bar: visible only when the selector covers both lanes (app=web). */
export const spanBar = box({ x: -144, y: laneCentre[0] - 2, w: 8, d: laneCentre[1] - laneCentre[0] + 4, r: 2 }, 51, 2, 'hi', true);
/** Pointer knob: drawn at pointerRest and moved along plan y. */
export const pointerKnob = k.solidSvg(k.cylinder(-140, pointerRest, 5.5, 51, 9, projection, 28, 1), { tone: 'hi', lit: true });

/** Rails from each gate port into its bed. Drawn as paths; the figure toggles their lit state. */
export const railPaths = laneCentre.map((y) => k.pathOf(k.pointsAt([[-100, y, 19], [-84, y, 19]], projection)));

export const banks = bedYs.map((y, lane) => {
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
    return {
      hardware,
      art: art +
        box(badge, 37, .7, 'mid') +
        k.faceTextSvg(k.topMatrix([x + 17.5, y + 41.5], 37.7, projection), lane === 0 ? 'v1' : 'v2', { size: 3.4, tone: 'mid', anchor: 'middle' }) +
        k.dotsSvg(k.pointsAt([[x + 10, y + 40, 37.7], [x + 25, y + 40, 37.7]], projection), { size: .55 }) +
        [0, 1, 2].map((i) => k.lineSvg(k.planOutline({ x: x + 7, y: y + 20 + i * 3.5, w: 21, d: 1.3, r: .6 }, 37, projection), { tone: 'lo' })).join('') +
        [x + 5, x + 26].map((mountX) => box({ x: mountX, y: y + 58, w: 4, d: 3, r: .5 }, 16, 9, 'mid')).join('') +
        box({ x: x + 5, y: y + 61, w: 25, d: 3, r: 1 }, 20, 5, 'hi'),
    };
  });
  // The low front sill stays under the cartridges: its top is 8, their socket bottom is 9.
  return { floor, slots, front: box({ x: -82, y: y + 67, w: 230, d: 5, r: 1 }, 7, 1, 'mid') };
});

/** Lid anchor per cartridge in screen space, indexed lane × SLOTS + slot. */
const lidAnchors = bedYs.flatMap((y) => [0, 1, 2, 3].map((slot) => k.iso([-70 + slot * 53 + 17.5, y + 36.5, 46], projection)));
/** Pod identity label anchor above each lid. The figure fills in the Pod stand-in when a Pod occupies the slot. */
export const identityAnchor = lidAnchors.map(([cx, cy]) => ({ x: cx, y: cy - 14 }));
