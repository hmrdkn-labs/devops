import * as k from '@/lib/anatomy/vendor/iso-kit';

/**
 * Concept → mechanism: one stored settings cabinet, a kubelet carriage on a rail, a mounted rack, and a sealed
 * container box. Its start-time stamp reads environment values once; the rack card and the pinned clip card
 * show the volume and subPath paths. Each card is a real part whose visibility is the Pod's actual view.
 * Physical order is explanatory, not a claim about how the kubelet is implemented.
 * Purposeful parts: base (bedplate, four feet, groove, corner screws, label plate); store (body, top cap,
 * seam, two drawer trays with wells, two cards, padlock with shackle, two handles); rack (body, inset tray,
 * card, screws); rail (two posts with feet, beam, groove, ruler ticks); carriage (clamp, gripper);
 * bracket (rack-to-box link); box (body, top plate, rule, identity plate, two stamp guides, stamp head,
 * screws, subPath clip, clip card, front seams).
 */
export const bed = { x: -150, y: -92, w: 300, d: 184, r: 8 };
/** The machine's volume: the bed footprint from the feet (z -16) to the store top (z 106). Every part lies inside it. */
const volume = k.boxCorners(bed, -16, 106);
export const P = k.fitProjection(volume, 720, 720, { pad: 16, azimuth: 35, elevation: 32 });
/** The SVG view is the volume's projected bounds plus a small margin, so the stage's aspect follows the machine. */
export const view = (() => {
  const flat = volume.map((point) => k.iso(point, P));
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const x = Math.min(...xs) - 6;
  const y = Math.min(...ys) - 6;
  return { x, y, w: Math.max(...xs) + 6 - x, h: Math.max(...ys) + 6 - y };
})();
export const viewBox = `${view.x} ${view.y} ${view.w} ${view.h}`;

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid') =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};

export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  const label = rect(72, 80, 66, 9, 2);
  out.push(S(label, 0, 1, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(label, 2), 1, P), { tone: 'faint' }),
    k.faceTextSvg(k.topMatrix([76, 83], 1.1, P), 'CONFIG / 01', { size: 3, tone: 'mid' }));
  return out.join('');
})();

const storeBody = rect(-142, -60, 80, 120, 3);
const storeTop = rect(-146, -64, 88, 128, 4);
const trayPlan = rect(-136, 58, 68, 28, 2);
const wellPlan = rect(-130, 62, 56, 18, 1);
const cardPlan = rect(-124, 64, 44, 14, 1);

/** The store: a ConfigMap drawer above a Secret drawer. Both trays protrude toward the viewer. */
export const store = (() => {
  const out: string[] = [];
  out.push(S(storeBody, 0, 100, 'mid'), S(storeTop, 100, 6, 'hi'));
  out.push(k.lineSvg(k.planOutline(k.insetPlan(storeTop, 3), 106, P), { tone: 'faint' }), screws(storeTop, 106));
  out.push(k.lineSvg(k.segment([-142, 60, 76], [-62, 60, 76], P), { tone: 'lo' }));
  out.push(`<g data-drawer="configmap">${S(trayPlan, 62, 6, 'mid')}${S(wellPlan, 68, 1, 'lo')}${S(cardPlan, 69, 2, 'hi')}</g>`);
  out.push(`<g data-drawer="secret">${S(trayPlan, 22, 6, 'mid')}${S(wellPlan, 28, 1, 'lo')}${S(cardPlan, 29, 2, 'hi')}</g>`);
  out.push(S(rect(-104, 78, 10, 7, 1), 31, 5, 'hi'), k.solidSvg(k.cylinder(-99, 81.5, 2.2, 36, 4, P), { tone: 'hi' }));
  out.push(S(rect(-112, 86, 20, 3, 1), 66, 2, 'lo'), S(rect(-112, 86, 20, 3, 1), 26, 2, 'lo'));
  return out.join('');
})();

const rackPlan = rect(72, -86, 40, 28, 2);
/** The mounted rack: its card is the volume file the Pod's directory mount exposes. */
export const rack = (() => {
  const out: string[] = [S(rackPlan, 0, 30, 'mid'), S(rect(76, -82, 32, 20, 1), 30, 2, 'lo'), screws(rackPlan, 30)];
  out.push(`<g data-card="volume">${S(rect(80, -80, 24, 14, 1), 32, 2, 'hi')}</g>`);
  return out.join('');
})();

const beamPlan = rect(-58, -78, 172, 8, 2);
/** The rail: two posts on feet and a beam the carriage clamps onto. */
export const rail = (() => {
  const out: string[] = [S(rect(-54, -76, 8, 8, 1), 0, 56, 'mid'), S(rect(64, -76, 8, 8, 1), 0, 56, 'mid')];
  out.push(S(rect(-58, -80, 16, 16, 2), 0, 2, 'lo'), S(rect(60, -80, 16, 16, 2), 0, 2, 'lo'));
  out.push(S(beamPlan, 56, 6, 'mid'), k.lineSvg(k.planOutline(k.insetPlan(beamPlan, 2), 62, P), { tone: 'faint' }));
  const ticks = k.topTicks(-54, 110, 8, 5, -70, 62, [2, 4], P);
  out.push(k.lineSvg(ticks.minor, { tone: 'faint' }), k.lineSvg(ticks.major, { tone: 'lo' }));
  return out.join('');
})();

/** The kubelet carriage: a clamp on the beam and a gripper hanging beneath it. Moves along x. */
export const carriage = (() => {
  const clamp = rect(-30, -82, 26, 20, 2);
  return S(clamp, 54, 18, 'mid') + screws(clamp, 72) + S(rect(-26, -78, 18, 14, 1), 34, 20, 'lo');
})();

/** The bracket that links the rack's volume to the box. */
export const bracket = S(rect(82, -58, 20, 28, 1), 30, 10, 'mid');

const boxPlan = rect(56, -30, 76, 82, 4);
/** The sealed container. It is the one subject: an image whose settings arrive from outside. */
export const box = (() => {
  const out: string[] = [S(boxPlan, 0, 66, 'hi')];
  const top = rect(60, -26, 68, 74, 3);
  out.push(S(top, 66, 2, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(top, 3), 68, P), { tone: 'faint' }), screws(boxPlan, 66));
  out.push(S(rect(64, -22, 26, 12, 1), 68, 1, 'lo'));
  out.push(S(rect(86, -18, 4, 4, 1), 68, 32, 'mid'), S(rect(118, -18, 4, 4, 1), 68, 32, 'mid'));
  out.push(k.lineSvg(k.segment([58, 52, 22], [130, 52, 22], P), { tone: 'lo' }), k.lineSvg(k.segment([58, 52, 46], [130, 52, 46], P), { tone: 'lo' }));
  out.push(S(rect(46, -6, 10, 22, 1), 36, 8, 'mid'));
  out.push(`<g data-card="subpath">${S(rect(47, -4, 8, 18, 1), 44, 2, 'hi')}</g>`);
  return out.join('');
})();

/** The stamp head that presses once when a container starts. Its face is lit by CSS only while the active Pod reads env. */
export const stampHead = S(rect(84, -20, 40, 26, 2), 84, 8, 'hi') + k.lineSvg(k.segment([90, 0, 92], [118, 0, 92], P), { tone: 'faint' });

export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);
/** Carriage travel from its rest position over the rack. */
export const carriageTravel = 112;
/** Stamp press depth at container start. */
export const stampPress = -6;
