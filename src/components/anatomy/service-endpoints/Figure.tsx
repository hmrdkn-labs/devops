import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import type * as k from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport, { type Change } from '../shared/ChangeReport';
import ManifestPanel from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import * as geo from './geometry';
import {
  EXPOSURES, NODE_PORT, SELECTORS, SERVICE, evaluate, forward, initialState, manifestLines, podSuffix,
  replacePod, setApp, setExposure, setReady, setSelector, type Evaluation, type Exposure, type FixtureState,
  type Marks, type PodApp, type PodRole, type PodState, type Selector,
} from './model';
import './figure.css';

const SLOTS = [0, 1, 2] as const;
const EASE_SECONDS = 0.18;
const REQUEST_SECONDS = 1.8;
const DIAL_LISTED_LENGTH = 0.85 * geo.DIAL.r;
const DIAL_REST_LENGTH = 0.35 * geo.DIAL.r;
// Booth suffix tags sit above each booth's top, at the booth x positions.
const podTags = SLOTS.map((slot) => geo.tagAt(geo.BOOTH_X[slot]!, 0, 38));

const initialReport: Change = {
  title: 'Fixture ready: 3 ready endpoints behind one Service',
  changed: 'Service web selects app=web; all 3 Pods are Ready and are ready endpoints; ClusterIP 10.96.40.12 is allocated.',
  actor: 'The API server allocated the ClusterIP; the EndpointSlice controller records each matching Pod as a ready endpoint.',
  reason: 'A Pod is an endpoint when its label matches the selector and its Ready condition is True.',
  notYet: 'No request has been sent, so no node forwarding rule has been exercised.',
};

const exposureText: Record<Exposure, string> = {
  ClusterIP: 'ClusterIP only',
  NodePort: `NodePort ${NODE_PORT}`,
  LoadBalancer: 'LoadBalancer · EXTERNAL-IP pending',
};

const roleLabel: Record<PodRole, string> = {
  ready: 'a ready endpoint (receives traffic)',
  'not-ready': 'recorded with ready=false (no traffic)',
  outside: 'not recorded in the EndpointSlice',
};
const roleBadge: Record<PodRole, { tone: BadgeTone; label: string }> = {
  ready: { tone: 'pass', label: 'Ready endpoint' },
  'not-ready': { tone: 'wait', label: 'In EndpointSlice, ready=false' },
  outside: { tone: 'info', label: 'Not in EndpointSlice' },
};
// EndpointSlice reading per roster slot, in the same words the slice uses (ready=true / ready=false / absent).
const sliceReading: Record<PodRole, string> = { ready: 'ready=true', 'not-ready': 'ready=false', outside: 'absent' };
const sliceSlat: Record<PodRole, string> = {
  ready: 'slat up: receives traffic',
  'not-ready': 'slat down: no traffic',
  outside: 'slat down: no traffic',
};

const exposureDetail: Record<Exposure, string> = {
  ClusterIP: 'type ClusterIP; the node port is removed.',
  NodePort: `type NodePort; node port ${NODE_PORT} is allocated and every node forwards it; ClusterIP unchanged.`,
  LoadBalancer: `type LoadBalancer; node port ${NODE_PORT} is allocated and a load balancer is requested; EXTERNAL-IP pending.`,
};
const exposureActor: Record<Exposure, string> = {
  ClusterIP: 'The API server releases the node port; kube-proxy stops programming it.',
  NodePort: 'The API server allocates the node port from the default range 30000-32767; kube-proxy on every node programs it.',
  LoadBalancer: 'The API server allocates the node port; the cloud-controller-manager asks the cloud provider for a load balancer.',
};
const exposureNotYet: Record<Exposure, string> = {
  ClusterIP: 'The ClusterIP is reachable from inside the cluster only.',
  NodePort: 'A NodePort is still layer 4 and does not route by host or path.',
  LoadBalancer: 'This fixture has no cloud controller, so no external address exists. A Service is not an HTTP router.',
};

function ease(at: number, target: number, dt: number, reduced: boolean): number {
  if (reduced) return target;
  const next = at + (target - at) * (1 - Math.exp(-dt / EASE_SECONDS));
  return Math.abs(next - target) < 0.02 ? target : next;
}

