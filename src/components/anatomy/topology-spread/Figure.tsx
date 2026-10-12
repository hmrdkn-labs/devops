import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import {
  bayCenters, bayLabelAt, cartridgeArt, depthLights, fixtures, gateFlat, gateUpright, identityAt, MAX_SLOTS, moverAt, P, pendingCartridgeArt, QUEUE, trayLabelAt, VIEW, zStack,
} from './geometry';
import {
  assigned, configure, editMarkIds, evaluate, initialState, labelKeys, MIN_DOMAINS, newestAssigned, nodes, nodeYaml, outcomeOf, pendingPod,
  place, podName, podYaml, removeNewest, runMarkIds, scaleUp, shownPod, zoneOf, type Constraint, type Evaluation, type NodeName, type Outcome, type SpreadState,
  type TopologyKey, type WebPod, type Zone,
} from './model';
import './figure.css';

const bays = bayCenters.map((_, index) => index);
const slots = Array.from({ length: MAX_SLOTS }, (_, index) => index);
const cartridge = cartridgeArt();
const movingCartridge = pendingCartridgeArt();

const outcomeBadge: Record<Outcome, { tone: BadgeTone; label: string }> = {
  rejected: { tone: 'fail', label: 'rejected: over maxSkew' },
  selected: { tone: 'selected', label: 'selected' },
  passes: { tone: 'pass', label: 'passes · not chosen' },
  'ranked-out': { tone: 'info', label: 'scored lower: more matching' },
  'tied-out': { tone: 'info', label: 'tied · later name' },
};

function constraintText(c: Constraint): string {
  return `${labelKeys[c.topologyKey]}, maxSkew ${c.maxSkew}, ${c.whenUnsatisfiable}${c.minDomains ? `, minDomains ${MIN_DOMAINS}` : ''}`;
}

/** Domain counts in node order, one entry per domain. */
function countsText(state: SpreadState): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const row of evaluate(state).rows) {
    if (seen.has(row.domain)) continue;
    seen.add(row.domain);
    parts.push(`${row.domain} ${row.matching}`);
  }
  return parts.join(' · ');
}

/** Each domain's arithmetic at run time, written out in words, once per domain. */
function skewText(ev: Evaluation, maxSkew: number, id: number): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const row of ev.rows) {
    if (seen.has(row.domain)) continue;
    seen.add(row.domain);
    parts.push(`${row.domain}: ${row.matching} matching + ${podName(id)} = ${row.ifPlaced}, minus global minimum ${ev.min} = skew ${row.skew} ${row.pass ? '≤' : '>'} maxSkew ${maxSkew}`);
  }
  return parts.join('; ');
}

function initialChange(): Change {
  return {
    title: 'web-4 waits · not run',
    changed: 'web-1 and web-2 are on node-a1, web-3 is on node-b1, web-4 has no node.',
    actor: 'The ReplicaSet created web-4 from a template that sets zone spread, maxSkew 1 and DoNotSchedule.',
    reason: 'The scheduler counts assigned matching Pods and checks a candidate only when it places a Pod.',
    notYet: 'No placement has run. web-4 is not assigned, Running or Ready.',
  };
}

function configChange(state: SpreadState): Change {
  const pending = pendingPod(state);
  return {
    title: pending ? `${podName(pending.id)} constraint changed · not run` : 'Template changed · no unassigned Pod',
    changed: `Constraint is now ${constraintText(state.constraint)}.`,
    actor: 'You, standing in for the workload author who sets topologySpreadConstraints in the Pod template.',
    reason: pending
      ? `${podName(pending.id)} is unassigned, so the scheduler has not read its constraint yet. It is edited in place and keeps its name.`
      : 'No unassigned web Pod exists. The next Pod created from this template (Scale up) reads the new constraint.',
    notYet: 'No filter or score has run. Assigned Pods do not change: a constraint is read only when a Pod is placed.',
  };
}

function scaleChange(state: SpreadState, id: number): Change {
  return {
    title: `${podName(id)} created · unassigned`,
    changed: `${podName(id)} carries app=web and the current constraint (${constraintText(state.constraint)}). spec.nodeName is unset.`,
    actor: 'ReplicaSet controller, here triggered by Scale up. It creates the Pod object only.',
    reason: 'Creating a Pod and placing it are separate steps. The new Pod is not counted until it is assigned.',
    notYet: 'The spread filter has not run. Not assigned, not Running, not Ready.',
  };
}

