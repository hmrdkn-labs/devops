import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism: a Pod housing keeps its identity (uid, node) while one container cell is
 * lifted out of its seat when it is not running and reseated when the kubelet restarts it.
 * Probes are tallies and gates. A startup shutter covers the liveness and readiness tallies until
 * startup passes. The liveness tally lifts the cell out at threshold. The readiness tally closes the
 * endpoint gate: the puck (one endpoint) leaves the Service tray, and the cell is not touched.
 * The console shows the phase dial and four condition lamps. Physical order is explanatory.
 * Purposeful parts (≈ 80): 01 bedplate; 02–05 feet; 06 bed inset line; 07–10 bed screws;
 * 11–13 label plate, rule and engraving; 14 housing floor; 15 floor groove; 16 seat plate;
 * 17–20 seat screws; 21 back wall; 22 left wall; 23 back-right post; 24–26 back and left rails;
 * 27 cell body (accent); 28 lid seam; 29 lid; 30–33 lid screws; 34–35 front tabs; 36–37 status lenses;
 * 38–39 tally blocks; 40–45 tally pips; 46–47 block seams; 48–49 shutter guides; 50 shutter bar;
 * 51–52 front posts; 53 front rail; 54 right rail; 55–57 gate posts and blade; 58 track; 59 track seam;
 * 60 puck; 61 tray floor; 62 tray seam; 63 tray back wall; 64–65 tray left walls; 66 tray front wall;
 * 67 tray right wall; 68–69 console block and top; 70 top seam; 71–74 console screws; 75–78 lamps;
 * 79 dial base; 80 dial face; 81–84 detents; 85 needle (one per phase, shown by state).
 */
export const bed = { x: -150, y: -95, w: 300, d: 190, r: 8 };
export const P = k.fitProjection(k.boxCorners(bed, -16, 124), 720, 430, { pad: 26, azimuth: 35, elevation: 32 });

const HX0 = -132;
const HX1 = -54;
const HY0 = -58;
const HY1 = 48;
const TOP = 114;
const DIAL = { x: 56, y: -78 };
/** Lamp centres along the console, by condition order: Scheduled, Initialized, Containers ready, Ready. */
export const lampX = [-28, -12, 4, 20];
/** Four phase positions on the dial, in order: Pending, Running, Succeeded, Failed. */
export const dialAngles = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
export const LIFT_OUT = 30;
export const SHUTTER_UP = 26;
export const GATE_UP = 30;
/** Puck travel from its rest point (x = -30) into the Service tray (x = 95). */
export const PUCK_TRAVEL = 125;
export const pipPositions: Array<[number, number]> = [[-119, 62], [-113, 62], [-107, 62], [-91, 62], [-85, 62], [-79, 62]];

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone, lit });
const C = (cx: number, cy: number, radius: number, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.cylinder(cx, cy, radius, z, h, P, 24, 0.3), { tone, lit });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};

export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);

export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  return out.join('');
})();

/** Front-right label plate, drawn after the tray because it is nearer the viewer. */
export const labelPlate = (() => {
  const plate = rect(34, 62, 84, 13, 2);
  return S(plate, 0, 1, 'lo') + k.lineSvg(k.planOutline(k.insetPlan(plate, 2), 1, P), { tone: 'faint' }) +
    k.faceTextSvg(k.topMatrix([38, 66], 1.1, P), 'POD LIFECYCLE / 01', { size: 3, tone: 'mid' });
})();

/** Far housing parts: floor, seat, back and left walls, back post, and the back and left rails. */
export const housingBack = (() => {
  const out: string[] = [];
  const shell = rect(HX0, HY0, HX1 - HX0, HY1 - HY0, 2);
  out.push(S(shell, 0, 6, 'mid'), k.lineSvg(k.planOutline(k.insetPlan(shell, 4), 6, P), { tone: 'faint' }));
  const seat = rect(-112, -30, 38, 50, 2);
  out.push(S(seat, 6, 4, 'lo'), screws(seat, 10));
  out.push(S(rect(HX0, HY0, HX1 - HX0, 7, 1), 6, 108, 'mid'));
  out.push(S(rect(HX0, HY0, 7, HY1 - HY0, 1), 6, 108, 'mid'));
  out.push(S(rect(HX1 - 7, HY0, 7, 7, 1), 6, 108, 'mid'));
  out.push(S(rect(HX0, HY0, HX1 - HX0, 7, 1), TOP, 8, 'hi'));
  out.push(S(rect(HX0, HY0, 7, HY1 - HY0, 1), TOP, 8, 'hi'));
  return out.join('');
})();

/** Near housing parts, drawn after the cell and tallies: front posts and the front and right rails. */
export const housingFront = (() => {
  const out: string[] = [];
  out.push(S(rect(HX0, HY1 - 7, 7, 7, 1), 6, 108, 'mid'));
  out.push(S(rect(HX1 - 7, HY1 - 7, 7, 7, 1), 6, 108, 'mid'));
  out.push(S(rect(HX0, HY1 - 7, HX1 - HX0, 7, 1), TOP, 8, 'hi'));
  out.push(S(rect(HX1 - 7, HY0, 7, HY1 - HY0, 1), TOP, 8, 'hi'));
  return out.join('');
})();

