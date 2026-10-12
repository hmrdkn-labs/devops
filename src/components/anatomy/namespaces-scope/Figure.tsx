import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport, { type Change } from '../shared/ChangeReport';
import ManifestPanel from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import * as g from './geometry';
import {
  advanceNamespace, clusterNames, createObject, deleteObject, identityOf, initialSelection, initialWorld, isNamespaced,
  manifestFor, namespaceNames, nameOptions, namespacedKinds, narrate, objectFor, objectsIn, reachTo, sceneGoals,
  type Kind, type NamespaceName, type NamespacePhase, type Result, type Selection, type World,
} from './model';
import './figure.css';

const kinds: Kind[] = [...namespacedKinds, 'ClusterRole'];
const phaseTone: Record<NamespacePhase, BadgeTone> = { Active: 'pass', Terminating: 'wait', Absent: 'info' };
const phaseSymbol: Record<NamespacePhase, string> = { Active: '✓', Terminating: '…', Absent: '•' };
type Reach = { tone: BadgeTone; label: string };
const initialChange: Change = {
  title: 'Fixture ready',
  changed: 'team-a holds Deployment web. team-b is empty. The cluster tower holds no ClusterRole.',
  actor: 'No action yet',
  reason: 'The fixture starts with one namespaced object so a duplicate name can be tried.',
  notYet: 'No request has reached the API server yet.',
};

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  const [world, setWorld] = createSignal<World>(initialWorld);
  const [selection, setSelection] = createSignal<Selection>(initialSelection);
  const [change, setChange] = createSignal<Change>(initialChange);
  // Identity lines are highlighted only after an action has read them; changing the selection clears this.
  const [read, setRead] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  // Visual state: each element eases toward its goal, derived from the model. No timers.
  const els = new Map<string, SVGGElement>();
  const register = (key: string, element: SVGGElement) => { els.set(key, element); };
  let goal = sceneGoals(initialWorld, initialSelection);
  const cur: Record<string, number> = { ...goal };

  const paintCard = (key: string) => {
    const presence = cur[key] ?? 0;
    const element = els.get(key);
    element?.setAttribute('transform', translateAlong(g.projection, [0, 0, (1 - presence) * g.CARD_LIFT]));
    element?.setAttribute('opacity', String(presence));
  };
  const paint = () => {
    for (const ns of namespaceNames) {
      const drawer = els.get(`drawer:${ns}`);
      drawer?.setAttribute('transform', translateAlong(g.projection, [0, g.PULL_DISTANCE * (cur[`open:${ns}`] ?? 0), 0]));
      drawer?.setAttribute('opacity', String(cur[`fade:${ns}`] ?? 0));
      for (const key of g.cardKeys) paintCard(`card:${ns}:${key}`);
    }
    for (const name of clusterNames) paintCard(`card:tower:${name}`);
    const lid = els.get('lid');
    lid?.setAttribute('transform', translateAlong(g.projection, [0, 0, (1 - (cur.lid ?? 0)) * g.CARD_LIFT]));
    lid?.setAttribute('opacity', String(cur.lid ?? 0));
  };

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / .16);
    let moving = false;
    for (const key of Object.keys(goal)) {
      const target = goal[key]!;
      const at = cur[key] ?? target;
      const next = at + (target - at) * blend;
      cur[key] = Math.abs(target - next) < .01 ? target : next;
      if (cur[key] !== target) moving = true;
    }
    paint();
    if (!moving) setBusy(false);
    return moving;
  });
  onMount(() => {
    paint();
    wake();
  });

  function commit(next: World, nextSelection: Selection, report: Change, touched: boolean) {
    setWorld(next);
    setSelection(nextSelection);
    setChange(report);
    setRead(touched);
    goal = sceneGoals(next, nextSelection);
    setBusy(true);
    wake();
  }
  function record(result: Result, selected: Selection) {
    commit(result.world, selected, narrate(result, selected, world()), true);
  }
  function create() {
    if (!busy()) record(createObject(world(), selection()), selection());
  }
  function remove() {
    if (!busy()) record(deleteObject(world(), selection()), selection());
  }
  function namespaceStep() {
    if (!busy()) record(advanceNamespace(world(), selection().namespace), selection());
  }
  function choose(patch: Partial<Selection>) {
    if (busy()) return;
    const merged = { ...selection(), ...patch };
    const options = nameOptions(merged.kind);
    const name = options.includes(merged.name) ? merged.name : options[0]!;
    commit(world(), { ...merged, name }, change(), false);
  }
  function reset() {
    if (!busy()) commit(initialWorld, initialSelection, initialChange, false);
  }

  const target = createMemo(() => objectFor(selection()));
  const targetText = createMemo(() => {
    const id = target();
    return id.namespace ? `${id.kind} ${id.name} in ${id.namespace}` : `${id.kind} ${id.name} (cluster-scoped)`;
  });
  const nsPhase = createMemo(() => world().phases[selection().namespace]);
  const onTower = createMemo(() => !isNamespaced(selection().kind));
  const clusterObjects = createMemo(() => world().objects.filter((id) => !id.namespace));
  const manifest = createMemo(() => manifestFor(selection()));

  // The path from team-a: what the DNS name needs and what the ingress rule says, kept as two separate predicates.
  const reach = createMemo(() => reachTo(world(), 'team-b'));
  const teamBAbsent = createMemo(() => world().phases['team-b'] === 'Absent');
  const dnsRow = createMemo((): Reach => {
    if (teamBAbsent()) return { tone: 'info', label: 'team-b is absent: nothing to reach' };
    return reach().serviceName
      ? { tone: 'pass', label: 'Service web in team-b: the name resolves' }
      : { tone: 'fail', label: 'no Service web in team-b: the name does not resolve' };
  });
  const ingressRow = createMemo((): Reach => {
    if (teamBAbsent()) return { tone: 'info', label: 'team-b is absent: nothing to reach' };
    return reach().allowed
      ? { tone: 'info', label: 'no NetworkPolicy in team-b: ingress not restricted' }
      : { tone: 'fail', label: 'NetworkPolicy in team-b: ingress to its Pods is blocked, except from their node' };
  });

  return (
    <div ref={root} class="anatomy-figure ns-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>Fig 03 · Namespaces</span><span>Identity = kind + namespace + name</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <svg class="iso-svg" viewBox="0 0 760 440" role="img" aria-labelledby="ns-title ns-desc">
        <title id="ns-title">Namespace drawer chest beside a cluster-scoped tower</title>
        <desc id="ns-desc">A low chest with two pull-out drawers, team-a and team-b, each holding namespaced index cards. Its back is open. A separate tower on the right holds cluster-scoped ClusterRole cards that belong to no drawer. A cable on the front rail links team-a's socket to team-b's; a lid covers team-b's socket while a deny-ingress NetworkPolicy exists there. The selected drawer slides out; a Terminating drawer is dimmed; an absent drawer is hidden. The names are in the status panels.</desc>
        <g innerHTML={g.chestBase} />
        <g innerHTML={g.bayRunners} />
        <g innerHTML={g.divider} />
        <For each={namespaceNames}>{(ns) => <g ref={(element) => register(`drawer:${ns}`, element)}>
          <g innerHTML={g.drawers[ns].tray} />
          <For each={g.cardKeys}>{(key) => <g ref={(element) => register(`card:${ns}:${key}`, element)} innerHTML={g.drawers[ns].cards[key]} />}</For>
          <g innerHTML={g.drawers[ns].front} />
        </g>}</For>
        <g innerHTML={g.chestRight} />
        <g innerHTML={g.frontRail} />
        <g innerHTML={g.socketA} />
        <g innerHTML={g.socketB} />
        <g innerHTML={g.cable} />
        <g ref={(element) => register('lid', element)} innerHTML={g.lid} />
        <g innerHTML={g.towerBase} />
        <For each={clusterNames}>{(name) => <g ref={(element) => register(`card:tower:${name}`, element)} innerHTML={g.towerCards[name]} />}</For>
        <g innerHTML={g.towerRightSide} />
      </svg>
        <section class="ns-reach" aria-label="Path from team-a to team-b">
          <h3>team-a → team-b</h3>
          <p><code>web.team-b.svc.cluster.local</code></p>
          <ul>
            <li><StateBadge tone={dnsRow().tone} label={dnsRow().label} /></li>
            <li><StateBadge tone={ingressRow().tone} label={ingressRow().label} /></li>
          </ul>
        </section>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls ns-controls">
      <div class="ns-selects">
        <label>Namespace
          <select disabled={!hydrated() || busy()} onChange={(event) => choose({ namespace: event.currentTarget.value as NamespaceName })}>
            <For each={namespaceNames}>{(ns) => <option value={ns} selected={selection().namespace === ns}>{ns}</option>}</For>
          </select>
        </label>
        <label>Kind
          <select disabled={!hydrated() || busy()} onChange={(event) => choose({ kind: event.currentTarget.value as Kind })}>
            <For each={kinds}>{(kind) => <option value={kind} selected={selection().kind === kind}>{kind}</option>}</For>
          </select>
        </label>
        <label>Name
          <select disabled={!hydrated() || busy() || nameOptions(selection().kind).length < 2} onChange={(event) => choose({ name: event.currentTarget.value as Selection['name'] })}>
            <For each={nameOptions(selection().kind)}>{(name) => <option value={name} selected={selection().name === name}>{name}</option>}</For>
          </select>
        </label>
      </div>
      <div class="ns-actions">
        <button type="button" data-anatomy-primary disabled={!hydrated() || busy()} onClick={create}>Create {targetText()}</button>
        <button type="button" disabled={!hydrated() || busy()} onClick={remove}>Delete {targetText()}</button>
        <button type="button" disabled={!hydrated() || busy()} onClick={namespaceStep}>
          {nsPhase() === 'Active' ? `Delete namespace ${selection().namespace}` : nsPhase() === 'Terminating' ? `Complete cleanup of ${selection().namespace}` : `Create namespace ${selection().namespace}`}
        </button>
        <button type="button" disabled={!hydrated() || busy()} onClick={reset}>Reset fixture</button>
      </div>
      </div>

      <ul class="ns-strip" aria-label="Scopes at a glance">
        <For each={namespaceNames}>{(ns) => <li class="ns-strip-item" aria-current={!onTower() && selection().namespace === ns ? 'true' : undefined}>
          {!onTower() && selection().namespace === ns ? <span aria-hidden="true">◆ </span> : null}
          {ns} <span aria-hidden="true">{phaseSymbol[world().phases[ns]]}</span> {world().phases[ns]} · {objectsIn(world(), ns).length}
        </li>}</For>
        <li class="ns-strip-item" aria-current={onTower() ? 'true' : undefined}>
          {onTower() ? <span aria-hidden="true">◆ </span> : null}
          cluster-scoped · {clusterObjects().length}
        </li>
      </ul>

      <ChangeReport change={change()} busy={busy()} />

      <div class="ns-tabs" data-anatomy-status>
        <For each={namespaceNames}>{(ns) => <section class="ns-tab" data-ns={ns} aria-label={`${ns} status`}
          data-target={!onTower() && selection().namespace === ns ? 'true' : 'false'}>
          <h3>{ns} <StateBadge tone={phaseTone[world().phases[ns]]} label={world().phases[ns]} /></h3>
          <Show when={!onTower() && selection().namespace === ns}><p class="ns-target">◆ target: the namespace the actions use</p></Show>
          <p class="ns-count">{objectsIn(world(), ns).length} namespaced object{objectsIn(world(), ns).length === 1 ? '' : 's'}</p>
          <ul class="ns-chips">
            <For each={objectsIn(world(), ns)}>{(id) => <li class="ns-chip"><code>{identityOf(id)}</code>
              <StateBadge tone={world().phases[ns] === 'Terminating' ? 'wait' : 'pass'} label={world().phases[ns] === 'Terminating' ? 'present · cleanup pending' : 'present'} />
            </li>}</For>
          </ul>
        </section>}</For>
        <section class="ns-tab" data-ns="tower" aria-label="Cluster-scoped status" data-target={onTower() ? 'true' : 'false'}>
          <h3>cluster-scoped <StateBadge tone="info" label="no namespace" /></h3>
          <Show when={onTower()}><p class="ns-target">◆ target: ClusterRole ignores the namespace</p></Show>
          <p class="ns-count">{clusterObjects().length} cluster-scoped object{clusterObjects().length === 1 ? '' : 's'}</p>
          <ul class="ns-chips">
            <For each={clusterObjects()}>{(id) => <li class="ns-chip"><code>{identityOf(id)}</code> <StateBadge tone="pass" label="present" /></li>}</For>
          </ul>
        </section>
      </div>
      </div>
      </div>

      <p class="ns-hint">Namespace actions use the selected namespace. A ClusterRole ignores the namespace field: its identity is kind + name only.</p>
      <ManifestPanel
        title={`Manifest · ${target().kind} ${target().name}`}
        lines={manifest().lines.map((line) => ({ text: line.text, highlight: read() && line.identity }))}
        note={manifest().note}
      />
      <p class="ns-caption">Fixture only: a teaching model, not a cluster. Actions change this fixture's state, never a live API. Each chip is one identity; the cable and lid are the team-a → team-b path. Scope, not a wall: a namespace never restricts traffic, RBAC or quota by itself.</p>
    </div>
  );
}