function removeChange(state: SpreadState, victim: { id: number; node: NodeName }): Change {
  const ev = evaluate(state);
  const above = ev.currentSkew > state.constraint.maxSkew;
  return {
    title: `${podName(victim.id)} removed from ${victim.node}`,
    changed: `Matching Pods now: ${countsText(state)}. Current skew ${ev.currentSkew} (max − min).`,
    actor: 'Outside the scheduler: a scale-down or a manual delete. This fixture removes the newest assigned web Pod.',
    reason: 'Spread constraints are checked when a Pod is placed. Deleting a Pod never triggers a placement, so no other Pod moves.',
    notYet: above
      ? `Current skew ${ev.currentSkew} is above maxSkew ${state.constraint.maxSkew}. It stays that way until a new Pod is placed or a descheduler acts. Nothing was evicted.`
      : 'Counts changed only. No placement ran and no Pod moved.',
  };
}

function runChange(constraint: Constraint, ev: Evaluation, id: number): Change {
  const strict = constraint.whenUnsatisfiable === 'DoNotSchedule';
  const who = strict ? 'kube-scheduler: PodTopologySpread filter, then binding.' : 'kube-scheduler: PodTopologySpread score, then binding.';
  const chosen = ev.rows.find((row) => row.node === ev.selected);
  if (!chosen) {
    const sums = skewText(ev, constraint.maxSkew, id);
    return {
      title: `${podName(id)} unscheduled · Pending`,
      changed: 'spec.nodeName stays unset. No matching Pod was added.',
      actor: who,
      reason: ev.minDomainsApplied
        ? `Only ${ev.domains} domains exist, below minDomains ${MIN_DOMAINS}, so the global minimum is 0. ${sums}.`
        : `No candidate passes. ${sums}.`,
      notYet: 'The fixture does not retry this Pod. Nothing was moved or evicted.',
    };
  }
  const passing = ev.rows.filter((row) => row.pass).length;
  const tied = ev.rows.filter((row) => row.matching === chosen.matching).length;
  const reason = strict
    ? `${skewText(ev, constraint.maxSkew, id)}. ${passing > 1 ? `${chosen.node} is first by name among ${passing} passing nodes.` : `${chosen.node} is the only passing node.`}`
    : `ScheduleAnyway rejects nothing. ${chosen.domain} has the fewest matching Pods (${chosen.matching}), so ${chosen.node} scores highest${tied > 1 ? ' and wins the tie by name' : ''}.`;
  return {
    title: `${podName(id)} assigned to ${chosen.node}`,
    changed: `spec.nodeName set to ${chosen.node} by binding. Matching Pods in ${chosen.domain}: ${chosen.matching} → ${chosen.ifPlaced}.`,
    actor: who,
    reason,
    notYet: `Assigned is not Running. The kubelet on ${chosen.node} has not started the container, and Ready is not evaluated. No existing Pod moved.`,
  };
}

function resetChange(): Change {
  return {
    title: 'Fixture reset',
    changed: 'Zone spread, maxSkew 1, DoNotSchedule, minDomains off. web-1 and web-2 on node-a1, web-3 on node-b1, web-4 pending.',
    actor: 'You, using Reset.',
    reason: 'Reset restores the fixture. It is not a scheduler action.',
    notYet: 'No placement has run since the reset.',
  };
}