/** Position along a polyline of screen points, with t in [0, 1). */
function pointAlong(points: k.Flat[], t: number): k.Flat {
  const segments = points.length - 1;
  const scaled = Math.min(t, 0.999999) * segments;
  const index = Math.floor(scaled);
  const local = scaled - index;
  const [ax, ay] = points[index]!;
  const [bx, by] = points[index + 1]!;
  return [ax + (bx - ax) * local, ay + (by - ay) * local];
}

const nameOf = (state: FixtureState, slot: number) => state.pods[slot]!.name;
const endpointText = (evaluation: Evaluation, state: FixtureState) =>
  `${evaluation.listed.length} of ${state.pods.length} Pods are ready endpoints`;

function readyReport(after: FixtureState, slot: number, ready: boolean): Change {
  const name = nameOf(after, slot);
  const app = after.pods[slot]!.app;
  const count = endpointText(evaluate(after), after);
  if (app === after.selector && ready) {
    return {
      title: `Ready endpoint added: ${name}`,
      changed: `Ready=True; ${count}; ClusterIP unchanged.`,
      actor: 'kubelet sets Ready=True after the readiness probe succeeds; the EndpointSlice controller records the Pod as a ready endpoint.',
      reason: `The Pod matches app=${after.selector} and is Ready, so it is an endpoint.`,
      notYet: 'kube-proxy on each node forwards to it only after the EndpointSlice update reaches that node. The Pod was not restarted or moved.',
    };
  }
  if (app === after.selector) {
    return {
      title: `Endpoint not ready: ${name}`,
      changed: `Ready=False; ${count}; ${name} stays in the EndpointSlice with ready=false and keeps its name and IP.`,
      actor: 'kubelet reports the failing readiness probe; the EndpointSlice controller records the endpoint as not ready.',
      reason: `The Pod still matches app=${after.selector}, but Ready is False, so traffic must not go to it.`,
      notYet: `Running is not Ready: ${name} is still a running container. Forwarding stops only after the proxy rules are updated.`,
    };
  }
  return {
    title: `${ready ? 'Ready' : 'NotReady'} Pod is not an endpoint: ${name}`,
    changed: `Ready=${ready ? 'True' : 'False'}; ${count}; label app=${app} does not match app=${after.selector}.`,
    actor: 'kubelet sets the Ready condition; the EndpointSlice controller does not record a Pod whose labels do not match the selector.',
    reason: `The Service selects app=${after.selector}; a Pod needs that label and Ready=True to be an endpoint.`,
    notYet: 'Ready alone never adds a Pod to a Service: the label has to match too.',
  };
}

function labelReport(after: FixtureState, slot: number): Change {
  const name = nameOf(after, slot);
  const evaluation = evaluate(after);
  return {
    title: `Label changed to app=${after.pods[slot]!.app}: ${name}`,
    changed: `${name} is ${roleLabel[evaluation.roles[slot]!]}; ${endpointText(evaluation, after)}.`,
    actor: "The EndpointSlice controller re-evaluates the Service selector against this Pod's labels.",
    reason: `The selector is app=${after.selector}; a Pod is recorded only when its label equals it.`,
    notYet: 'The Pod was not deleted or restarted, and its Ready condition did not change. This fixture does not model the ReplicaSet reacting to the label change (see Misconceptions).',
  };
}

function replaceReport(before: FixtureState, after: FixtureState, slot: number): Change {
  const old = nameOf(before, slot);
  const fresh = nameOf(after, slot);
  const wasEndpoint = evaluate(before).listed.includes(slot);
  return {
    title: `Replaced ${old} with ${fresh}`,
    changed: `${old} is deleted${wasEndpoint ? ' and was a ready endpoint' : ''}; ${fresh} starts from the template (app=web, NotReady) in the same booth; ${endpointText(evaluate(after), after)}.`,
    actor: 'The ReplicaSet controller creates the replacement to hold its replica count; the EndpointSlice controller updates the roster.',
    reason: 'A deleted Pod no longer counts toward the replica count, so a new Pod with a new name is created from the template.',
    notYet: `${fresh} is not an endpoint until its readiness probe passes. A real deletion first marks ${old} terminating; this fixture removes it at once.`,
  };
}

