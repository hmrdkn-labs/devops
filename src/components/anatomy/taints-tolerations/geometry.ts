import * as k from '@/lib/anatomy/vendor/iso-kit';

/** Concept → mechanism: two parallel inspection lanes represent candidate nodes.
 * The first lift gate tests a NoSchedule taint; the second independently tests
 * requested CPU. A cartridge travels only after both gates have cleared. The
 * alternate lane can win a fixed illustrative score without any toleration bonus.
 * Physical order is explanatory, not a claim about scheduler plugin order.
 * Purposeful parts (each lane duplicates 15–40):
 * 01 bedplate; 02–05 feet; 06 rim groove; 07–10 bed screws;
 * 11 identity plate; 12 plate inset; 13–14 plate rivets;
 * 15–16 guide rails; 17–20 rail mounting screws; 21 entry stop;
 * 22 exit stop; 23–24 stop screws; 25 receiving tray floor;
 * 26–27 tray cheeks; 28 tray end wall; 29–30 taint gate shoes;
 * 31–32 taint pillars; 33 taint bridge; 34 lift blade;
 * 35–36 blade end pads; 37 blade seam; 38–39 bridge fasteners;
 * 40–41 capacity gate shoes; 42–43 capacity pillars;
 * 44 capacity bridge; 45 capacity blade; 46–47 blade end pads;
 * 48 blade seam; 49–50 bridge fasteners; 51 ruler strip;
 * 52 ruler ticks; 53 carriage floor; 54–57 carriage bearing blocks;
 * 58 cartridge shell; 59 cartridge lid; 60 lid gasket;
 * 61–64 lid screws; 65–66 handle mounts; 67 handle bridge;
 * 68–70 cartridge vent slots. No decorative cables or floating apparatus.
 */
const bed = { x: -142, y: -91, w: 288, d: 184, r: 8 };
export const P = k.fitProjection(k.boxCorners(bed, -16, 100), 720, 430, { pad: 30, azimuth: 35, elevation: 32 });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, .6), { tone, lit });
const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const screws = (plan: k.Plan, z: number) => {
  const points = k.corners(plan, Math.min(3, plan.w / 3, plan.d / 3));
  return k.lineSvg(points.map(([x, y]) => k.ring(x, y, .7, z, P, 16)).join(''), { tone: 'lo' }) +
    k.dotsSvg(points.map(([x, y]) => k.iso([x, y, z], P)), { size: .45 });
};
export const base = (() => {
  const out: string[] = [`<path class="iso-halo" d="${k.haloOf(bed, -16, 10, P)}"/>`];
  const feet = k.corners(bed, 20).sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) out.push(S(rect(x - 6, y - 6, 12, 12, 3), -16, 6, 'lo'));
  out.push(S(bed, -10, 10, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(bed, 5), 0, P), { tone: 'faint' }), screws(bed, 0));
  const label = rect(-124, 72, 83, 12, 2);
  out.push(S(label, 0, 1, 'lo'), k.lineSvg(k.planOutline(k.insetPlan(label, 2), 1, P), { tone: 'faint' }),
    k.faceTextSvg(k.topMatrix([-119, 79], 1.1, P), 'PLACEMENT / 04', { size: 3, tone: 'mid' }));
  return out.join('');
})();
export const laneY = [-43, 38];
export function laneFloor(y: number): string {
  const out: string[] = [];
  for (const offset of [-17, 13]) {
    const rail = rect(-126, y + offset, 254, 4);
    out.push(S(rail, 0, 4), screws(rail, 4));
  }
  for (const x of [-131, 128]) out.push(S(rect(x, y - 21, 5, 42), 0, 8), screws(rect(x, y - 21, 5, 42), 8));
  out.push(S(rect(75, y - 20, 50, 40, 2), 4, 2, 'lo'));
  for (const offset of [-20, 18]) out.push(S(rect(75, y + offset, 50, 2), 6, 4));
  out.push(S(rect(123, y - 18, 2, 36), 6, 4));
  const strip = rect(-120, y + 23, 240, 6);
  const ticks = k.topTicks(-116, 116, 8, 5, y + 23, 1, [2, 4], P);
  out.push(S(strip, 0, 1, 'lo'), k.lineSvg(ticks.minor, { tone: 'faint' }), k.lineSvg(ticks.major, { tone: 'lo' }));
  return out.join('');
}
export function frame(y: number, x: number, near: boolean): string {
  const out: string[] = [];
  const side = near ? 22 : -28;
  out.push(S(rect(x - 6, y + side, 12, 6), 0, 5), S(rect(x - 3, y + side + 1, 6, 4), 5, 78));
  if (near) {
    const bridge = rect(x - 4, y - 27, 8, 54);
    out.push(S(bridge, 83, 7), screws(bridge, 90));
  }
  return out.join('');
}
export function blade(y: number, x: number): string {
  const plan = rect(x - 3, y - 21, 6, 42);
  return S(plan, 10, 26, 'hi') + k.lineSvg(k.sideSeam(plan, 32, P, 4), { tone: 'faint' }) +
    S(rect(x - 4, y - 22, 8, 3), 10, 27) + S(rect(x - 4, y + 19, 8, 3), 10, 27);
}
export function cartridge(y: number): string {
  const out = [S(rect(-17, y - 14, 34, 28, 2), 7, 3)];
  for (const x of [-16, 10]) for (const dy of [-17, 13]) out.push(S(rect(x, y + dy, 6, 4), 4, 3));
  out.push(S(rect(-14, y - 11, 28, 22, 2), 10, 18, 'hi', true));
  const lid = rect(-14, y - 11, 28, 22, 2);
  out.push(S(lid, 28, 2, 'hi'), k.lineSvg(k.planOutline(k.insetPlan(lid, 2), 30, P), { tone: 'faint' }), screws(lid, 30));
  for (const x of [-9, 7]) out.push(S(rect(x, y - 2, 2, 4), 30, 4));
  out.push(S(rect(-9, y - 2, 18, 4), 34, 2));
  for (const dy of [-7, 0, 7]) out.push(k.lineSvg(k.planOutline(rect(-10, y + dy - 1, 20, 2), 30, P), { tone: 'lo' }));
  return out.join('');
}
export const move = (x: number, y = 0, z = 0) => k.translateAlong(P, [x, y, z]);