/** Pod note after a run. The name and constraint notes apply only while the run's Pod is still pending. */
function podNote(id: string | undefined, state: SpreadState, ev: Evaluation | null, shown: WebPod | null): string | undefined {
  if (!id || !ev) return undefined;
  if (id === 'pod.nodeName') return shown?.node ? 'bound by the scheduler · not Running' : undefined;
  if (!pendingPod(state)) return undefined;
  switch (id) {
    case 'pod.name': return 'unscheduled · Pending';
    case 'pod.topologyKey': return `${ev.domains} domains`;
    case 'pod.maxSkew': return `global minimum ${ev.min}`;
    case 'pod.whenUnsatisfiable': return state.constraint.whenUnsatisfiable === 'DoNotSchedule' ? 'filter: skew must not exceed maxSkew' : 'score only: nothing rejected';
    case 'pod.minDomains': return ev.minDomainsApplied ? `applied: ${ev.domains} domains < ${MIN_DOMAINS}, minimum 0` : `no effect: ${ev.domains} domains ≥ ${MIN_DOMAINS}`;
    default: return undefined;
  }
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  let root: HTMLDivElement | undefined;
  let tag: HTMLSpanElement | undefined;
  let mover: SVGGElement | undefined;
  const [state, setState] = createSignal<SpreadState>(initialState());
  const [result, setResult] = createSignal<Evaluation | null>(null);
  const [lastRun, setLastRun] = createSignal<number | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [marks, setMarks] = createSignal<string[]>([]);
  const [change, setChange] = createSignal<Change>(initialChange());
  const pending = createMemo(() => pendingPod(state()));
  const counted = createMemo(() => assigned(state()));
  const shown = createMemo(() => shownPod(state(), lastRun()));
  // Counts and the current skew come from the state alone. Verdicts exist only in result(), after a run.
  const current = createMemo(() => evaluate(state()));
  // One time base for the table: the state the last run saw, or the current state before any run.
  const basis = createMemo(() => result() ?? current());
  const stacks = createMemo(() => nodes.map((node) => counted().filter((pod) => pod.node === node.name).map((pod) => pod.id)));
  const identityLabels = createMemo(() => stacks().flatMap((ids, bay) => ids.slice(0, MAX_SLOTS).map((id, slot) => ({ id, ...identityAt(bay, slot) }))));
  const zoneCount = (zone: Zone) => counted().filter((pod) => zoneOf(pod.node) === zone).length;
  const passed = (index: number) => result()?.rows[index]?.pass === true;
  const podLines = createMemo<ManifestLine[]>(() => podYaml(state(), shown()).map((line) => {
    const note = podNote(line.id, state(), result(), shown());
    return { text: note ? `${line.text}  # ${note}` : line.text, highlight: !!line.id && marks().includes(line.id) };
  }));
  const nodeLines = createMemo<ManifestLine[]>(() => nodeYaml().map((line) => ({ text: line.text, highlight: !!line.id && marks().includes(line.id) })));

  onMount(() => {
    setHydrated(true);
    placeTag();
  });

  // Motion: the pending cartridge travels from the queue to its bay (0 → 1) when bound. Gates change at settle, not in motion.
  let travel = 0;
  let targetTravel = 0;
  let destination: { bay: number; slot: number } | null = null;
  let committed: SpreadState | null = null;
  let outcome: Evaluation | null = null;
  let runId = 0;

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    const eased = reduced ? targetTravel : travel + (targetTravel - travel) * (1 - Math.exp(-dt / .2));
    travel = Math.abs(eased - targetTravel) < .002 ? targetTravel : eased;
    mover?.setAttribute('transform', k.translateAlong(P, moverAt(travel, destination)));
    placeTag();
    const moving = travel !== targetTravel;
    if (!moving && busy()) settle();
    return moving;
  });

  function placeTag() {
    if (!tag) return;
    const [x, y, z] = moverAt(travel, destination);
    const [sx, sy] = k.iso([x, y, z + 22], P);
    tag.style.left = `${(sx / VIEW.width) * 100}%`;
    tag.style.top = `${(sy / VIEW.height) * 100}%`;
  }

  function resetVisuals() {
    travel = 0;
    targetTravel = 0;
    destination = null;
    wake();
  }

  function settle() {
    const next = committed!;
    const evaluation = outcome!;
    committed = null;
    outcome = null;
    setBusy(false);
    setState(next);
    setResult(evaluation);
    setLastRun(runId);
    setMarks(runMarkIds(next, evaluation.selected !== null));
    setChange(runChange(next.constraint, evaluation, runId));
  }

  function run() {
    const before = state();
    const id = pendingPod(before)?.id;
    if (busy() || id === undefined) return;
    const placed = place(before);
    const selected = placed.evaluation.selected;
    committed = placed.state;
    outcome = placed.evaluation;
    runId = id;
    destination = selected
      ? { bay: nodes.findIndex((node) => node.name === selected), slot: assigned(before).filter((pod) => pod.node === selected).length }
      : null;
    travel = 0;
    targetTravel = destination ? 1 : 0;
    setBusy(true);
    setMarks([]);
    setResult(null);
    wake();
  }

  function edit(patch: Partial<Constraint>, key: keyof Constraint) {
    if (busy()) return;
    const next = configure(state(), patch);
    setState(next);
    setResult(null);
    setLastRun(null);
    setMarks(editMarkIds(key));
    setChange(configChange(next));
    resetVisuals();
  }

  function scale() {
    const before = state();
    if (busy() || pendingPod(before)) return;
    const next = scaleUp(before);
    setState(next);
    setResult(null);
    setLastRun(null);
    setMarks(editMarkIds('scale'));
    setChange(scaleChange(next, pendingPod(next)!.id));
    resetVisuals();
  }

  function remove() {
    const before = state();
    const victim = newestAssigned(before);
    if (busy() || !victim) return;
    const next = removeNewest(before);
    setState(next);
    setResult(null);
    setLastRun(null);
    setMarks([]);
    setChange(removeChange(next, victim));
    resetVisuals();
  }

  function reset() {
    if (busy()) return;
    setState(initialState());
    setResult(null);
    setLastRun(null);
    setMarks([]);
    setChange(resetChange());
    resetVisuals();
  }

  const outcomeFor = (index: number): Outcome | null => {
    const ev = result();
    return ev ? outcomeOf(ev.rows[index]!, ev, state().constraint.whenUnsatisfiable) : null;
  };

  const podBadge = () => {
    const open = pending();
    if (open) {
      return result()
        ? { tone: 'fail' as BadgeTone, label: `${podName(open.id)} · unscheduled · Pending` }
        : { tone: 'wait' as BadgeTone, label: `${podName(open.id)} · not run` };
    }
    const bound = result()?.selected;
    return bound && lastRun() !== null
      ? { tone: 'selected' as BadgeTone, label: `${podName(lastRun()!)} · assigned to ${bound} · not Running` }
      : { tone: 'info' as BadgeTone, label: 'no unassigned web Pod · Scale up creates one' };
  };

  const shownTitle = () => {
    const pod = shown();
    if (!pod) return 'Pod manifest · the next Pod from this template';
    return `Pod manifest · ${podName(pod.id)} · ${pod.node ? 'bound by the scheduler' : 'pending'}`;
  };

  return <div ref={root} class="anatomy-figure spread-figure" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 05 · Scheduling</span><span>Count per domain, then compare</span></div>
    <p class="spread-purpose"><strong>Goal:</strong> spread one workload’s replicas across zones or nodes. The workload author writes topologySpreadConstraints in the Pod template. When the scheduler places a new Pod, it counts matching Pods per domain and compares the skew with maxSkew. Running Pods are never moved.</p>
    <div class="spread-stage">
      <svg class="iso-svg" viewBox={`0 0 ${VIEW.width} ${VIEW.height}`} role="img" aria-labelledby="spread-title spread-desc">
        <title id="spread-title">Two-zone topology spread bench</title>
        <desc id="spread-desc">Two zone trays each hold two node bays. Stacked cartridges are assigned web Pods, so stack height is the matching count on that node. A pending cartridge waits on the queue pad and moves into a bay only when bound. A low gate at each bay lies flat only when the spread filter passed that node in the last run.</desc>
        <g innerHTML={fixtures} />
        <For each={bays}>{(bay) => <>
          <For each={slots}>{(level) => <circle class="spread-depth" cx={depthLights[bay]![level]!.x} cy={depthLights[bay]![level]!.y} r={3.2}
            data-filled={(stacks()[bay]?.length ?? 0) > level ? 'true' : 'false'} />}</For>
          <For each={slots}>{(slot) => <g transform={k.translateAlong(P, [bayCenters[bay]![0], bayCenters[bay]![1], zStack(slot)])}
            opacity={(stacks()[bay]?.length ?? 0) > slot ? 1 : 0} innerHTML={cartridge} />}</For>
          <g class="spread-gate" opacity={passed(bay) ? 0 : 1} innerHTML={gateUpright(bay)} />
          <g class="spread-gate" opacity={passed(bay) ? 1 : 0} innerHTML={gateFlat(bay)} />
        </>}</For>
        <Show when={pending()}>
          <g ref={(element) => { mover = element; }} transform={k.translateAlong(P, QUEUE)} innerHTML={movingCartridge} />
        </Show>
        <For each={identityLabels()}>{(label) => <text class="spread-identity" x={label.x} y={label.y} data-object={podName(label.id)}>{podName(label.id)}</text>}</For>
      </svg>
      <span class="spread-tag spread-zone" style={trayLabelAt(0)} data-object="zone-a">zone-a · {zoneCount('zone-a')} web Pods</span>
      <span class="spread-tag spread-zone" style={trayLabelAt(1)} data-object="zone-b">zone-b · {zoneCount('zone-b')} web Pods</span>
      <For each={nodes}>{(node, index) => <span class="spread-tag spread-node" style={bayLabelAt(index())} data-object={node.name}>
        {node.name} · {stacks()[index()]?.length ?? 0}{(stacks()[index()]?.length ?? 0) > MAX_SLOTS ? ` (${(stacks()[index()]?.length ?? 0) - MAX_SLOTS} not drawn)` : ''}
      </span>}</For>
      <Show when={pending()}>
        <span ref={(element) => { tag = element; placeTag(); }} class="spread-tag spread-pod" data-object="pending" data-state={result() ? 'unscheduled' : 'pending'}>
          {podName(pending()!.id)} · {result() ? 'unscheduled' : 'pending'}
        </span>
      </Show>
    </div>
    <ul class="anatomy-legend">
      <li>Tray: zone. Bay: Node; its tag gives the assigned web Pod count</li>
      <li>Stacked cartridge: assigned web Pod, labelled with its identity</li>
      <li>Cartridge on the queue pad: unassigned Pod. It moves into a bay only when bound</li>
      <li>Gate upright: not passed in the last run, or no run yet. Gate flat: the spread filter passed this Node in the last run. ScheduleAnyway has no filter, so every gate lies flat</li>
    </ul>
    <div class="anatomy-controls spread-controls">
      <button type="button" disabled={!hydrated() || busy() || !pending()} onClick={run}>Run placement</button>
      <label>Spread topologyKey
        <select value={state().constraint.topologyKey} disabled={!hydrated() || busy()} onChange={(event) => edit({ topologyKey: event.currentTarget.value as TopologyKey }, 'topologyKey')}>
          <option value="zone" selected={state().constraint.topologyKey === 'zone'}>{labelKeys.zone}</option>
          <option value="hostname" selected={state().constraint.topologyKey === 'hostname'}>{labelKeys.hostname}</option>
        </select>
      </label>
      <label>maxSkew
        <select value={String(state().constraint.maxSkew)} disabled={!hydrated() || busy()} onChange={(event) => edit({ maxSkew: Number(event.currentTarget.value) as 1 | 2 }, 'maxSkew')}>
          <option value="1" selected={state().constraint.maxSkew === 1}>1</option>
          <option value="2" selected={state().constraint.maxSkew === 2}>2</option>
        </select>
      </label>
      <label>whenUnsatisfiable
        <select value={state().constraint.whenUnsatisfiable} disabled={!hydrated() || busy()} onChange={(event) => edit({ whenUnsatisfiable: event.currentTarget.value as Constraint['whenUnsatisfiable'] }, 'whenUnsatisfiable')}>
          <option value="DoNotSchedule" selected={state().constraint.whenUnsatisfiable === 'DoNotSchedule'}>DoNotSchedule · filter</option>
          <option value="ScheduleAnyway" selected={state().constraint.whenUnsatisfiable === 'ScheduleAnyway'}>ScheduleAnyway · score only</option>
        </select>
      </label>
      <label><input type="checkbox" checked={state().constraint.minDomains} disabled={!hydrated() || busy() || state().constraint.whenUnsatisfiable === 'ScheduleAnyway'} onChange={(event) => edit({ minDomains: event.currentTarget.checked }, 'minDomains')} />minDomains {MIN_DOMAINS} · DoNotSchedule only</label>
      <button type="button" disabled={!hydrated() || busy() || pending() !== undefined} onClick={scale}>Scale up: create next web Pod</button>
      <button type="button" disabled={!hydrated() || busy() || counted().length === 0} onClick={remove}>Remove newest web Pod</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={reset}>Reset</button>
    </div>
    <ChangeReport change={change()} busy={busy()} />
    <div class="spread-status">
      <StateBadge tone={podBadge().tone} label={podBadge().label} />
      <StateBadge tone="info" label={`current skew ${current().currentSkew} (max − min) · maxSkew ${state().constraint.maxSkew}`} />
    </div>
    <div class="spread-cards">
      <For each={nodes}>{(node, index) => <section class="spread-card" data-object={node.name}>
        <p><strong>{node.name}</strong> · {node.zone}</p>
        <p class="spread-fact">Now: {current().rows[index()]!.matching} matching in {current().rows[index()]!.domain} · key {labelKeys[state().constraint.topologyKey]}</p>
        <div class="spread-badges">
          <Show when={outcomeFor(index())} fallback={<StateBadge tone="wait" label="not run" />}>
            <StateBadge tone={outcomeBadge[outcomeFor(index())!].tone} label={outcomeBadge[outcomeFor(index())!].label} />
          </Show>
        </div>
      </section>}</For>
    </div>
    <p class="spread-min" id="spread-min">{result()
      ? `Global minimum used at run time: ${result()!.min} over ${result()!.domains} ${state().constraint.topologyKey === 'zone' ? 'zones' : 'nodes'}${result()!.minDomainsApplied ? ' · minDomains applied' : ''}.`
      : 'Run placement fills the last three columns, and the global minimum, with the values used at run time.'}</p>
    <div class="spread-table-scroll">
      <table class="spread-table" aria-describedby="spread-min">
        <thead><tr>
          <th scope="col">Node</th><th scope="col">Domain</th>
          <th scope="col">Before this run: matching in domain</th><th scope="col">+ this Pod</th>
          <th scope="col">− global min</th><th scope="col">= skew</th><th scope="col">Result</th>
        </tr></thead>
        <tbody>
          <For each={nodes}>{(node, index) => <tr>
            <th scope="row">{node.name}</th>
            <td data-label="Domain">{basis().rows[index()]!.domain}</td>
            <td data-label="Before this run: matching in domain">{basis().rows[index()]!.matching}</td>
            <td data-label="+ this Pod">{result() ? 1 : '—'}</td>
            <td data-label="− global min">{result() ? result()!.min : '—'}</td>
            <td data-label="= skew">{result() ? result()!.rows[index()]!.skew : '—'}</td>
            <td data-label="Result">
              <Show when={outcomeFor(index())} fallback={<StateBadge tone="wait" label="not run" />}>
                <StateBadge tone={outcomeBadge[outcomeFor(index())!].tone} label={outcomeBadge[outcomeFor(index())!].label} />
              </Show>
            </td>
          </tr>}</For>
        </tbody>
      </table>
    </div>
    <ul class="spread-compact" aria-label="Candidate results">
      <For each={nodes}>{(node, index) => <li class="spread-compact-row" data-object={node.name}>
        <p><strong>{node.name}</strong> · {basis().rows[index()]!.domain}</p>
        <p class="spread-formula">{result() && lastRun() !== null
          ? `${result()!.rows[index()]!.matching} matching + ${podName(lastRun()!)} = ${result()!.rows[index()]!.ifPlaced} − min ${result()!.min} = skew ${result()!.rows[index()]!.skew}`
          : `${basis().rows[index()]!.matching} matching · not run`}</p>
        <Show when={outcomeFor(index())} fallback={<StateBadge tone="wait" label="not run" />}>
          <StateBadge tone={outcomeBadge[outcomeFor(index())!].tone} label={outcomeBadge[outcomeFor(index())!].label} />
        </Show>
      </li>}</For>
    </ul>
    <div class="anatomy-yaml-figure-grid">
      <ManifestPanel title="Node labels · set by the cluster, read by the spread" lines={nodeLines()}
        note="Highlighted: the label key that the last run or edit read." />
      <ManifestPanel title={shownTitle()} lines={podLines()}
        note="Highlighted: the constraint fields and selector a run reads, spec.nodeName after a bind, or the field an edit changed. # notes give the minimum and the filter or score while the Pod stays pending." />
    </div>
    <section class="spread-ledger" aria-label="Pod identity ledger">
      <h3>Pod ledger <span class="spread-note">identities are fixture stand-ins; a removed id is never reused</span></h3>
      <ul>
        <For each={state().pods}>{(pod) => <li data-object={podName(pod.id)}>
          <strong>{podName(pod.id)}</strong>
          <span>{pod.removed ? 'removed' : pod.node ? `on ${pod.node}` : 'no node yet'}</span>
          <span class="spread-badges">
            <Show when={pod.removed}><StateBadge tone="info" label="removed · not reused" /></Show>
            <Show when={!pod.removed && pod.node}><StateBadge tone="selected" label="assigned · not Running" /></Show>
            <Show when={!pod.removed && !pod.node}>
              <StateBadge tone={result() ? 'fail' : 'wait'} label={result() ? 'unscheduled · Pending' : 'pending · not run'} />
            </Show>
          </span>
        </li>}</For>
      </ul>
    </section>
    <p class="spread-facts">Fixture facts: node-a1 and node-a2 are in zone-a; node-b1 and node-b2 are in zone-b. web-1 and web-2 are on node-a1 and web-3 is on node-b1. Only assigned Pods count, and the pending Pod adds itself once. There are no taints, affinity, resources or priority; ties go to the earlier node name.</p>
    <p class="spread-caption">Gates change only after a run. ScheduleAnyway filters nothing, so every gate lies flat and the score only chooses among bays. Cartridges are assignments: a bound Pod is not yet Running or Ready.</p>
  </div>;
}
