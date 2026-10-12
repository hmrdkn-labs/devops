import * as k from '@/lib/anatomy/vendor/iso-kit';
import { CLUSTER_IP, PODS } from './model';

/** Concept → mechanism: a switchboard bench for one namespace, framed to its own parts.
 * Rear left: the resolver drawer, four notches for the four candidates in order.
 * Centre: Service web with one jack per Pod, and the billing Service for ledger.
 * Right: one bin per Pod, each with a Ready lamp. Front left: the edge gate with
 * three lamps (controller, rule, TLS) and a door. Cords join the parts they connect;
 * a cord lights when the request card has passed along it. The accent card is the request.
 */
export const WIDTH = 600;
export const HEIGHT = 340;

export type SegId = 'drawer-web' | 'drawer-billing' | 'web-pod1' | 'web-pod2' | 'outside-gate' | 'gate-web';
export const SEG_IDS: SegId[] = ['drawer-web', 'drawer-billing', 'web-pod1', 'web-pod2', 'outside-gate', 'gate-web'];

/** Notch x positions; the notch numbers are engraved at the same x. */
export const NOTCH_X = [-155, -146, -137, -128];

/** A caption in world units, placed in clear space beside its object. `size` is the font size in viewBox units;
 * `anchor` is where the text is pinned: its middle, its start, or its end. */
export interface Caption { text: string; at: k.Point3; anchor: 'middle' | 'start' | 'end'; size: number }

const rect = (x: number, y: number, w: number, d: number, r = 1): k.Plan => ({ x, y, w, d, r });
const PLATE = rect(-180, -124, 352, 244, 10);
const DRAWER = rect(-160, -104, 42, 38, 2);
const BILLING = rect(-40, -108, 48, 28, 3);
const WEB = rect(-40, -44, 48, 52, 3);
const BIN1 = rect(84, -52, 40, 38, 3);
const BIN2 = rect(84, 14, 40, 38, 3);
const GATE = rect(-152, 44, 42, 36, 3);
const PAD = rect(-188, 100, 42, 20, 3);
const TOKEN_BODY = rect(-11, -8, 22, 16, 2);
const TOKEN_LID = rect(-8, -5.5, 16, 11, 1.5);

/** Identity labels, placed in clear space beside the object they name. */
export const CAPTIONS: Caption[] = [
  { text: `web · ${CLUSTER_IP.web}:80`, at: [-16, -50, 46], anchor: 'middle', size: 10 },
  { text: 'ledger · billing', at: [-16, -118, 36], anchor: 'middle', size: 10 },
  { text: PODS[0], at: [104, -66, 30], anchor: 'middle', size: 10 },
  { text: PODS[1], at: [104, 64, 26], anchor: 'middle', size: 10 },
  { text: 'edge-proxy', at: [-131, 22, 50], anchor: 'middle', size: 10 },
  { text: 'resolver · shop', at: [-166, -104, 27], anchor: 'end', size: 10 },
  { text: 'public DNS', at: [-150, 124, 0], anchor: 'middle', size: 10 },
];
/** Notch numbers, engraved on the drawer's front face at each notch's x: below the top edge, above the pull. */
export const NUMBERS: Caption[] = NOTCH_X.map((x, index) => ({ text: String(index + 1), at: [x, -66.3, 19.5], anchor: 'middle', size: 7 }));

export const LAMP = {
  dns: [-184, 104, 13.6] as k.Point3,
  notches: NOTCH_X.map((x) => [x, -70.5, 28.8] as k.Point3),
  serviceWeb: [-34, -6, 31] as k.Point3,
  jacks: [[-26, 1, 31.9], [-10, 1, 31.9]] as k.Point3[],
  bins: [[116, -44, 22.7], [116, 20, 22.7]] as k.Point3[],
  /** controller, rule, TLS: in the order the external run checks them. */
  gate: [[-144, 48, 34.7], [-131, 48, 34.7], [-118, 48, 34.7]] as k.Point3[],
};

/** Fit to every corner and caption anchor, so the machine fills the frame and nothing is cropped. */
export const P = k.fitProjection(
  [...k.boxCorners(PLATE, 0, 12), ...k.boxCorners(PAD, 0, 13), ...k.boxCorners(GATE, 0, 36), ...CAPTIONS.map((caption) => caption.at)],
  WIDTH, HEIGHT, { pad: 14, headroom: 14, azimuth: 35, elevation: 30 },
);

