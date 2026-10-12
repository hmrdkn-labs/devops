import { CART_Z, LANE_Y, locate, PLACE_X, view, X } from './geometry';
import { activeVolume, CLAIM_NAME, rowsOf, sceneOf, type State, type Zone } from './model';

/**
 * HTML identity tags placed beside the parts they name. Each tag is anchored to a world point on
 * its part; `align` says which side of that anchor the tag extends into, as in the config-secrets page.
 * A tag's text may have line breaks.
 */
export type Align = 'start' | 'center' | 'end';
export type Point = [number, number, number];
export interface StageTag { id: string; text: string; point: Point; align: Align }

/** Pixel estimate for overlap checks: monospace text at about 11.5px, 8px side padding, 14.5px per line. */
const CHAR_PX = 7.2;
const PAD_PX = 8;
const LINE_PX = 14.5;
const BOX_PAD_PX = 8;
const GAP_PX = 3;

/** Anchor heights (world z). The gate tag floats above its gate; the others sit beside the part they name. */
const GATE_Z = 70;
const POD_Z = CART_Z + 34;

/** The Pod tag follows the cart: it is anchored above the cart at the given x in the given lane. */
export function podPoint(x: number, zone: Zone): Point {
  return [x, LANE_Y[zone], POD_Z];
}

/** Gate state, named with the rule behind it: a gate is closed to a zone that the bound volume is not in. */
export function gateText(zone: Zone, state: State): string {
  const scene = sceneOf(state);
  const volume = activeVolume(state);
  if (!scene.gateOpen[zone]) return `zone ${zone} · closed\nvolume is in zone ${volume?.zone}`;
  return `zone ${zone} · open\n${volume ? 'volume here' : 'no volume yet'}`;
}

/** Every tag that names something visible in the given state. Each zone's gate tag always shows. */
export function stageTags(state: State): StageTag[] {
  const scene = sceneOf(state);
  const zones: Zone[] = ['a', 'b'];
  const tags: StageTag[] = [];
  for (const zone of zones) {
    tags.push({ id: `gate-${zone}`, text: gateText(zone, state), point: [X.gate, LANE_Y[zone], GATE_Z], align: 'start' });
  }
  if (state.claim) tags.push({ id: 'claim', text: `PVC ${CLAIM_NAME}`, point: [-126, 0, 12], align: 'end' });
  const volume = activeVolume(state);
  if (volume) tags.push({ id: 'volume', text: `PV ${volume.name}\n${rowsOf(volume.rows)}`, point: [113, LANE_Y[volume.zone], 12], align: 'start' });
  const pod = scene.pod;
  if (pod) tags.push({ id: 'pod', text: `Pod ${pod.name}`, point: podPoint(PLACE_X[pod.place], pod.zone), align: pod.place === 'parking' ? 'end' : 'center' });
  return tags;
}

/** Stage position as a percentage of the SVG box, as CSS left/top. */
export function tagPosition(point: Point): { left: string; top: string } {
  const { left, top } = locate(point);
  return { left: `${left}%`, top: `${top}%` };
}

/** Estimated box of a tag, in CSS pixels, for a stage that is `stagePx` wide. */
export function tagBox(tag: StageTag, stagePx: number) {
  const { left, top } = locate(tag.point);
  const x = (left / 100) * stagePx;
  const y = (top / 100) * (stagePx * view.h / view.w);
  const lines = tag.text.split('\n');
  const width = Math.max(...lines.map((line) => line.length)) * CHAR_PX + 2 * PAD_PX;
  const height = lines.length * LINE_PX + BOX_PAD_PX;
  const start = tag.align === 'start' ? x : tag.align === 'end' ? x - width : x - width / 2;
  return { left: start - GAP_PX, right: start + width + GAP_PX, top: y - height / 2 - GAP_PX, bottom: y + height / 2 + GAP_PX };
}

/** Pairs of tag ids whose estimated boxes intersect on a stage `stagePx` wide. */
export function overlappingTags(state: State, stagePx: number): Array<[string, string]> {
  const boxed = stageTags(state).map((tag) => ({ id: tag.id, box: tagBox(tag, stagePx) }));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < boxed.length; i++) {
    for (let j = i + 1; j < boxed.length; j++) {
      const a = boxed[i]!.box;
      const b = boxed[j]!.box;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) pairs.push([boxed[i]!.id, boxed[j]!.id]);
    }
  }
  return pairs;
}
