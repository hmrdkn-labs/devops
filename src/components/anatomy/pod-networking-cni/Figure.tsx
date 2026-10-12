import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import {
  base, cableA, cableB, capsuleA, capsuleB, GATE_CLOSED, GATE_OPEN, gateBar, gatePosts, nodeA, nodeB, P, rail, screenAt, waypoints,
} from './geometry';
import {
  advance, deleteApi, initialState, manifestOf, needsSteps, POLICY_NAME, probe, setEnforcing, setKubeProxy, setPlugin, setPolicy,
  stageAtLeast, stages, VIP, type NetState, type NodeId, type Stage,
} from './model';
import './figure.css';

const stageLabel: Record<Stage, string> = {
  created: 'Created', bound: 'Bound to node', sandbox: 'Sandbox', networked: 'Address (CNI ADD)', running: 'Running', ready: 'Ready',
};
/** Capsule height while the Pod is still being set up: it is lowered into its bay one boundary at a time. */
const lifts: Partial<Record<Stage, number>> = { created: 40, bound: 26, sandbox: 10 };
/** True once the api Pod has reached the given setup boundary; false when no api Pod exists. */
const reached = (state: NetState, floor: Stage) => state.api !== null && stageAtLeast(state.api.stage, floor);
const hopTone: Record<'pass' | 'stop' | 'skip', { tone: BadgeTone; label: string }> = {
  pass: { tone: 'pass', label: 'passed' },
  stop: { tone: 'fail', label: 'stopped here' },
  skip: { tone: 'wait', label: 'not tested' },
};

type GateKind = 'open' | 'ghost' | 'closed';
function gateKind(state: NetState): GateKind {
  if (!state.policy) return 'open';
  return state.enforcing ? 'closed' : 'ghost';
}

function podLines(state: NetState, node: NodeId): string[] {
  const lines: string[] = [];
  if (state.client.node === node) lines.push(`client u${state.client.uid} · ${state.client.ip} · Ready`);
  if (state.api?.node === node) lines.push(`api u${state.api.uid} · ${state.api.ip ?? 'no IP yet'} · ${stageLabel[state.api.stage]}`);
  return lines;
}

/** Moves a value toward its target and snaps it when the rest is invisible. */
function settle(value: number, target: number, blend: number) {
  const next = value + (target - value) * blend;
  return Math.abs(target - next) < 0.05 ? target : next;
}