function selectorReport(after: FixtureState): Change {
  const evaluation = evaluate(after);
  const matching = evaluation.roles.filter((role) => role !== 'outside').length;
  return {
    title: `Service selector is now app=${after.selector}`,
    changed: `spec.selector changed; ${endpointText(evaluation, after)}.`,
    actor: 'You changed the Service; the EndpointSlice controller re-evaluates every Pod against the new selector.',
    reason: matching === 0
      ? `No Pod carries app=${after.selector}, so no Pod can be an endpoint.`
      : `${matching} of ${after.pods.length} Pods carry app=${after.selector}; only those that are also Ready are endpoints.`,
    notYet: 'No Pod changed and the ClusterIP stays 10.96.40.12. The Service object still exists.',
  };
}

function exposureReport(exposure: Exposure): Change {
  return {
    title: `Service type is ${exposure}`,
    changed: `${exposureDetail[exposure]} Endpoints unchanged.`,
    actor: exposureActor[exposure],
    reason: 'Exposure type adds access paths to the same endpoints; it does not choose which Pods serve.',
    notYet: exposureNotYet[exposure],
  };
}

function requestReport(state: FixtureState, slot: number | null): Change {
  if (slot === null) {
    return {
      title: 'No ready endpoint: request not forwarded',
      changed: 'No Pod is both matching and Ready, so the rule dial has no endpoint to forward to.',
      actor: 'kube-proxy on the client node, programmed from EndpointSlices.',
      reason: `Zero Pods are both labelled app=${state.selector} and Ready.`,
      notYet: 'The ClusterIP still exists. How the client sees this failure depends on the proxy mode and is not modelled.',
    };
  }
  return {
    title: `Request forwarded to ${nameOf(state, slot)}:${SERVICE.targetPort}`,
    changed: `ClusterIP port ${SERVICE.port} maps to targetPort ${SERVICE.targetPort}; one of ${evaluate(state).listed.length} ready endpoints was chosen.`,
    actor: 'kube-proxy on the client node; this fixture uses round robin in place of its choice.',
    reason: 'Only ready endpoints are in the rules, so only matching, Ready Pods can be chosen.',
    notYet: 'One request is one sample: the response body is not checked, and DNS name lookup for web is not modelled.',
  };
}

