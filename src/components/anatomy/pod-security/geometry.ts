import * as k from '@/lib/anatomy/vendor/iso-kit';
import { capsView, modes, noNewPrivs, seccompEffective, type ImageUser, type Level, type Mode, type Namespace, type Spec } from './model';

/** Concept → mechanism: an admission tollgate over a request rail, a registry with a key socket and image block,
 * and a node with two cradles. The Pod is a large cartridge whose fittings light only when the runtime has applied
 * them. Purposeful parts: stage plate and halo; tollgate posts, header beam and three labelled knobs whose height is
 * that mode's level; a latch that rises only when a Pod was admitted; a request rail; a registry block with a key
 * socket and key; an image block with a USER dial; a node outline and two cradles; per Pod a body, four labelled
 * tile plates (UID dial, no_new_privs, seccomp, privileged), three capability tiles and a read-only root shutter,
 * plus an emptyDir block beside the body. Physical placement shows what the object is; it is not a claim about
 * kubelet internals.
 */
const stage: k.Plan = { x: -320, y: -150, w: 660, d: 300, r: 12 };
export const projection = k.fitProjection(k.boxCorners(stage, -14, 120), 760, 400, { pad: 14, azimuth: 36, elevation: 30 });

const box = (plan: k.Plan, z: number, height: number, tone: k.Tone = 'mid', lit = false) =>
  k.solidSvg(k.slabOf(plan, z, height, projection, 5, 0.6), { tone, lit });
const text = (point: k.Point3, label: string, cls: string, anchor = 'middle') => {
  const [x, y] = k.iso(point, projection);
  return `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${label}</text>`;
};

export type Vec = [number, number, number];
export interface Origin { x: number; y: number; z: number }
/** Cartridge origins are the cartridge's min corner. The request rests on the rail; the agent sits in bay A on the gate side,
 * so the admitted request crosses no other Pod on its way in. The legacy Pod stays in bay B. */
export const RAIL: Origin = { x: -300, y: -40, z: 0 };
export const GATE_FRONT: Origin = { x: -280, y: -40, z: 0 };
export const BAY_AGENT: Origin = { x: 34, y: -76, z: 4 };
export const BAY_LEGACY: Origin = { x: 194, y: -76, z: 4 };
export const IMAGE_REGISTRY: Origin = { x: -112, y: 86, z: 40 };
export const IMAGE_TRAY: Origin = { x: 42, y: 36, z: 3 };

/** Displacement from where an object is drawn to a target origin. Poses are interpolated in this vector form. */
export const offset = (from: Origin, to: Origin): Vec => [to.x - from.x, to.y - from.y, to.z - from.z];
/** Screen translate for a displacement vector. */
export const translateBy = (by: Vec) => k.translateAlong(projection, by);

const posts: k.Plan[] = [{ x: -250, y: -124, w: 12, d: 12, r: 2 }, { x: -250, y: 112, w: 12, d: 12, r: 2 }];
const header: k.Plan = { x: -250, y: -124, w: 12, d: 236, r: 2 };
const rail: k.Plan = { x: -308, y: -48, w: 100, d: 96, r: 3 };
const latchPlan: k.Plan = { x: -192, y: -86, w: 8, d: 172, r: 2 };
const registry: k.Plan = { x: -130, y: 70, w: 76, d: 60, r: 4 };
const node: k.Plan = { x: -30, y: -130, w: 350, d: 270, r: 10 };
const bayA: k.Plan = { x: 10, y: -100, w: 128, d: 128, r: 6 };
const bayB: k.Plan = { x: 170, y: -100, w: 128, d: 128, r: 6 };
const tray: k.Plan = { x: 30, y: 34, w: 80, d: 22, r: 2 };
const knobY: Record<Mode, number> = { enforce: -90, audit: 0, warn: 90 };
const knobHeight: Record<Level, number> = { none: 4, privileged: 14, baseline: 26, restricted: 40 };

export const chassis = [
  `<path class="iso-halo" d="${k.haloOf(stage, -14, 4, projection)}"/>`,
  box(stage, -14, 14, 'lo'),
  ...posts.map((post) => box(post, 0, 110, 'mid')),
  box(header, 96, 14, 'mid'),
  k.lineSvg(k.planOutline(node, 0, projection), { tone: 'lo' }),
  box(registry, 0, 40, 'mid'),
  box({ x: -118, y: 112, w: 12, d: 8, r: 1 }, 40, 2, 'lo'),
  box(rail, 0, 2, 'lo'),
  box(bayA, 0, 4, 'lo'),
  box(bayB, 0, 4, 'lo'),
  box(tray, 0, 3, 'lo'),
].join('');

