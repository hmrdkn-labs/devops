import * as k from '@/lib/anatomy/vendor/iso-kit';
import type { Waypoint } from './model';

/** Concept → mechanism: a two-node yard. Each node is a bay; a Pod is a cradle holding two container
 * cylinders under one shared network-namespace bar. The CNI wiring machine (spool) sits at the back of
 * the node and its veth cable runs to the node switch. kube-proxy is a rule board on a post above the
 * node switch, where node forwarding happens. The switches meet on a rail; a NetworkPolicy gate stands
 * across that rail and closes only when enforced.
 * Analogy limit: the bar is a shared namespace, not a physical part; the rail is not a route table.
 * Purposeful parts (about 75): base plate, four feet, outline and eight corner screws; per node a chassis
 * and seam, bay floor, four rims, wiring machine with spool and display plate, a switch with three port
 * dots, a kube-proxy post, board and three rule dots, and a capsule of floor, four walls with a port, two
 * containers, the shared bar, IP plate and ready lamp, plus a veth cable with two terminals. Across the
 * gap: a rail and a gate with two posts and a bar.
 */

export const W = 640;
export const H = 400;
export const plate: k.Plan = { x: -214, y: -88, w: 428, d: 176, r: 10 };
export const P = k.fitProjection(k.boxCorners(plate, -20, 80), W, H, { pad: 26, azimuth: 36, elevation: 30 });

const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, 0.6), { tone, lit });

/** Screen position as CSS percentages of the viewBox, for HTML tags that stay next to world objects. */
export function screenAt(point: k.Point3) {
  const [sx, sy] = k.iso(point, P);
  return { left: `${(sx / W) * 100}%`, top: `${(sy / H) * 100}%` };
}

/** World coordinates of each packet waypoint. Trails and the packet use the same points. */
export const waypoints: Record<Waypoint, k.Point3> = {
  start: [-142, -11, 32],
  'client-port': [-92, -16, 20],
  'kube-proxy': [-61, 28, 48],
  'switch-a': [-59, 37, 30],
  link: [-22, 36, 22],
  gate: [10, 34, 24],
  'switch-b': [59, 37, 30],
  'api-port': [80, -16, 20],
  api: [102, -11, 32],
};

const feet = k.corners(plate, 14);
export const base = [
  `<path class="iso-halo" d="${k.haloOf(plate, -20, 4, P)}"/>`,
  ...feet.map(([x, y]) => S(rect(x - 6, y - 6, 12, 12, 3), -20, 8, 'lo')),
  S(plate, -8, 8, 'lo'),
  k.lineSvg(k.planOutline(k.insetPlan(plate, 6), 0, P), { tone: 'faint' }),
  k.lineSvg(k.corners(plate, 10).map(([x, y]) => k.ring(x, y, 1.6, 0, P, 16)).join(''), { tone: 'lo' }),
  k.dotsSvg(k.corners(plate, 10).map(([x, y]) => k.iso([x, y, 0], P)), { size: 0.6 }),
].join('');

export interface Node {
  /** Behind the capsule: chassis, bay floor, back and left rims, wiring machine. */
  back: string;
  /** In front of the capsule: right and front rims, the switch, and the kube-proxy board on its post. */
  front: string;
  /** Wiring machine spool; the figure shows it only while the node's CNI plugin is installed. */
  spool: string;
  /** kube-proxy rule dots; the figure shows them only while kube-proxy runs on the node. */
  rules: string;
}

function node(chassis: k.Plan, switchX: number, spoolX: number): Node {
  const bay = rect(chassis.x + 12, -44, 136, 72, 4);
  const machine = rect(chassis.x + 14, -62, 36, 14, 3);
  const post = rect(switchX + 9, 27, 4, 4, 1);
  const board = rect(switchX + 2, 25, 26, 3, 0.8);
  const back = [
    S(chassis, 0, 14, 'mid'),
    k.lineSvg(k.planOutline(k.insetPlan(chassis, 4), 14, P), { tone: 'faint' }),
    S(bay, 14, 2, 'lo'),
    S(rect(bay.x, bay.y - 2, bay.w, 2, 1), 16, 8, 'mid'),
    S(rect(bay.x, bay.y, 2, bay.d, 1), 16, 8, 'mid'),
    S(machine, 14, 20, 'hi'),
    S(rect(machine.x + 4, -60, 28, 8, 1), 34, 1, 'lo'),
  ].join('');
  const front = [
    S(rect(bay.x + bay.w - 2, bay.y, 2, bay.d, 1), 16, 8, 'mid'),
    S(rect(bay.x, bay.y + bay.d, bay.w, 2, 1), 16, 8, 'mid'),
    S(rect(switchX, 24, 34, 26, 3), 14, 16, 'hi'),
    k.dotsSvg(k.pointsAt([[switchX + 8, 50, 22], [switchX + 17, 50, 22], [switchX + 26, 50, 22]], P), { size: 0.7 }),
    S(post, 30, 12, 'mid'),
    S(board, 42, 12, 'hi'),
  ].join('');
  const spool = k.solidSvg(k.cylinder(spoolX, -55, 6, 34, 4, P, 24, 0.3), { tone: 'mid' }) +
    k.lineSvg(k.ring(spoolX, -55, 6, 38, P, 24), { tone: 'lo' });
  const rules = k.dotsSvg(k.pointsAt([[switchX + 5, 28, 48], [switchX + 12, 28, 48], [switchX + 19, 28, 48]], P), { size: 0.8 });
  return { back, front, spool, rules };
}