function PodRow(props: {
  pod: PodState; slot: number; selector: Selector; role: PodRole; focused: boolean; disabled: boolean;
  onReady: (ready: boolean) => void; onLabel: (app: PodApp) => void; onDelete: () => void;
}) {
  // Every indicator reads props inside JSX so it updates when the Pod, selector or roster changes.
  return (
    <div class="sv-row" data-focus={props.focused ? 'true' : 'false'} role="group" aria-label={`Booth ${props.slot + 1}: ${props.pod.name}`}>
      <div class="sv-row-head"><strong>{props.pod.name}</strong><span class="sv-slot">booth {props.slot + 1}</span></div>
      <div class="sv-badges">
        <StateBadge tone={props.pod.ready ? 'pass' : 'wait'} label={props.pod.ready ? 'Ready' : 'NotReady'} />
        <StateBadge
          tone={props.pod.app === props.selector ? 'pass' : 'info'}
          label={props.pod.app === props.selector ? `Matches app=${props.selector}` : `Label app=${props.pod.app}: no match`}
        />
        <StateBadge tone={roleBadge[props.role].tone} label={roleBadge[props.role].label} />
      </div>
      <div class="sv-row-controls">
        <label><input type="checkbox" checked={props.pod.ready} disabled={props.disabled}
          onChange={(event) => props.onReady(event.currentTarget.checked)} />Readiness probe passes</label>
        <label><input type="checkbox" checked={props.pod.app === 'web'} disabled={props.disabled}
          onChange={(event) => props.onLabel(event.currentTarget.checked ? 'web' : 'web-canary')} />Label app=web</label>
        <button type="button" disabled={props.disabled} aria-label={`Delete Pod ${props.pod.name}`} onClick={props.onDelete}>Delete Pod</button>
      </div>
    </div>
  );
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  const slatEls: Array<SVGGElement | undefined> = [];
  const cardEls: Array<SVGGElement | undefined> = [];
  let pointerEl: SVGPathElement | undefined;
  let beadEl: SVGCircleElement | undefined;
  const slatAt = [0, 0, 0];
  const slatTo = [0, 0, 0];
  const cardAt = [0, 0, 0];
  const cardTo = [0, 0, 0];
  let pointerAngleAt = geo.DIAL_REST;
  let pointerAngleTo = geo.DIAL_REST;
  let pointerLengthAt = DIAL_REST_LENGTH;
  let pointerLengthTo = DIAL_REST_LENGTH;
  let beadPath: k.Flat[] = [];
  let beadT = 1;

  const [state, setState] = createSignal<FixtureState>(initialState());
  const evaluation = createMemo(() => evaluate(state()));
  const [report, setReport] = createSignal<Change>(initialReport);
  const [marks, setMarks] = createSignal<Marks>({});
  const [focus, setFocus] = createSignal(1);
  const [requests, setRequests] = createSignal(0);
  const [served, setServed] = createSignal<string | null | undefined>(undefined);
  // The booth the last request reached; kept until the next state change so it can be read after the dot returns.
  const [servedSlot, setServedSlot] = createSignal<number | null>(null);

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    let moving = false;
    for (const slot of SLOTS) {
      slatAt[slot] = ease(slatAt[slot]!, slatTo[slot]!, dt, reduced);
      cardAt[slot] = ease(cardAt[slot]!, cardTo[slot]!, dt, reduced);
      slatEls[slot]?.setAttribute('transform', geo.move(slatAt[slot]!));
      cardEls[slot]?.setAttribute('transform', geo.move(cardAt[slot]!));
      moving = moving || slatAt[slot] !== slatTo[slot] || cardAt[slot] !== cardTo[slot];
    }
    const before = [pointerAngleAt, pointerLengthAt];
    pointerAngleAt = ease(pointerAngleAt, pointerAngleTo, dt, reduced);
    pointerLengthAt = ease(pointerLengthAt, pointerLengthTo, dt, reduced);
    if (before[0] !== pointerAngleAt || before[1] !== pointerLengthAt) {
      pointerEl?.setAttribute('d', geo.pointer(pointerAngleAt, pointerLengthAt));
    }
    moving = moving || pointerAngleAt !== pointerAngleTo || pointerLengthAt !== pointerLengthTo;
    if (beadT < 1) {
      beadT = reduced ? 1 : Math.min(1, beadT + dt / REQUEST_SECONDS);
      if (beadT < 1) {
        const [x, y] = pointAlong(beadPath, beadT);
        beadEl?.setAttribute('cx', String(x));
        beadEl?.setAttribute('cy', String(y));
      } else {
        beadEl?.setAttribute('data-active', 'false');
        pointerAngleTo = geo.DIAL_REST;
        pointerLengthTo = DIAL_REST_LENGTH;
      }
      moving = true;
    }
    return moving;
  });

  function sync(next: FixtureState) {
    const listed = evaluate(next).listed;
    for (const slot of SLOTS) {
      slatTo[slot] = listed.includes(slot) ? geo.SLAT_UP : geo.SLAT_SINK;
      cardTo[slot] = next.pods[slot]!.app === next.selector ? 0 : geo.CARD_OUT;
    }
  }

  function commit(next: FixtureState, focusSlot: number, nextMarks: Marks, nextReport: Change) {
    setState(next);
    setFocus(focusSlot);
    setMarks(nextMarks);
    setReport(nextReport);
    setServedSlot(null);
    sync(next);
    wake();
  }

  function onReady(slot: number, ready: boolean) {
    const next = setReady(state(), slot, ready);
    commit(next, slot, { ready: true }, readyReport(next, slot, ready));
  }

  function onLabel(slot: number, app: PodApp) {
    const next = setApp(state(), slot, app);
    // A label is compared with the selector, so both the Pod label and the selector line are what this read.
    commit(next, slot, { label: true, selector: true }, labelReport(next, slot));
  }

  function onDelete(slot: number) {
    const before = state();
    const next = replacePod(before, slot);
    commit(next, slot, { name: true, ready: true, label: true }, replaceReport(before, next, slot));
  }

  function onSelector(selector: Selector) {
    const next = setSelector(state(), selector);
    commit(next, focus(), { selector: true }, selectorReport(next));
  }

  function onExposure(exposure: Exposure) {
    const next = setExposure(state(), exposure);
    commit(next, focus(), { exposure: true }, exposureReport(exposure));
  }

  function onRequest() {
    const result = forward(state());
    const name = result.slot === null ? null : nameOf(result.state, result.slot);
    setState(result.state);
    setServed(name);
    setServedSlot(result.slot);
    setRequests(requests() + 1);
    // The request reads the Service port mapping; it reads the chosen Pod's name only when one was chosen.
    setMarks(result.slot === null ? { route: true } : { route: true, name: true });
    setReport(requestReport(result.state, result.slot));
    if (result.slot !== null) setFocus(result.slot);
    sync(result.state);
    beadPath = geo.routeScreen(result.slot);
    beadT = 0;
    beadEl?.setAttribute('data-active', 'true');
    pointerAngleTo = result.slot === null ? geo.DIAL_REST : geo.DIAL_ANGLES[result.slot]!;
    pointerLengthTo = result.slot === null ? DIAL_REST_LENGTH : DIAL_LISTED_LENGTH;
    wake();
  }

  function onReset() {
    const next = initialState();
    beadT = 1;
    beadEl?.setAttribute('data-active', 'false');
    pointerAngleTo = geo.DIAL_REST;
    pointerLengthTo = DIAL_REST_LENGTH;
    setRequests(0);
    setServed(undefined);
    commit(next, 1, {}, initialReport);
  }

  const readout = createMemo(() => {
    const s = state();
    const servedName = served();
    const outcome = requests() === 0
      ? 'No request sent yet'
      : servedName === null
        ? 'Last request: no ready endpoint, not forwarded'
        : `Last request forwarded to ${servedName}:${SERVICE.targetPort}`;
    return `${endpointText(evaluation(), s)} · selector app=${s.selector} · ClusterIP ${SERVICE.clusterIP} unchanged by these actions · ${outcome}`;
  });

  const manifest = createMemo(() => manifestLines(state(), focus(), marks()));

  return (
    <div ref={root} class="anatomy-figure sv-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>Fig · Networking</span><span>Stable name, changing backends</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <div class="sv-stage">
        <svg class="iso-svg" viewBox="0 0 720 430" role="img" aria-labelledby="sv-title sv-desc">
          <title id="sv-title">Service web in front of three Pod booths</title>
          <desc id="sv-desc">A fixed ClusterIP plate on the desk. Three Pod booths: a lamp for Ready and a label card for selector match. A roster board lifts a slat only for ready endpoints. A kube-proxy dial sends requests along a bus to ready endpoints only.</desc>
          <g innerHTML={geo.base} />
          <g innerHTML={geo.rail} />
          <g innerHTML={geo.board} />
          <For each={SLOTS}>{(slot) => <g ref={(el) => { slatEls[slot] = el; }} innerHTML={geo.slat(geo.BOOTH_X[slot]!)} />}</For>
          <g innerHTML={geo.client} />
          <For each={SLOTS}>{(slot) => <g class="sv-booth" data-listed={evaluation().roles[slot] === 'ready' ? 'true' : 'false'}
            data-served={servedSlot() === slot ? 'true' : 'false'}>
            <g innerHTML={geo.booth(geo.BOOTH_X[slot]!)} />
            <g class="sv-lamp" data-ready={state().pods[slot]!.ready ? 'true' : 'false'} innerHTML={geo.lamp(geo.BOOTH_X[slot]!)} />
            <g class="sv-served-ring" innerHTML={geo.servedRing(geo.BOOTH_X[slot]!)} />
            <g ref={(el) => { cardEls[slot] = el; }} innerHTML={geo.card(geo.BOOTH_X[slot]!)} />
          </g>}</For>
          <For each={SLOTS}>{(slot) => <g class="sv-drop" data-listed={evaluation().roles[slot] === 'ready' ? 'true' : 'false'}
            data-served={servedSlot() === slot ? 'true' : 'false'}
            innerHTML={`<g class="sv-on">${geo.drop(geo.BOOTH_X[slot]!, true)}</g><g class="sv-off">${geo.drop(geo.BOOTH_X[slot]!, false)}</g>`} />}</For>
          <g innerHTML={geo.bus} />
          <g innerHTML={geo.desk} />
          <g innerHTML={geo.plate} />
          <g innerHTML={geo.dial} />
          <path ref={(el) => { pointerEl = el; }} class="iso-line sv-pointer" data-tone="hi" d={geo.pointer(geo.DIAL_REST, DIAL_REST_LENGTH)} />
          <circle ref={(el) => { beadEl = el; }} class="sv-bead" r="2.6" cx="0" cy="0" data-active="false" />
        </svg>
        <For each={SLOTS}>{(slot) => <span class="sv-tag" aria-hidden="true"
          data-listed={evaluation().roles[slot] === 'ready' ? 'true' : 'false'}
          style={{ left: podTags[slot]!.left, top: podTags[slot]!.top }}>{podSuffix(state().pods[slot]!.name)}</span>}</For>
      </div>
      <p class="anatomy-readout" data-readout>{readout()}</p>
      <div class="sv-slice-block">
        <p class="sv-slice-head">EndpointSlice: {evaluation().listed.length} ready endpoints · desk ClusterIP {SERVICE.clusterIP} · {exposureText[state().exposure]}</p>
        <ol class="sv-slice" aria-label="EndpointSlice rows, one per roster slot">
          <For each={SLOTS}>{(slot) => <li class="sv-slice-row" data-reading={evaluation().roles[slot]}>
            <span class="sv-slice-slot">slot {slot + 1}</span>
            <span class="sv-slice-name">{state().pods[slot]!.name}</span>
            <span class="sv-slice-reading">{sliceReading[evaluation().roles[slot]!]}</span>
            <span class="sv-slice-slat">{sliceSlat[evaluation().roles[slot]!]}</span>
          </li>}</For>
        </ol>
      </div>
      <ul class="anatomy-legend">
        <li>Desk plate = Service ClusterIP (fixed)</li>
        <li>Booth = Pod; lamp = Ready condition (hollow when NotReady)</li>
        <li>Card in slot = label matches selector</li>
        <li>Slat up = ready endpoint (receives traffic)</li>
        <li>Dial = kube-proxy rule; client sends requests</li>
      </ul>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls">
        <button type="button" data-anatomy-primary disabled={!hydrated()} onClick={onRequest}>Send request to web:{SERVICE.port}</button>
        <button type="button" disabled={!hydrated()} onClick={onReset}>Reset fixture</button>
        <label>Service selector
          <select value={state().selector} disabled={!hydrated()} onChange={(event) => onSelector(event.currentTarget.value as Selector)}>
            <For each={SELECTORS}>{(value) => <option value={value}>app={value}</option>}</For>
          </select>
        </label>
        <label>Service type
          <select value={state().exposure} disabled={!hydrated()} onChange={(event) => onExposure(event.currentTarget.value as Exposure)}>
            <For each={EXPOSURES}>{(value) => <option value={value}>{value}</option>}</For>
          </select>
        </label>
      </div>
      <ChangeReport change={report()} busy={!hydrated()} />
      <section class="sv-pods" data-anatomy-status>
        <h3 class="anatomy-panel-heading">Pods behind the Service</h3>
        <div class="sv-rows" role="group" aria-label="Pods behind the Service">
          <For each={SLOTS}>{(slot) => <PodRow pod={state().pods[slot]!} slot={slot} selector={state().selector}
            role={evaluation().roles[slot]!} focused={focus() === slot} disabled={!hydrated()}
            onReady={(ready) => onReady(slot, ready)} onLabel={(app) => onLabel(slot, app)} onDelete={() => onDelete(slot)} />}</For>
        </div>
      </section>
      </div>
      </div>
      <ManifestPanel title="shop/web Service and focused Pod (rendered from fixture state)" lines={manifest()}
        note="The status block is written by the cluster; you never apply it." />
      <p class="sv-caption">The desk number never changes when Pods change. Only Pods that match the selector and are Ready are endpoints, and a request reaches only a ready endpoint.</p>
    </div>
  );
}
