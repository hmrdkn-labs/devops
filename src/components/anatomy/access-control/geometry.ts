import * as k from '@/lib/anatomy/vendor/iso-kit';

/**
 * Concept → mechanism: one request cartridge travels a single inspection rail through four
 * gates. Gate 1 reads the credential, gate 2 looks for a RoleBinding that names the caller,
 * gate 3 checks the bound Role's rule, and gate 4 is PodSecurity. A mutating sleeve beside
 * the rail fills defaults before gate 4 reads the object. Only a cartridge that clears every
 * gate drops into the etcd tray. Physical order is explanatory, not a claim about how the
 * API server schedules its plugins.
 * Purposeful parts: 01–04 feet; 05 bed; 06 bed groove; 07–10 bed screws; 11 label plate;
 * 12–13 label rivets; 14 track floor; 15–16 rails with 17–20 rail screws; 21–22 rail ends;
 * 23–26 gate posts (each gate); 27 bridge with screws; 28 blade; 29 blade seam; 30–31 blade pads;
 * 32 mutating sleeve base; 33 sleeve lamp; 34 default tabs; 35–36 etcd tray floor and walls;
 * 37 etcd front wall; 38 ruler strip with ticks; 39 request cartridge shell; 40 cartridge lid;
 * 41–42 cartridge handle posts; 43–46 cartridge feet.
 */
const bed = { x: -176, y: -62, w: 356, d: 124, r: 8 };
export const P = k.fitProjection(k.boxCorners(bed, -16, 90), 760, 420, { pad: 12, azimuth: 35, elevation: 32 });
/** Canvas tight around the machine's projected box, so the scene fills the phone width instead of floating in empty space. */
export const viewBox = (() => {
  const flat = k.boxCorners(bed, -16, 90).map((point) => k.iso(point, P));
  const xs = flat.map(([x]) => x);
  const ys = flat.map(([, y]) => y);
  const pad = 10;
  const left = Math.min(...xs) - pad;
  const top = Math.min(...ys) - pad;
  return `${left} ${top} ${Math.max(...xs) - left + pad} ${Math.max(...ys) - top + pad}`;
})();

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone, lit });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, 0.7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: 0.45 });
};

/** Gate x positions along the rail. The request stops in front of the first gate it cannot clear. */
export const gateX = { authn: -118, binding: -64, rule: -10, validate: 84 } as const;
export const startX = -150;
export const sleeveX = 34;
export const trayX = 148;
export const stopBefore = (x: number) => x - 24;

export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 18).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  const label = rect(-164, -56, 70, 11, 2);
  out.push(S(label, 0, 1, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(label, 2), 1, P), { tone: 'faint' }),
    k.faceTextSvg(k.topMatrix([-160, -51], 1.1, P), 'REQUEST PATH', { size: 6, tone: 'mid' }));
  Object.values(gateX).forEach((gate, index) => out.push(k.faceTextSvg(k.topMatrix([gate - 2, 48], 1.1, P), String(index + 1), { size: 16, tone: 'mid' })));
  out.push(k.faceTextSvg(k.topMatrix([50, 48], 1.1, P), 'M', { size: 16, tone: 'mid' }), k.faceTextSvg(k.topMatrix([132, 40], 1.1, P), 'ETCD', { size: 12, tone: 'mid' }));
  return out.join('');
})();

export const floor = (() => {
  const out: string[] = [];
  const track = rect(-164, -26, 288, 52);
  out.push(S(track, 0, 2, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(track, 3), 2, P), { tone: 'faint' }));
  for (const y of [-30, 26]) {
    const rail = rect(-164, y, 288, 4);
    out.push(S(rail, 2, 4), screws(rect(-164, y, 6, 4), 6), screws(rect(118, y, 6, 4), 6));
  }
  const ticks = k.topTicks(-160, 120, 8, 5, 52, 1, [2, 4], P);
  out.push(S(rect(-160, 50, 280, 5), 0, 1, 'lo'), k.lineSvg(ticks.minor, { tone: 'faint' }), k.lineSvg(ticks.major, { tone: 'lo' }));
  return out.join('');
})();