/** Point at fractional position along a polyline of screen points. */
function pointAlong(points: k.Flat[], position: number): k.Flat {
  const index = Math.min(Math.floor(position), points.length - 1);
  const next = Math.min(index + 1, points.length - 1);
  const fraction = position - index;
  const [ax, ay] = points[index]!;
  const [bx, by] = points[next]!;
  return [ax + (bx - ax) * fraction, ay + (by - ay) * fraction];
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<NetState>(initialState());
  const [moving, setMoving] = createSignal(false);

  // Motion is visual only: the state is already final. These values follow the targets below.
  let root: HTMLDivElement | undefined;
  let apiBody: SVGGElement | undefined;
  let gate: SVGGElement | undefined;
  let packet: SVGCircleElement | undefined;
  let apiLift = 0;
  let apiLiftTarget = 0;
  let apiAlpha = 1;
  let apiAlphaTarget = 1;
  let gateZ = GATE_OPEN;
  let gateTarget = GATE_OPEN;
  let packetPos = 0;
  let packetTarget = 0;
  let trailPoints: k.Flat[] = [];

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / 0.16);
    apiLift = settle(apiLift, apiLiftTarget, blend);
    apiAlpha = settle(apiAlpha, apiAlphaTarget, blend);
    gateZ = settle(gateZ, gateTarget, blend);
    packetPos = settle(packetPos, packetTarget, blend);
    apiBody?.setAttribute('transform', k.translateAlong(P, [0, 0, apiLift]));
    apiBody?.setAttribute('opacity', String(apiAlpha));
    gate?.setAttribute('transform', k.translateAlong(P, [0, 0, gateZ]));
    if (packet && trailPoints.length > 0) {
      const [x, y] = pointAlong(trailPoints, packetPos);
      packet.setAttribute('cx', x.toFixed(2));
      packet.setAttribute('cy', y.toFixed(2));
    }
    const remains = apiLift !== apiLiftTarget || apiAlpha !== apiAlphaTarget || gateZ !== gateTarget || packetPos !== packetTarget;
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  /** Sets the motion targets from a state. Only visible geometry moves; the state itself is never animated. */
  function aim(next: NetState) {
    const stage = next.api?.stage;
    apiLiftTarget = stage ? (lifts[stage] ?? 0) : 40;
    apiAlphaTarget = stage === undefined ? 0 : stage === 'created' ? 0.3 : stage === 'bound' ? 0.5 : 1;
    gateTarget = next.policy && next.enforcing ? GATE_CLOSED : GATE_OPEN;
    if (next.probe !== state().probe) packetPos = 0;
    packetTarget = next.probe ? next.probe.trail.length - 1 : 0;
    trailPoints = next.probe ? next.probe.trail.map((waypoint) => k.iso(waypoints[waypoint], P)) : [];
  }

  function apply(next: NetState) {
    if (moving()) return;
    aim(next);
    setState(next);
    setMoving(apiLift !== apiLiftTarget || apiAlpha !== apiAlphaTarget || gateZ !== gateTarget || packetPos !== packetTarget);
    wake();
  }

  const canAct = () => hydrated() && !moving();
  const trailD = createMemo(() => {
    const current = state().probe;
    return current ? k.pathOf(current.trail.map((waypoint) => k.iso(waypoints[waypoint], P))) : '';
  });
  const stopXY = createMemo<k.Flat | null>(() => {
    const current = state().probe;
    return current && current.stopAt ? k.iso(waypoints[current.stopAt], P) : null;
  });
  const manifestLines = createMemo<ManifestLine[]>(() => manifestOf(state()).map((row) => ({
    text: row.text,
    highlight: row.field !== undefined && state().reads.includes(row.field),
  })));
  const trackIndex = (stage: Stage) => stages.indexOf(stage);
  const startXY = k.iso(waypoints.start, P);
  const apiTag = () => {
    const pod = state().api;
    const lift = pod ? (lifts[pod.stage] ?? 0) : 0;
    return screenAt([102, -11, 62 + lift]);
  };
  const apiTagText = () => {
    const pod = state().api;
    return pod ? `api · u${pod.uid} · ${pod.ip ?? 'no IP yet'}` : 'api · no Pod object';
  };
  const gateText = () => {
    const kind = gateKind(state());
    if (kind === 'closed') return `${POLICY_NAME}: enforced`;
    if (kind === 'ghost') return `${POLICY_NAME}: object only`;
    return 'NetworkPolicy: none';
  };

  return <div ref={root} class="anatomy-figure netpod-figure" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 05 · Pod networking</span><span>Pod IP ≠ Service address</span></div>
    <p class="netpod-purpose"><strong>Goal:</strong> each Pod gets its own IP from the node's CNI plugin, not from the kubelet or kube-proxy. Replace the api Pod, send requests, stop kube-proxy and create a NetworkPolicy to see which owner each hop belongs to.</p>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <div class="netpod-stage">
      <svg class="iso-svg" viewBox="0 0 640 400" role="img" aria-labelledby="netpod-title netpod-desc">
        <title id="netpod-title">Two-node Pod networking yard</title>
        <desc id="netpod-desc">Two node bays on one plate. Each bay holds a Pod cradle with two containers under one shared network-namespace bar, a CNI spool at the back and a switch at the front, joined by a veth cable. A rail links the switches, and a gate across the rail closes only when the installed CNI enforces the NetworkPolicy. A kube-proxy rule board on a post above node-a's switch holds Service rules. A packet dot travels along the last request's path and stops at the hop that failed.</desc>
        <g innerHTML={base} />
        <g innerHTML={nodeA.back} />
        <g innerHTML={capsuleA.pre} />
        <g innerHTML={capsuleA.containers} />
        <g innerHTML={capsuleA.post} />
        <g innerHTML={capsuleA.plate} />
        <g innerHTML={capsuleA.bar} />
        <g innerHTML={capsuleA.lamp} />
        <g innerHTML={cableA} />
        <g innerHTML={nodeA.front} />
        <g opacity={state().nodes['node-a'].kubeProxy ? 1 : 0.25} innerHTML={nodeA.rules} />
        <g innerHTML={rail} />
        <g innerHTML={nodeB.back} />
        <g opacity={state().nodes['node-b'].plugin ? 1 : 0} innerHTML={nodeB.spool} />
        <g ref={(el) => { apiBody = el; }} transform={k.translateAlong(P, [0, 0, 0])}>
          <g innerHTML={capsuleB.pre} />
          <g opacity={reached(state(), 'running') ? 1 : 0} innerHTML={capsuleB.containers} />
          <g innerHTML={capsuleB.post} />
          <g opacity={reached(state(), 'networked') ? 1 : 0} innerHTML={capsuleB.plate} />
          <g opacity={reached(state(), 'sandbox') ? 1 : 0} innerHTML={capsuleB.bar} />
          <g opacity={state().api?.stage === 'ready' ? 1 : 0} innerHTML={capsuleB.lamp} />
        </g>
        <g opacity={reached(state(), 'networked') ? 1 : 0} innerHTML={cableB} />
        <g innerHTML={nodeB.front} />
        <g innerHTML={nodeB.rules} />
        <g innerHTML={gatePosts} />
        <g ref={(el) => { gate = el; }} class="netpod-gate" data-gate={gateKind(state())} transform={k.translateAlong(P, [0, 0, GATE_OPEN])} innerHTML={gateBar} />
        <path class="netpod-trail" d={trailD()} />
        <circle ref={(el) => { packet = el; }} class="netpod-packet" r="3.4" cx={startXY[0]} cy={startXY[1]} opacity={state().probe ? 1 : 0} />
        <Show when={stopXY()}>{(point) => <text class="netpod-stop" x={point()[0]} y={point()[1]} text-anchor="middle">✕</text>}</Show>
      </svg>
      <span class="netpod-tag netpod-node" style={screenAt([-190, 62, 16])}>node-a · 10.244.1.0/24</span>
      <span class="netpod-tag netpod-node" style={screenAt([40, 62, 16])}>node-b · 10.244.2.0/24</span>
      <span class="netpod-tag netpod-pod" style={screenAt([-142, -11, 62])}>client · u1 · 10.244.1.4</span>
      <span class="netpod-tag netpod-pod" data-object="api" style={apiTag()}>{apiTagText()}</span>
      <span class="netpod-tag netpod-state" data-tone={state().nodes['node-a'].plugin ? 'ok' : 'missing'} style={screenAt([-164, -55, 50])}>CNI plugin · installed</span>
      <span class="netpod-tag netpod-state" data-tone={state().nodes['node-b'].plugin ? 'ok' : 'missing'} style={screenAt([70, -55, 50])}>CNI plugin · {state().nodes['node-b'].plugin ? 'installed' : 'missing'}</span>
      <span class="netpod-tag netpod-state" data-tone={state().nodes['node-a'].kubeProxy ? 'ok' : 'missing'} style={screenAt([-44, 24, 66])}>kube-proxy · {state().nodes['node-a'].kubeProxy ? 'running' : 'stopped'}</span>
      <span class="netpod-tag netpod-gate-tag netpod-state" data-gate={gateKind(state())} style={screenAt([10, 34, 58])}>{gateText()}</span>
    </div>
    <p class="netpod-legend">Lit bar: one network namespace shared by the Pod's containers. Spool: the node's CNI plugin. Cable: veth from the Pod to its node switch. Rail and gate: the path between nodes. Board: kube-proxy Service rules.</p>
    <div class="netpod-nodes">
      <For each={['node-a', 'node-b'] as NodeId[]}>{(node) => <section class="netpod-node" aria-label={`${node} status`}>
        <h3>{node} · {state().nodes[node].cidr}</h3>
        <dl>
          <div><dt>CNI plugin</dt><dd><StateBadge tone={state().nodes[node].plugin ? 'pass' : 'fail'} label={state().nodes[node].plugin ? 'installed' : 'missing'} /></dd></div>
          <div><dt>kube-proxy</dt><dd><StateBadge tone={state().nodes[node].kubeProxy ? 'pass' : 'fail'} label={state().nodes[node].kubeProxy ? 'running' : 'stopped'} /></dd></div>
          <div><dt>Pods here</dt><dd>
            <For each={podLines(state(), node)} fallback={<span class="netpod-empty">none</span>}>{(line) => <span class="netpod-pod-line">{line}</span>}</For>
          </dd></div>
        </dl>
      </section>}</For>
    </div>
    <div class="anatomy-controls netpod-node-controls">
      <div class="netpod-group" role="group" aria-label="Node pieces">
        <button type="button" disabled={!canAct()} onClick={() => apply(setPlugin(state(), 'node-b', !state().nodes['node-b'].plugin))}>
          {state().nodes['node-b'].plugin ? 'Remove CNI plugin from node-b' : 'Install CNI plugin on node-b'}
        </button>
        <button type="button" disabled={!canAct()} onClick={() => apply(setKubeProxy(state(), !state().nodes['node-a'].kubeProxy))}>
          {state().nodes['node-a'].kubeProxy ? 'Stop kube-proxy on node-a' : 'Start kube-proxy on node-a'}
        </button>
      </div>
      <div class="netpod-group" role="group" aria-label="Policy">
        <button type="button" disabled={!canAct()} onClick={() => apply(setPolicy(state(), !state().policy))}>
          {state().policy ? `Delete ${POLICY_NAME} policy` : `Create ${POLICY_NAME} policy`}
        </button>
        <label>Installed CNI
          <select aria-label="Installed CNI" value={state().enforcing ? 'yes' : 'no'} disabled={!canAct()} onChange={(event) => apply(setEnforcing(state(), event.currentTarget.value === 'yes'))}>
            <option value="yes">Enforces NetworkPolicy</option>
            <option value="no">Does not enforce NetworkPolicy</option>
          </select>
        </label>
      </div>
    </div>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls">
      <div class="netpod-group" role="group" aria-label="Traffic">
        <button type="button" data-anatomy-primary disabled={!canAct()} onClick={() => apply(probe(state(), 'direct'))}>Send request to api Pod IP</button>
        <button type="button" disabled={!canAct()} onClick={() => apply(probe(state(), 'service'))}>{`Send request to api Service ${VIP}`}</button>
      </div>
      <div class="netpod-group" role="group" aria-label="Pod lifecycle">
        <button type="button" disabled={!canAct() || state().api?.stage !== 'ready'} onClick={() => apply(deleteApi(state()))}>Delete api Pod</button>
        <button type="button" disabled={!canAct() || !needsSteps(state())} onClick={() => apply(advance(state()))}>Step pod setup</button>
      </div>
      <button type="button" disabled={!canAct()} onClick={() => apply(initialState())}>Reset / replay</button>
    </div>
    <ChangeReport busy={moving()} change={state().change} />
    <section class="netpod-hop-block" data-anatomy-status aria-labelledby="netpod-hop-title">
      <h3 id="netpod-hop-title" class="anatomy-panel-heading">Last request path</h3>
      <Show when={state().probe} fallback={<p class="netpod-empty">No request sent yet. A request is a fixture check: it changes no cluster state.</p>}>
        {(current) => <>
          <p class="netpod-probe-head">{current().route === 'direct' ? `Direct to Pod IP ${current().target}` : `Service ${current().target}, then the Pod path`}</p>
          <ol class="anatomy-status-list netpod-hops">
            <For each={current().hops}>{(hop, index) => <li data-verdict={hop.verdict}>
              <span><strong>{index() + 1}. {hop.label}</strong> <span class="netpod-owner">· {hop.owner}</span></span>
              <StateBadge tone={hopTone[hop.verdict].tone} label={hopTone[hop.verdict].label} />
              <span class="anatomy-status-detail netpod-hop-detail">{hop.detail}</span>
            </li>}</For>
          </ol>
        </>}
      </Show>
    </section>
    <section class="netpod-pod-block" aria-label="api Pod setup and identities">
      <h3 class="anatomy-panel-heading">api Pod setup</h3>
      <div class="netpod-status">
        <ol class="netpod-track" aria-label="api Pod setup stages">
          <Show when={state().api} fallback={<li><StateBadge tone="info" label="No api Pod: replacement not created" /></li>}>
            {(pod) => <For each={stages}>{(stage) => <li data-stage={stage} data-state={trackIndex(stage) < trackIndex(pod().stage) ? 'done' : stage === pod().stage ? 'current' : 'todo'}>
              <StateBadge
                tone={trackIndex(stage) < trackIndex(pod().stage) ? 'pass' : stage === pod().stage ? 'selected' : 'wait'}
                label={stageLabel[stage]}
              />
            </li>}</For>}
          </Show>
        </ol>
        <Show when={state().api?.stage === 'sandbox' && !state().nodes['node-b'].plugin}>
          <StateBadge tone="fail" label="Next step blocked: CNI plugin missing on node-b" />
        </Show>
        <Show when={state().api?.stage === 'ready'}>
          <StateBadge tone="pass" label="api is Ready and a ready endpoint" />
        </Show>
      </div>
      <section class="netpod-ledger" aria-label="Pod identity ledger">
        <h3 class="anatomy-panel-heading">Pod identity ledger <span class="netpod-note">IPs and UIDs are fixture stand-ins</span></h3>
        <ul class="anatomy-status-list">
          <li><span><strong>client u1</strong> <span>node-a · 10.244.1.4</span></span> <StateBadge tone="pass" label="Ready" /></li>
          <Show when={state().api} fallback={<li><span><strong>api</strong> <span>no Pod object</span></span> <StateBadge tone="wait" label="replacement pending" /></li>}>
            {(pod) => <li data-selected="false">
              <span><strong>api u{pod().uid}</strong> <span>{pod().node ?? 'unbound'} · {pod().ip ?? 'no IP yet'}</span></span>
              <span class="netpod-badges">
                <StateBadge tone={pod().stage === 'ready' ? 'pass' : 'wait'} label={stageLabel[pod().stage]} />
                <Show when={state().fresh === pod().uid}><StateBadge tone="info" label="new UID" /></Show>
              </span>
            </li>}
          </Show>
          <For each={state().released}>{(gone) => <li data-retired="true">
            <span><strong>u{gone.uid}</strong> <span>retired · released {gone.ip} from {gone.node}</span></span>
          </li>}</For>
        </ul>
      </section>
    </section>
    </div>
    </div>
    <ManifestPanel title="Pod and NetworkPolicy (fixture)" lines={manifestLines()}
      note="Highlighted lines are the fields the last interaction read or changed. The Pod is shown as the API returns it; the policy document appears once created." />
    <p class="netpod-hint">Fixture: node ranges, the Service address {VIP} and one endpoint are illustrative. The packet dot shows the checked path, not a trace of real forwarding.</p>
  </div>;
}