const S = (plan: k.Plan, z: number, h: number, tone: k.Tone = 'mid', lit = false, bevel = 0.6) =>
  k.solidSvg(k.slabOf(plan, z, h, P, 4, bevel), { tone, lit });
const outline = (plan: k.Plan, z: number) => k.lineSvg(k.planOutline(plan, z, P), { tone: 'faint' });
const port = (at: k.Point3) => k.dotsSvg([k.iso(at, P)], { size: 1.3, tone: 'lo' });

export const base = `<path class="iso-halo" d="${k.haloOf(PLATE, -4, 6, P)}"/>` +
  S(PLATE, 0, 10, 'lo') + outline(k.insetPlan(PLATE, 6), 10);

export const outside = S(PAD, 10, 3, 'lo') + outline(k.insetPlan(PAD, 3), 13) + port([-154, 116, 13.8]);

export const drawer = S(DRAWER, 10, 18, 'mid') + outline(k.insetPlan(DRAWER, 4), 28) +
  NOTCH_X.map((x) => S(rect(x - 2.5, -73, 5, 5, 1), 28, 0.6, 'lo', false, 0)).join('') +
  S(rect(-150, -67, 22, 1.4, 0.6), 13, 4, 'hi', false, 0) + port([-120, -80, 28.8]);

export const billing = S(BILLING, 10, 14, 'mid') + outline(k.insetPlan(BILLING, 4), 24) +
  S(rect(-36, -104, 40, 12, 1), 24, 0.8, 'lo', false, 0) + port([-30, -100, 24.9]);

export const web = S(WEB, 10, 20, 'mid') + S(rect(-36, -40, 40, 16, 1), 30, 0.8, 'lo', false, 0) +
  S(rect(-30, -2, 8, 6, 1), 30, 1.6, 'lo', false, 0) + S(rect(-14, -2, 8, 6, 1), 30, 1.6, 'lo', false, 0) +
  port([-30, -30, 30.9]) + port([-24, 8.2, 18]);

export const bins = [BIN1, BIN2].map((plan) => S(plan, 10, 12, 'mid') + outline(k.insetPlan(plan, 5), 22)).join('') +
  port([88, -30, 22.8]) + port([88, 40, 22.8]);

export const gate = S(GATE, 10, 24, 'mid') + outline(k.insetPlan(GATE, 4), 34) +
  S(rect(-146, 80, 30, 1.2, 0.6), 12, 18, 'hi', false, 0.2) + S(rect(-124, 81.2, 4, 2, 0.6), 19, 3, 'hi', false, 0.2) +
  port([-150, 70, 34.9]) + port([-112, 52, 34.9]);

/** The request card, built at the origin with its underside on z = 0 and moved by translation. */
export const token = S(TOKEN_BODY, 0, 5, 'hi', true) + S(TOKEN_LID, 5, 1.6, 'hi', true, 0) + outline(TOKEN_LID, 6.6);

/** Cords from port to port, with the one arch each needs to clear the parts beneath it. */
const CORDS: Record<SegId, [k.Point3, k.Point3, k.Point3]> = {
  'drawer-web': [[-120, -80, 28.8], [-78, -62, 46], [-30, -30, 30.9]],
  'drawer-billing': [[-120, -80, 28.8], [-75, -102, 46], [-30, -100, 25]],
  'web-pod1': [[-26, 1, 31.9], [30, -8, 50], [88, -30, 22.8]],
  'web-pod2': [[-10, 1, 31.9], [30, 22, 50], [88, 40, 22.8]],
  'outside-gate': [[-154, 116, 13.8], [-150, 94, 46], [-150, 70, 34.9]],
  'gate-web': [[-112, 52, 34.9], [-72, 30, 50], [-24, 8.2, 18]],
};
const cordsIn = (tone: k.LineTone) => {
  const out = {} as Record<SegId, string>;
  for (const id of SEG_IDS) {
    const [from, via, to] = CORDS[id];
    out[id] = k.wireSvg(k.iso(from, P), k.iso(to, P), { via: [k.iso(via, P)], tone });
  }
  return out;
};
/** Resting cords (dim) and the same cords as accent overlays, shown only once the card has passed them. */
export const cordBase = cordsIn('lo');
export const cordLit = cordsIn('lit');

export const move = (x: number, y: number, z: number) => k.translateAlong(P, [x, y, z]);