/** Back half of a gate: its posts on the far rail side. */
export function gateBack(x: number): string {
  const post = rect(x - 5, -36, 10, 6);
  return S(post, 2, 5) + S(rect(x - 3, -35, 6, 4), 7, 72);
}

/** Front half of a gate: posts on the near side and the bridge that the blade lifts beneath. */
export function gateFront(x: number): string {
  const post = rect(x - 5, 28, 10, 6);
  const bridge = rect(x - 4, -34, 8, 68);
  return S(post, 2, 5) + S(rect(x - 3, 29, 6, 4), 7, 72) + S(bridge, 79, 7) + screws(bridge, 86);
}

/** The blade lifts through the bridge's gap; its seam and pads sit on its own faces. */
export function gateBlade(x: number): string {
  const plan = rect(x - 3, -26, 6, 52);
  return S(plan, 6, 26, 'hi') + k.lineSvg(k.sideSeam(plan, 30, P, 4), { tone: 'faint' }) +
    S(rect(x - 4, -27, 8, 3), 6, 27) + S(rect(x - 4, 24, 8, 3), 6, 27);
}

/** The etcd tray at the end of the rail: floor and back wall go behind the cartridge. */
export const trayBack = (() => {
  const tray = rect(trayX - 20, -26, 40, 52);
  return S(tray, 0, 3, 'lo') + S(rect(trayX - 20, -26, 40, 4), 3, 18) + S(rect(trayX - 20, -26, 4, 52), 3, 18);
})();
export const trayFront = (() => {
  const wall = rect(trayX - 20, 22, 40, 4);
  return S(wall, 3, 18) + k.lineSvg(k.planOutline(k.insetPlan(wall, 1), 21, P), { tone: 'faint' });
})();

/** Mutating sleeve beside the rail: a base block, default tabs and a lamp. */
export const sleeve = (() => {
  const block = rect(sleeveX - 12, 40, 24, 12);
  const tabs = [-8, -3, 2, 7].map((dx) => S(rect(sleeveX + dx, 44, 3, 4), 6, 3, 'mid')).join('');
  return S(block, 0, 6, 'lo') + tabs + screws(block, 6);
})();
export const lamp = {
  off: S(rect(sleeveX - 4, 41, 8, 6), 6, 3, 'lo'),
  on: S(rect(sleeveX - 4, 41, 8, 6), 6, 3, 'hi', true),
};

/** The request cartridge, built at its origin and moved along the rail. */
export const cartridge = (() => {
  const out = [S(rect(-17, -14, 34, 28, 2), 4, 3)];
  for (const x of [-16, 10]) for (const dy of [-17, 13]) out.push(S(rect(x, dy, 6, 4), 2, 3));
  out.push(S(rect(-14, -11, 28, 22, 2), 7, 12, 'hi', true));
  const lid = rect(-14, -11, 28, 22, 2);
  out.push(S(lid, 19, 2, 'hi'), k.lineSvg(k.planOutline(k.insetPlan(lid, 2), 21, P), { tone: 'faint' }), screws(lid, 21));
  for (const x of [-9, 7]) out.push(S(rect(x, -2, 2, 4), 21, 4));
  out.push(S(rect(-9, -2, 18, 4), 25, 2));
  for (const dy of [-7, 0, 7]) out.push(k.lineSvg(k.planOutline(rect(-10, dy - 1, 20, 2), 21, P), { tone: 'lo' }));
  return out.join('');
})();

export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);
/** Symbol on the clear floor strip beside each gate number, in front of the posts. Glyphs ascend toward -y, so a baseline at y 48 keeps them between the rail (y 30) and the ruler (y 50). */
export const stateMark = (x: number, symbol: string) => k.faceTextSvg(k.topMatrix([x + 12, 48], 1.1, P), symbol, { size: 16, tone: 'hi' });
