import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { iso, translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport from '../shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import {
  cabinetArt, cardArt, CABINET_PITCH, CARD_TRAVEL, chassis, FEEDER_PITCH, feederTrayArt, HEAD_TRAVEL, headArt, podArt, podTrayArt,
  pressStatic, projection, replicaTab, selectorTab, specReplicaTab, specSelectorTab, statusReadyTab, statusReplicaTab, VIEW_H, VIEW_W,
} from './geometry';
import {
  apply, cardStatus, deleteObject, editCard, gateOf, initialState, podsBecomeReady, readyPods, REPLICASET_NAME, REPLICA_CHOICES,
  reportOf, reset, SELECTOR_CHOICES, sync, TEMPLATE_LABEL, type ApiEvent, type ApiState, type CardStatus, type Gate, type Pod, type Report,
  type Transition,
} from './model';
import './figure.css';

const CYCLE_SECONDS = 0.9;
/** Pending cartridges sit partly seated; Ready cartridges are fully seated. */
const CREATED_Z = -5;
const ABSENT_Z = -12;
const START: Report = {
  title: 'Converged fixture: nothing sent yet',
  changed: 'The card and the stored spec both say replicas 2, selector app=web; status observes generation 1.',
  actor: 'Fixture start',
  reason: 'Each control changes one layer: the card, the API request, the controller, or the Pods.',
  notYet: 'No request has been sent in this session.',
};
const GATE_TEXT: Record<Gate['result'], { tone: BadgeTone; mark: string; word: string }> = {
  idle: { tone: 'info', mark: '•', word: 'idle' },
  accepted: { tone: 'pass', mark: '✓', word: 'accepted' },
  rejected: { tone: 'fail', mark: '✕', word: 'rejected' },
};

function poseOf(state: ApiState, slot: number) {
  const pod = state.pods.find((candidate: Pod) => candidate.slot === slot);
  if (!pod) return { z: ABSENT_Z, alpha: 0 };
  return pod.ready ? { z: 0, alpha: 1 } : { z: CREATED_Z, alpha: 1 };
}