/** Zone captions are a top layer, drawn after every part, with a halo, so no part can strike through them. */
export const zoneLabels = [
  text([-262, -146, 156], 'API admission', 'ps-zone'),
  text([-326, -62, 0], 'request', 'ps-zone', 'start'),
  text([-96, 142, 0], 'registry', 'ps-zone'),
  text([-16, -134, 14], 'node-a', 'ps-zone', 'start'),
].join('');

/** Three knobs on the header, each labelled with its mode and level. Height is the level; none is the flat stub. */
export function gateArt(ns: Namespace): string {
  return modes.map((mode) => {
    const y = knobY[mode];
    const level = ns[mode];
    return box({ x: -248, y: y - 6, w: 10, d: 12, r: 1 }, 110, knobHeight[level], 'hi') +
      text([-230, y, 166], mode, 'ps-knob', 'start') +
      text([-230, y, 152], level, 'ps-knob ps-knob-level', 'start');
  }).join('');
}

/** The latch rises only when a Pod was admitted, so a refused request stays in front of it. */
export function latchArt(raised: boolean): string {
  return raised ? box(latchPlan, 74, 6, 'hi') : box(latchPlan, 0, 64, 'hi');
}

/** The key sits in the socket only when the Pod that would pull carries an imagePullSecret. */
export function registryArt(keyInSocket: boolean): string {
  return keyInSocket ? box({ x: -117, y: 113, w: 10, d: 6, r: 1 }, 42, 6, 'hi', true) : '';
}

/** The image block sits on the registry, and its USER dial points left for root and right for UID 1000. */
export function imageArt(imageUser: ImageUser): string {
  const { x, y, z } = IMAGE_REGISTRY;
  const dial: k.Plan = { x: x + 4, y: y + 4, w: 7, d: 7, r: 2 };
  const centre = k.iso([x + 7.5, y + 7.5, z + 14], projection);
  const tip = k.iso([x + 7.5 + (imageUser === '0' ? -3 : 3), y + 7.5, z + 14], projection);
  return box({ x, y, w: 24, d: 24, r: 3 }, z, 12, 'hi') + box(dial, z + 12, 2, 'mid') +
    k.lineSvg(`M${centre[0]} ${centre[1]}L${tip[0]} ${tip[1]}`, { tone: 'hi' });
}

/** A Pod cartridge at an origin. Tiles light only when the runtime has applied the setting; the readout names each tile. */
export function cellArt(name: string, uid: number, spec: Spec, running: boolean, o: Origin): string {
  const at = (dx: number, dy: number, w: number, d: number, r = 1): k.Plan => ({ x: o.x + dx, y: o.y + dy, w, d, r });
  const top = o.z + 56;
  const caps = capsView(spec.caps);
  const parts = [box(at(0, 0, 80, 80, 4), o.z, 56, 'hi', running)];
  parts.push(box(at(8, 10, 22, 12, 2), top, 3, 'mid'));
  if (running) {
    const centre = k.iso([o.x + 19, o.y + 16, top + 3], projection);
    const tip = k.iso([o.x + 19 + (uid === 0 ? -6 : 6), o.y + 16, top + 3], projection);
    parts.push(k.lineSvg(`M${centre[0]} ${centre[1]}L${tip[0]} ${tip[1]}`, { tone: 'hi' }));
  }
  parts.push(box(at(42, 10, 22, 12, 2), top, 3, 'mid', running && noNewPrivs(spec)));
  parts.push(box(at(8, 30, 22, 12, 2), top, 2, 'mid', running && seccompEffective(spec) === 'RuntimeDefault'));
  parts.push(box(at(42, 30, 22, 12, 2), top, 2, 'mid', running && spec.privileged));
  parts.push(box(at(8, 52, 18, 6, 1), top, 2, 'mid', running && caps.defaultSet));
  parts.push(box(at(31, 52, 18, 6, 1), top, 2, 'mid', running && caps.allDropped));
  parts.push(box(at(54, 52, 18, 6, 1), top, 2, 'mid', running && caps.extra !== null));
  parts.push(box(at(8, 71, 64, 5, 1), top, 1, 'mid', running && spec.readOnlyRootFilesystem));
  if (spec.emptyDirCache) parts.push(box(at(84, 24, 12, 12, 2), o.z, 6, 'hi'));
  parts.push(text([o.x + 40, o.y + 102, o.z], `${name}${uid > 0 ? ` #${uid}` : ''}`, 'ps-id'));
  return parts.join('');
}