/** The container cell, drawn at rest in its seat. The kubelet lifts it out when it is not running. */
export const cell = (() => {
  const body = rect(-110, -20, 34, 30, 2);
  const out: string[] = [];
  out.push(S(body, 10, 22, 'hi', true));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(body, 3), 32, P), { tone: 'faint' }));
  out.push(S(k.insetPlan(body, 2), 32, 3, 'hi'));
  out.push(screws(body, 35));
  out.push(S(rect(-106, 8, 8, 4, 1), 32, 3, 'mid'), S(rect(-88, 8, 8, 4, 1), 32, 3, 'mid'));
  out.push(C(-100, -12, 2.4, 35, 3, 'lo'), C(-84, -12, 2.4, 35, 3, 'lo'));
  return out.join('');
})();

export const tallyBlocks = (() => {
  const out: string[] = [];
  for (const x0 of [-124, -96]) {
    const block = rect(x0, 56, 22, 12, 1);
    out.push(S(block, 0, 6, 'mid'), k.lineSvg(k.planOutline(k.insetPlan(block, 2), 6, P), { tone: 'faint' }));
  }
  return out.join('');
})();

/** One tally pip: lit when its probe has failed that many times. */
export const pipSvg = (x: number, y: number, lit: boolean) => C(x, y, 2.4, 6, 4, lit ? 'hi' : 'lo');

/** The startup shutter covers the tallies until startup passes; it is lifted above them when open. */
export const shutterGuides = S(rect(-132, 72, 3, 9, 1), 0, 16, 'lo') + S(rect(-72, 72, 3, 9, 1), 0, 16, 'lo');
export const shutterBar = S(rect(-130, 74, 60, 5, 1), 0, 14, 'hi');

export const track = (() => {
  const rail = rect(-54, -7, 110, 14, 1);
  return S(rail, 0, 3, 'lo') + k.lineSvg(k.planOutline(k.insetPlan(rail, 2), 3, P), { tone: 'faint' });
})();

/** The puck is one endpoint; it is drawn at rest and moved along the track into the tray. */
export const puck = C(-30, 0, 6, 3, 8, 'hi');

export const gateFrame = S(rect(-6, -16, 12, 3, 1), 3, 14, 'mid') + S(rect(-6, 13, 12, 3, 1), 3, 14, 'mid');
/** The gate blade is lowered across the track when not Ready and lifted clear when Ready. */
export const gateBlade = S(rect(-1.5, -12, 3, 24, 0.5), 3, 26, 'hi');

export const trayBack = (() => {
  const out: string[] = [];
  const floor = rect(56, -30, 74, 60, 2);
  out.push(S(floor, 0, 3, 'mid'), k.lineSvg(k.planOutline(k.insetPlan(floor, 4), 3, P), { tone: 'faint' }));
  out.push(S(rect(56, -30, 74, 4, 1), 3, 10, 'mid'));
  out.push(S(rect(56, -30, 4, 22, 1), 3, 10, 'mid'));
  out.push(S(rect(56, 8, 4, 22, 1), 3, 10, 'mid'));
  return out.join('');
})();

export const trayFront = S(rect(56, 26, 74, 4, 1), 3, 10, 'mid') + S(rect(126, -30, 4, 60, 1), 3, 10, 'mid');

export const consoleBase = (() => {
  const out: string[] = [];
  const block = rect(-44, -94, 118, 32, 3);
  const top = rect(-40, -90, 110, 24, 2);
  out.push(S(block, 0, 14, 'mid'));
  out.push(S(top, 14, 2, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(top, 2), 16, P), { tone: 'faint' }));
  out.push(screws(block, 14));
  out.push(C(DIAL.x, DIAL.y, 12, 16, 2, 'lo'), C(DIAL.x, DIAL.y, 10, 18, 2, 'hi'));
  for (const angle of dialAngles) {
    const x = DIAL.x + Math.cos(angle) * 8.6;
    const y = DIAL.y + Math.sin(angle) * 8.6;
    out.push(S(rect(x - 1, y - 1, 2, 2, 0.3), 20, 1, 'lo'));
  }
  return out.join('');
})();

export const lampSvg = (x: number, on: boolean) => C(x, -80, 3, 16, 3, on ? 'hi' : 'lo');

/** A dial needle is a thin blade from the dial centre to one phase detent. */
export const needleSvg = (angle: number) => {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const ring: k.Plane[] = [
    [DIAL.x + nx * 1.1, DIAL.y + ny * 1.1],
    [DIAL.x + dx * 8.4, DIAL.y + dy * 8.4],
    [DIAL.x - nx * 1.1, DIAL.y - ny * 1.1],
  ];
  return k.solidSvg(k.extrude(ring, 20, 2.5, P), { tone: 'hi' });
};

export const needles = dialAngles.map(needleSvg);
