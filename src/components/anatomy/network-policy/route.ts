import { flows, hatchOfGate, POD_PORT, type Hatch, type Verdict } from './model';

export type Height = 'hover' | 'stop' | 'seat';
export type Station = Hatch | 'tower';

/** One keyframe of the cartridge: move to a station, then sit at a height. */
export interface RouteKey {
  at: Station;
  height: Height;
  /** Port label shown on the cartridge once this keyframe is reached. */
  label?: string;
  /** Cartridge enters the destination Pod and is no longer drawn. */
  hide?: boolean;
}

/** The gate that dropped the request, if any, mapped to its hatch. */
function stopHatch(v: Verdict): Hatch | null {
  return v.stopped === null ? null : hatchOfGate[v.stopped];
}

/**
 * Where the cartridge goes. A dropped request stops above the hatch of the gate that dropped it,
 * so nothing downstream is visited. A Service-addressed request docks at the translator, which
 * rewrites the label from the Service port to the Pod port.
 */
export function routeFor(v: Verdict): RouteKey[] {
  const flow = flows[v.probe];
  const stop = stopHatch(v);
  const sourceStop = stop === flow.from;
  const keys: RouteKey[] = [{ at: flow.from, height: sourceStop ? 'stop' : 'seat' }];
  if (sourceStop) return keys;
  keys.push({ at: flow.from, height: 'hover' });
  if (flow.service) keys.push({ at: 'tower', height: 'hover', label: String(POD_PORT) });
  keys.push({ at: flow.to, height: 'hover' });
  keys.push({ at: flow.to, height: stop === flow.to ? 'stop' : 'seat', hide: v.delivered });
  return keys;
}

/** Hatches the cartridge is allowed through. Their lids lift only while the probe is moving. */
export function passingHatches(v: Verdict): Hatch[] {
  const flow = flows[v.probe];
  const stop = stopHatch(v);
  const passed: Hatch[] = [];
  if (stop !== flow.from) passed.push(flow.from);
  if (v.delivered) passed.push(flow.to);
  return passed;
}