export const nodeA = node(rect(-196, -68, 158, 132, 8), -76, -164);
export const nodeB = node(rect(38, -68, 158, 132, 8), 42, 70);

/** Pod capsule. `pre` sits behind the containers, `post` in front, `bar` above them, and the plate and lamp
 * are drawn last. The port sits on the wall facing its switch. */
export interface Capsule { pre: string; containers: string; post: string; plate: string; lamp: string; bar: string }

function capsule(cradle: k.Plan, side: 'left' | 'right'): Capsule {
  const { x, y, w, d } = cradle;
  const floor = S(cradle, 16, 4, 'mid');
  const backWall = S(rect(x, y, w, 3, 1), 20, 10, 'hi');
  const leftWall = S(rect(x, y, 3, d, 1), 20, 10, 'hi');
  const rightWall = S(rect(x + w - 3, y, 3, d, 1), 20, 10, 'hi');
  const frontWall = S(rect(x, y + d - 3, w, 3, 1), 20, 10, 'hi');
  const port = side === 'right' ? rect(x + w, y + 16, 4, 8, 1) : rect(x - 4, y + 16, 4, 8, 1);
  const portSvg = S(port, 18, 4, 'hi');
  const app = k.solidSvg(k.cylinder(x + 18, y + 25, 9.5, 20, 24, P, 24, 0.5), { tone: 'hi' });
  const sidecar = k.solidSvg(k.cylinder(x + 46, y + 25, 9.5, 20, 24, P, 24, 0.5), { tone: 'mid' });
  return {
    pre: [floor, backWall, leftWall, side === 'left' ? portSvg : ''].join(''),
    containers: app + sidecar,
    post: [rightWall, frontWall, side === 'right' ? portSvg : ''].join(''),
    plate: S(rect(x + 20, y + d, 24, 2, 0.5), 22, 7, 'mid'),
    lamp: k.dotsSvg(k.pointsAt([[x + 6, y + d, 26]], P), { size: 0.9, tone: 'hi' }),
    bar: S(rect(x + 4, y + 15, w - 8, 14, 2), 44, 4, 'hi', true),
  };
}

export const capsuleA = capsule(rect(-160, -36, 64, 50, 6), 'right');
export const capsuleB = capsule(rect(84, -36, 64, 50, 6), 'left');

/** Veth cables from each capsule port to its switch. The figure shows them once the Pod is networked. */
export const cableA = k.lineSvg(k.pathOf(k.pointsAt([[-92, -16, 20], [-60, -16, 20], [-60, 24, 24]], P)), { tone: 'hi' }) +
  k.dotsSvg(k.pointsAt([[-92, -16, 20], [-60, 24, 24]], P), { size: 0.8, tone: 'hi' });
export const cableB = k.lineSvg(k.pathOf(k.pointsAt([[80, -16, 20], [60, -16, 20], [60, 24, 24]], P)), { tone: 'hi' }) +
  k.dotsSvg(k.pointsAt([[80, -16, 20], [60, 24, 24]], P), { size: 0.8, tone: 'hi' });

/** Inter-node rail between the two switches. */
export const rail = S(rect(-42, 34, 84, 4, 1), 20, 4, 'mid');

/** Policy gate across the rail. The posts are fixed; the bar is drawn at z 0 and lifted to GATE_CLOSED or GATE_OPEN. */
export const gatePosts = S(rect(8, 20, 3, 3, 1), 14, 28, 'mid') + S(rect(8, 46, 3, 3, 1), 14, 28, 'mid');
export const gateBar = S(rect(7, 20, 5, 29, 1), 0, 4, 'hi');
export const GATE_CLOSED = 24;
export const GATE_OPEN = 40;