/** Projected position of a world point, as percentages of the stage, for adjacent labels. */
function at(point: [number, number, number]) {
  const [x, y] = iso(point, projection);
  return { left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%` };
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [state, setState] = createSignal<ApiState>(initialState());
  const [event, setEvent] = createSignal<ApiEvent | null>(null);
  const [gate, setGate] = createSignal<Gate>({ result: 'idle' });
  const [moving, setMoving] = createSignal(false);
  let root: HTMLDivElement | undefined;
  let cardEl: SVGGElement | undefined;
  let headEl: SVGGElement | undefined;
  const podEls: Array<SVGGElement | undefined> = [];
  // -1 = idle; 0..1 while the press cycle runs (card travels out and back; head strikes at the midpoint).
  let cycle = -1;
  const poses = Array.from({ length: 4 }, (_, slot) => {
    const target = poseOf(initialState(), slot);
    return { z: target.z, alpha: target.alpha, tz: target.z, ta: target.alpha };
  });

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    if (cycle >= 0) {
      cycle = reduced ? 1 : cycle + seconds / CYCLE_SECONDS;
      if (cycle >= 1) cycle = -1;
    }
    const bump = cycle < 0 ? 0 : Math.sin(Math.PI * cycle);
    cardEl?.setAttribute('transform', translateAlong(projection, [CARD_TRAVEL * bump, 0, 0]));
    headEl?.setAttribute('transform', translateAlong(projection, [0, 0, -HEAD_TRAVEL * bump]));
    let remains = cycle >= 0;
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / 0.16);
    poses.forEach((pose, slot) => {
      pose.z += (pose.tz - pose.z) * blend;
      pose.alpha += (pose.ta - pose.alpha) * blend;
      if (Math.abs(pose.tz - pose.z) < 0.05) pose.z = pose.tz;
      if (Math.abs(pose.ta - pose.alpha) < 0.002) pose.alpha = pose.ta;
      remains ||= pose.z !== pose.tz || pose.alpha !== pose.ta;
      podEls[slot]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.z]));
      podEls[slot]?.setAttribute('opacity', String(pose.alpha));
    });
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  onMount(() => {
    setHydrated(true);
    wake();
  });

  const editable = createMemo(() => hydrated() && !moving());
  const report = createMemo(() => {
    const last = event();
    return last ? reportOf(last) : START;
  });

  /** Card edits are local: they change no stored state and start no motion. */
  function editField(field: 'replicas' | 'selector', value: string) {
    if (moving()) return;
    const next = editCard(state(), field, value);
    setState(next.state);
    setEvent(next.event);
  }

  /** Every cluster action goes through here so the event, the stored state, the gate and the motion always agree. */
  function run(transition: Transition, press = false) {
    if (!editable()) return;
    setState(transition.state);
    setEvent(transition.event);
    const next = gateOf(transition.event);
    if (next) setGate(next);
    for (let slot = 0; slot < poses.length; slot++) {
      const target = poseOf(transition.state, slot);
      poses[slot]!.tz = target.z;
      poses[slot]!.ta = target.alpha;
    }
    if (press) cycle = 0;
    setMoving(true);
    wake();
  }

  const manifestLines = createMemo<ManifestLine[]>(() => {
    const manifest = state().manifest;
    const last = event();
    const replicasRead = last?.kind === 'card' ? last.field === 'replicas' : ['spec-changed', 'created', 'unchanged'].includes(last?.kind ?? '');
    const selectorRead = last?.kind === 'rejected' || (last?.kind === 'card' && last.field === 'selector');
    const rows: Array<[string, boolean]> = [
      ['apiVersion: apps/v1', false],
      ['kind: Deployment', false],
      ['metadata:', false],
      ['  name: web', false],
      ['  namespace: shop', false],
      ['spec:', false],
      [`  replicas: ${manifest.replicas}`, replicasRead],
      ['  selector:', false],
      ['    matchLabels:', false],
      [`      app: ${manifest.selector}`, selectorRead],
      ['  template:', false],
      ['    metadata:', false],
      ['      labels:', false],
      [`        app: ${TEMPLATE_LABEL}`, last?.kind === 'rejected'],
      ['    spec:', false],
      ['      containers:', false],
      ['      - name: web', false],
      ['        image: shop-web:1.0', false],
    ];
    return rows.map(([text, highlight]) => ({ text, highlight }));
  });

  const storedLines = createMemo<ManifestLine[]>(() => {
    const stored = state().stored;
    const last = event();
    if (!stored) {
      return [{ text: '# no stored object named web in shop', highlight: last?.kind === 'deleted' }, { text: '# apply creates one with generation 1' }];
    }
    const kind = last?.kind ?? '';
    const replicasRead = ['spec-changed', 'unchanged'].includes(kind);
    const generationChanged = ['created', 'spec-changed'].includes(kind);
    const uidRead = kind === 'created' || kind === 'deleted';
    const statusRead = kind === 'synced' || kind === 'in-sync';
    const rows: Array<[string, boolean]> = [
      ['apiVersion: apps/v1', false],
      ['kind: Deployment', false],
      ['metadata:', false],
      ['  name: web', false],
      ['  namespace: shop', false],
      [`  uid: ${stored.uid}`, uidRead],
      [`  generation: ${stored.generation}`, generationChanged],
      [`  resourceVersion: "${stored.resourceVersion}"`, false],
      ['spec:', false],
      [`  replicas: ${stored.replicas}`, replicasRead],
      ['  selector:', false],
      ['    matchLabels:', false],
      ['      app: web', false],
      ['status:', false],
      [`  observedGeneration: ${stored.observedGeneration}`, statusRead],
      [`  replicas: ${stored.statusReplicas}`, statusRead],
      [`  readyReplicas: ${stored.statusReady}`, statusRead],
    ];
    return rows.map(([text, highlight]) => ({ text, highlight }));
  });

  const gateLabel = createMemo(() => {
    const current = gate();
    if (current.result === 'rejected') return 'gate: rejected (last apply)';
    if (current.result === 'accepted') return 'gate: accepted (last apply)';
    return 'gate: idle (no apply yet)';
  });

  const badge = createMemo(() => {
    const current = state();
    const stored = current.stored;
    const ready = readyPods(current);
    const pods = current.pods.length;
    const want = stored?.replicas ?? 0;
    const cardView: Record<CardStatus, { tone: BadgeTone; label: string }> = {
      equal: { tone: 'pass', label: 'card = stored spec' },
      edited: { tone: 'info', label: 'card edited, not sent' },
      rejected: { tone: 'fail', label: `card sent, rejected (selector app=${current.manifest.selector} ≠ template labels)` },
      deleted: { tone: 'wait', label: 'object deleted; card not re-sent' },
    };
    const observedTone: BadgeTone = !stored ? 'info' : stored.observedGeneration === stored.generation ? 'pass' : 'wait';
    const statusTone: BadgeTone = !stored ? 'info' : stored.statusReady === want ? 'pass' : 'wait';
    const liveTone: BadgeTone = pods === want && ready === pods ? 'pass' : pods === 0 && want === 0 ? 'info' : 'wait';
    return {
      card: cardView[cardStatus(current)].tone,
      cardLabel: cardView[cardStatus(current)].label,
      stored: 'info' as BadgeTone,
      storedLabel: stored ? `web · ${stored.uid} · gen ${stored.generation}` : 'no object web',
      observed: observedTone,
      observedLabel: !stored ? 'nothing observed' : `observed gen ${stored.observedGeneration} of ${stored.generation}`,
      status: statusTone,
      statusLabel: !stored ? 'no status' : `status.readyReplicas ${stored.statusReady}/${want}`,
      live: liveTone,
      liveLabel: `Pods ${ready} Ready of ${pods} · want ${want}`,
    };
  });

  const podRows = createMemo(() => [0, 1, 2, 3].map((slot) => ({
    slot,
    pod: state().pods.find((candidate) => candidate.slot === slot),
  })));

  const socketRow = createMemo(() => podRows().map((row) => `${row.slot + 1} ${row.pod ? (row.pod.ready ? '✓' : '…') : '—'}`).join('   '));

  const owner = createMemo(() => {
    const current = state();
    if (!current.stored) return 'No object, so no ReplicaSet and no Pods.';
    const total = current.pods.length;
    const ready = readyPods(current);
    return `ReplicaSet ${REPLICASET_NAME} (collapsed into the controller sync) owns ${total} Pod${total === 1 ? '' : 's'}: ${ready} Ready, ${total - ready} Pending.`;
  });

  return (
    <div ref={root} class="anatomy-figure api-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 02 · FILING PRESS</span><span>Accepted ≠ observed ≠ Ready</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <div class="api-stage">
        <svg class="iso-svg" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-labelledby="api-title api-description">
          <title id="api-title">A labelled filing press with a feeder card, a validation gate, a record cabinet and four Pod sockets</title>
          <desc id="api-description">A manifest card waits in the feeder tray. Apply slides it under the press head, which strikes only in a stamp. The spec drawer holds the stored desired state; the status drawer holds what the controller last observed. Four sockets hold Pods: Pending is partly seated, Ready is fully seated.</desc>
          <g innerHTML={chassis} />
          <g innerHTML={feederTrayArt} />
          <g innerHTML={pressStatic} />
          <g ref={cardEl} transform={translateAlong(projection, [0, 0, 0])}>
            <g innerHTML={cardArt} />
            <g innerHTML={replicaTab} transform={translateAlong(projection, [state().manifest.replicas * FEEDER_PITCH, 0, 0])} />
            <g innerHTML={selectorTab} transform={translateAlong(projection, [(state().manifest.selector === TEMPLATE_LABEL ? 0 : 1) * FEEDER_PITCH, 0, 0])} />
          </g>
          <g ref={headEl} transform={translateAlong(projection, [0, 0, 0])}>
            <g innerHTML={headArt} />
          </g>
          <g class="api-lamps">
            <circle class="api-lamp" data-state={gate().result === 'accepted' ? 'pass' : undefined} cx={iso([-7, 36, 18], projection)[0]} cy={iso([-7, 36, 18], projection)[1]} r="2.4" />
            <circle class="api-lamp" data-state={gate().result === 'rejected' ? 'fail' : undefined} cx={iso([7, 36, 18], projection)[0]} cy={iso([7, 36, 18], projection)[1]} r="2.4" />
          </g>
          <g innerHTML={podTrayArt} />
          <For each={[0, 1, 2, 3]}>{(slot) => {
            const initial = poseOf(state(), slot);
            return (
              <g ref={(element) => { podEls[slot] = element; }} opacity={initial.alpha} transform={translateAlong(projection, [0, 0, initial.z])}>
                <g innerHTML={podArt[slot]!} />
              </g>
            );
          }}</For>
          <g innerHTML={cabinetArt} />
          <g innerHTML={specReplicaTab} opacity={state().stored ? 1 : 0} transform={translateAlong(projection, [(state().stored?.replicas ?? 0) * CABINET_PITCH, 0, 0])} />
          <g innerHTML={specSelectorTab} opacity={state().stored ? 1 : 0} />
          <g innerHTML={statusReplicaTab} opacity={state().stored ? 1 : 0} transform={translateAlong(projection, [(state().stored?.statusReplicas ?? 0) * CABINET_PITCH, 0, 0])} />
          <g innerHTML={statusReadyTab} opacity={state().stored ? 1 : 0} transform={translateAlong(projection, [(state().stored?.statusReady ?? 0) * CABINET_PITCH, 0, 0])} />
        </svg>
        <div class="api-labels" aria-hidden="true">
          <span class="api-label" style={at([-176, 36, 14])}><b>card</b><i>local file</i></span>
          <span class="api-label api-label-gate" style={at([6, 30, 44])}><b>API server gate</b><i>{GATE_TEXT[gate().result].mark} {GATE_TEXT[gate().result].word}</i></span>
          <span class="api-label" style={at([150, -66, 62])}><b>spec · web</b><i>{state().stored ? `gen ${state().stored!.generation}` : 'no object'}</i></span>
          <span class="api-label" style={at([160, 62, 56])}><b>status · web</b><i>{state().stored ? `observed ${state().stored!.observedGeneration}` : 'none'}</i></span>
          <span class="api-label api-sockets" style={at([-8, 118, 20])}><b>sockets</b><i>{socketRow()}</i></span>
        </div>
      </div>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls api-controls">
        <div class="api-selects">
          <label>Card replicas
            <select value={String(state().manifest.replicas)} disabled={!editable()} onChange={(change) => editField('replicas', change.currentTarget.value)}>
              <For each={[...REPLICA_CHOICES]}>{(count) => <option value={String(count)} selected={state().manifest.replicas === count}>{count}</option>}</For>
            </select>
          </label>
          <label>Card selector app
            <select value={state().manifest.selector} disabled={!editable()} onChange={(change) => editField('selector', change.currentTarget.value)}>
              <For each={[...SELECTOR_CHOICES]}>{(choice) => <option value={choice} selected={state().manifest.selector === choice}>{choice}</option>}</For>
            </select>
          </label>
        </div>
        <div class="api-actions">
          <button type="button" data-anatomy-primary disabled={!editable()} onClick={() => run(apply(state()), true)}>Apply card (kubectl apply)</button>
          <button type="button" disabled={!editable()} onClick={() => run(sync(state()))}>Run controller sync</button>
          <button type="button" disabled={!editable()} onClick={() => run(podsBecomeReady(state()))}>Fixture: Pods become Ready</button>
          <button type="button" disabled={!editable()} onClick={() => run(deleteObject(state()))}>Delete Deployment</button>
          <button type="button" disabled={!hydrated() || moving()} onClick={() => run(reset())}>Reset fixture</button>
        </div>
      </div>
      <ChangeReport change={report()} busy={moving()} />
      <div class="anatomy-status-columns" data-anatomy-status>
        <section class="api-status" role="group" aria-label="Per-object status">
          <h3 class="anatomy-panel-heading">Objects</h3>
          <div class="api-chips">
            <StateBadge tone={badge().card} label={badge().cardLabel} />
            <StateBadge tone={GATE_TEXT[gate().result].tone} label={gateLabel()} />
            <StateBadge tone={badge().stored} label={badge().storedLabel} />
            <StateBadge tone={badge().observed} label={badge().observedLabel} />
            <StateBadge tone={badge().status} label={badge().statusLabel} />
            <StateBadge tone={badge().live} label={badge().liveLabel} />
          </div>
        </section>
        <section class="api-ledger" aria-labelledby="api-ledger-title">
          <h3 class="anatomy-panel-heading" id="api-ledger-title">Pod ledger</h3>
          <p class="api-owner">{owner()}</p>
          <ul class="anatomy-status-list">
            <For each={podRows()}>{(row) => (
              <li data-slot={row.slot}>
                <strong>{row.pod ? row.pod.name : 'empty socket'}</strong>
                <StateBadge tone={row.pod ? (row.pod.ready ? 'pass' : 'wait') : 'info'} label={row.pod ? (row.pod.ready ? 'Ready' : 'Pending, not Ready') : 'no Pod'} />
                <span class="anatomy-status-detail">Socket {row.slot + 1}</span>
              </li>
            )}</For>
          </ul>
        </section>
      </div>
      </div>
      </div>
      <p class="api-hint">Pod names follow Deployment's pattern: &lt;name&gt;-&lt;ReplicaSet hash&gt;-&lt;suffix&gt;. Suffixes are fixture stand-ins. A deleted Pod's name never returns.</p>
      <div class="anatomy-yaml-figure-grid">
        <ManifestPanel title="Manifest card (local file)" lines={manifestLines()} note="Template labels and image are fixed in this fixture." />
        <ManifestPanel title="Stored object (API server record)" lines={storedLines()} note="Template omitted: it matches the card. uid and resourceVersion are fixture stand-ins." />
      </div>
      <p class="api-hint">The gate readout shows the last apply result. Sync writes status from what exists now, so Pods that become Ready are reported in status only at the next sync. Controls lock while the press or a Pod moves.</p>
    </div>
  );
}
