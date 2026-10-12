import { createMemo, createSignal, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport, { type Change } from '../shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import { base, box, bracket, carriage, carriageTravel, move, P, rack, rail, store, stampHead, stampPress, view, viewBox } from './geometry';
import { initialWorld, keyNameOf, objects, rollOut, setStored, stage, syncVolumes, valueOf, type Source, type Spec, type Version, type World } from './model';
import { storeLines, templateLines, type LineTag } from './manifest';
import { appView, describeSpec, editReport, resetReport, rolloutReport, stageReport, syncReport } from './report';
import './figure.css';

type Motion = 'idle' | 'sync' | 'rollout';
interface Pending { world: World; report: Change; tags: LineTag[] }
type Align = 'start' | 'center' | 'end';

/** A world point as a percentage of the stage, so HTML labels sit beside the part they name. */
function locate(point: [number, number, number]) {
  const [x, y] = k.iso(point, P);
  return { left: `${((x - view.x) / view.w) * 100}%`, top: `${((y - view.y) / view.h) * 100}%` };
}

/** Each label's anchor point on its part, and the side of that anchor the label extends into. */
const labels: Record<'configmap' | 'secret' | 'kubelet' | 'rack' | 'clip' | 'stamp' | 'pod' | 'blocked', { point: [number, number, number]; align: Align }> = {
  configmap: { point: [-146, 90, 76], align: 'start' },
  secret: { point: [-146, 90, 36], align: 'start' },
  kubelet: { point: [-17, -70, 80], align: 'center' },
  rack: { point: [92, -72, 36], align: 'center' },
  clip: { point: [51, 5, 48], align: 'end' },
  stamp: { point: [104, -7, 98], align: 'center' },
  pod: { point: [94, 52, 34], align: 'center' },
  blocked: { point: [124, 52, 8], align: 'center' },
};

const startChange: Change = {
  title: 'Starting state',
  changed: `ConfigMap ${objects.configmap.name} stores ${valueOf('configmap', 0)}. Pod app-7f9c5d-x4k2q reads it as an environment variable.`,
  actor: 'The Deployment controller created this Pod from the template; kubelet started its container.',
  reason: 'The fixture begins with one running Pod. Its reference stays fixed until a new Pod is created.',
  notYet: 'No edit, sync or rollout has happened yet.',
};
const syncInProgress: Change = {
  title: 'Kubelet sync in progress',
  changed: 'The carriage carries the stored data to the mounted rack.',
  actor: 'kubelet on the node, during periodic sync',
  reason: 'Periodic sync is shown here as one explicit action.',
  notYet: 'The Pod view changes when the carriage returns.',
};
const rolloutInProgress: Change = {
  title: 'Rollout in progress',
  changed: 'The stamp presses while the container starts from the staged template.',
  actor: 'Deployment controller and kubelet',
  reason: 'A rollout creates a Pod with a new name and reads stored values when its container starts.',
  notYet: 'The Pod result appears when the stamp returns.',
};

const fieldTag: Record<keyof Spec, LineTag> = { source: 'source', delivery: 'delivery', misspelledKey: 'key', optional: 'optional' };

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [legendOpen, setLegendOpen] = createSignal(true);
  onMount(() => {
    setHydrated(true);
    setLegendOpen(!window.matchMedia('(max-width: 720px)').matches);
  });
  let root: HTMLDivElement | undefined;
  let carriageEl: SVGGElement | undefined;
  let stampEl: SVGGElement | undefined;

  const [shown, setShown] = createSignal<World>(initialWorld());
  const [change, setChange] = createSignal<Change>(startChange);
  const [highlight, setHighlight] = createSignal<Set<LineTag>>(new Set());
  const [motion, setMotion] = createSignal<Motion>('idle');
  const [pending, setPending] = createSignal<Pending | null>(null);
  const busy = () => motion() !== 'idle';

  // Motion is one bounded clock. Its end commits the pending result, so nothing shows before its animation.
  let clock = 0;
  let carX = 0;
  let stampZ = 0;
  const duration = 1.2;
  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    if (motion() === 'idle') return false;
    clock = reduced ? duration : clock + dt;
    const p = Math.min(clock / duration, 1);
    carX = motion() === 'sync' ? carriageTravel * Math.sin(Math.PI * p) : 0;
    stampZ = motion() === 'rollout' ? stampPress * Math.sin(Math.PI * Math.min(p / 0.6, 1)) : 0;
    carriageEl?.setAttribute('transform', move(carX));
    stampEl?.setAttribute('transform', move(0, 0, stampZ));
    if (p < 1) return true;
    finish();
    return false;
  });

  function finish() {
    const next = pending();
    carX = 0;
    stampZ = 0;
    carriageEl?.setAttribute('transform', move(0));
    stampEl?.setAttribute('transform', move(0, 0, 0));
    setMotion('idle');
    if (!next) return;
    setPending(null);
    setShown(next.world);
    setChange(next.report);
    setHighlight(new Set(next.tags));
  }

  function startMotion(kind: Exclude<Motion, 'idle'>, next: Pending, progress: Change) {
    setPending(next);
    setChange(progress);
    setMotion(kind);
    clock = 0;
    wake();
  }

  function applyNow(next: World, report: Change, tags: LineTag[]) {
    setShown(next);
    setChange(report);
    setHighlight(new Set(tags));
  }

  function stageWith(patch: Partial<Spec>) {
    if (busy()) return;
    const next = stage(shown(), patch);
    const tags = (Object.keys(patch) as (keyof Spec)[]).map((field) => fieldTag[field]);
    applyNow(next, stageReport(next), tags);
  }

  function editStored(source: Source) {
    if (busy()) return;
    const before = shown();
    const version: Version = before.stored[source] === 0 ? 1 : 0;
    const next = setStored(before, source, version);
    applyNow(next, editReport(before, next, source), [source === 'configmap' ? 'data-cm' : 'data-secret']);
  }

  function sync() {
    if (busy()) return;
    const before = shown();
    const next = syncVolumes(before);
    startMotion('sync', { world: next, report: syncReport(before, next), tags: ['delivery', 'source', 'key'] }, syncInProgress);
  }

  function rollout() {
    if (busy()) return;
    const before = shown();
    const next = rollOut(before);
    startMotion('rollout', { world: next, report: rolloutReport(before, next), tags: ['source', 'key', 'optional', 'delivery'] }, rolloutInProgress);
  }

  function reset() {
    if (busy()) return;
    applyNow(initialWorld(), resetReport(), []);
  }

  const templateView = createMemo<ManifestLine[]>(() => {
    const lines = templateLines(shown().spec);
    return lines.map((line) => ({ text: line.text, highlight: !!line.tag && highlight().has(line.tag) }));
  });
  const storeView = createMemo<ManifestLine[]>(() => {
    const lines = storeLines(shown().stored);
    return lines.map((line) => ({ text: line.text, highlight: !!line.tag && highlight().has(line.tag) }));
  });

  const pod = () => shown().pod;
  const volumeState = () => (pod().spec.delivery === 'volume' && pod().seen !== null ? 'present' : 'absent');
  const subpathState = () => (pod().spec.delivery === 'subpath' && pod().seen !== null ? 'present' : 'absent');
  const envState = () => {
    if (pod().spec.delivery !== 'env') return 'none';
    return pod().seen === null ? 'unset' : 'value';
  };
  const tagText = createMemo(() => {
    const p = pod();
    const object = objects[p.spec.source];
    const value = p.seen === null ? null : valueOf(p.spec.source, p.seen);
    return {
      rack: p.spec.delivery !== 'volume' ? 'no mounted file' : value === null ? `file ${object.file} absent` : `file ${object.file}=${value}`,
      clip: p.spec.delivery !== 'subpath' ? 'no subPath copy' : value === null ? 'subPath copy absent' : `subPath copy=${value}`,
      stamp: p.spec.delivery !== 'env' ? 'no env value' : value === null ? `env ${object.key} unset` : `env ${object.key}=${value}`,
    };
  });
  const activeCount = (source: Source) => (pod().spec.source === source ? 1 : 0);
  const stagedCount = (source: Source) => (shown().spec.source === source ? 1 : 0);
  const pendingSpec = () => shown().spec.source !== pod().spec.source || shown().spec.delivery !== pod().spec.delivery || shown().spec.misspelledKey !== pod().spec.misspelledKey || shown().spec.optional !== pod().spec.optional;
  const secretValue = () => valueOf('secret', shown().stored.secret);
  const configValue = () => valueOf('configmap', shown().stored.configmap);
  const tone = (count: number): BadgeTone => (count > 0 ? 'selected' : 'info');
  const blockedCandidate = () => shown().blocked;

  return <div ref={root} class="anatomy-figure cs-figure" aria-busy={!hydrated()}
    data-volume={volumeState()} data-subpath={subpathState()} data-env={envState()}
    data-active-drawer={pod().spec.source} data-staged-drawer={shown().spec.source}>
    <div class="anatomy-figure-header"><span>Fig 01 · Configuration</span><span>Same image, settings from outside</span></div>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <div class="cs-stage">
      <svg class="iso-svg" viewBox={viewBox} role="img" aria-labelledby="cs-title cs-desc">
        <title id="cs-title">Settings delivery apparatus</title>
        <desc id="cs-desc">A store cabinet holds a ConfigMap drawer above a Secret drawer. A kubelet carriage on a rail carries stored data to a mounted rack. A sealed container box has a start-time stamp, a mounted rack card and a pinned subPath clip. Cards the active Pod cannot read are dimmed.</desc>
        <g innerHTML={base} />
        <g innerHTML={store} />
        <g innerHTML={rack} />
        <g innerHTML={rail} />
        <g ref={(el) => { carriageEl = el; }} transform={move(0)} innerHTML={carriage} />
        <g innerHTML={bracket} />
        <g innerHTML={box} />
        <g class="cs-stamp" ref={(el) => { stampEl = el; }} transform={move(0, 0, 0)} innerHTML={stampHead} />
      </svg>
      <div class="cs-tags" aria-hidden="true">
        <span class="cs-tag" data-object="configmap" data-align={labels.configmap.align} style={locate(labels.configmap.point)}>ConfigMap {objects.configmap.name}</span>
        <span class="cs-tag" data-object="secret" data-align={labels.secret.align} style={locate(labels.secret.point)}>Secret {objects.secret.name}</span>
        <span class="cs-tag" data-object="kubelet" data-align={labels.kubelet.align} style={locate(labels.kubelet.point)}>kubelet</span>
        <span class="cs-tag" data-object="rack" data-align={labels.rack.align} style={locate(labels.rack.point)}>{tagText().rack}</span>
        <span class="cs-tag" data-object="clip" data-align={labels.clip.align} style={locate(labels.clip.point)}>{tagText().clip}</span>
        <span class="cs-tag" data-object="stamp" data-align={labels.stamp.align} style={locate(labels.stamp.point)}>{tagText().stamp}</span>
        <span class="cs-tag" data-object="pod" data-align={labels.pod.align} style={locate(labels.pod.point)}>Pod {pod().name}</span>
        <Show when={blockedCandidate()}>{(candidate) => <span class="cs-tag cs-tag-blocked" data-object="blocked" data-align={labels.blocked.align} style={locate(labels.blocked.point)}>not started: {candidate().name}</span>}</Show>
      </div>
    </div>
    <ul class="cs-identity" aria-label="Active Pod identity">
      <li>Pod {pod().name}</li>
      <li>{appView(pod())}</li>
      <Show when={blockedCandidate()}>{(candidate) => <li class="cs-identity-blocked">not started: {candidate().name}</li>}</Show>
    </ul>
    <p class="anatomy-readout cs-readout" data-readout>
      {`Active ${pod().name} · ${appView(pod())}`}{pendingSpec() ? ' · staged template not rolled out' : ''}
    </p>
    <details class="cs-legend" open={legendOpen()}>
      <summary>Key to the apparatus</summary>
      <ul class="anatomy-legend">
        <li>Top drawer = ConfigMap, lower drawer = Secret</li>
        <li>Padlock = Secret drawer: base64 is an encoding, not encryption</li>
        <li>Carriage = kubelet sync to the rack</li>
        <li>Stamp = container start; lit only while env is read here</li>
      </ul>
    </details>
    </div>
    <div class="anatomy-bench-panel">
    <fieldset class="cs-group cs-actions" disabled={!hydrated() || busy()}>
      <legend>Stored data (API write) and cluster actions</legend>
      <div class="cs-grid">
        <button type="button" data-anatomy-primary onClick={() => editStored('configmap')}>{shown().stored.configmap === 0 ? `Update ConfigMap value to ${valueOf('configmap', 1)}` : `Restore ConfigMap value to ${valueOf('configmap', 0)}`}</button>
        <button type="button" onClick={() => editStored('secret')}>{shown().stored.secret === 0 ? `Update Secret value to ${valueOf('secret', 1)}` : `Restore Secret value to ${valueOf('secret', 0)}`}</button>
        <button type="button" onClick={sync}>Kubelet sync (mounted files only)</button>
        <button type="button" onClick={rollout}>Roll out template (new Pod)</button>
      </div>
      <div class="cs-fixture">
        <button type="button" onClick={reset} disabled={!hydrated() || busy()}>Reset fixture</button>
      </div>
    </fieldset>
    <div class="cs-change">
      <ChangeReport change={change()} busy={busy()} />
    </div>
    <fieldset class="cs-group cs-staged" disabled={!hydrated() || busy()}>
      <legend>Staged Pod template · applies to the next Pod</legend>
      <div class="cs-choice" role="radiogroup" aria-label="Object source">
        <label><input type="radio" name="cs-source" checked={shown().spec.source === 'configmap'} onChange={() => stageWith({ source: 'configmap' })} />ConfigMap app-settings</label>
        <label><input type="radio" name="cs-source" checked={shown().spec.source === 'secret'} onChange={() => stageWith({ source: 'secret' })} />Secret app-secrets</label>
      </div>
      <label class="cs-check"><input type="checkbox" checked={shown().spec.misspelledKey} onChange={(e) => stageWith({ misspelledKey: e.currentTarget.checked })} /><span>Reference a key the object does not hold ({keyNameOf({ ...shown().spec, misspelledKey: true })})</span></label>
      <label class="cs-check"><input type="checkbox" checked={shown().spec.optional} onChange={(e) => stageWith({ optional: e.currentTarget.checked })} /><span>optional: true</span></label>
      <div class="cs-choice cs-choice-3" role="radiogroup" aria-label="Delivery path">
        <label><input type="radio" name="cs-delivery" checked={shown().spec.delivery === 'env'} onChange={() => stageWith({ delivery: 'env' })} />Environment variable</label>
        <label><input type="radio" name="cs-delivery" checked={shown().spec.delivery === 'volume'} onChange={() => stageWith({ delivery: 'volume' })} />Mounted volume</label>
        <label><input type="radio" name="cs-delivery" checked={shown().spec.delivery === 'subpath'} onChange={() => stageWith({ delivery: 'subpath' })} />subPath mount</label>
      </div>
    </fieldset>
    <ul class="anatomy-status-list cs-status" data-anatomy-status aria-label="Per-object state">
      <li class="cs-card" data-object="configmap">
        <strong>ConfigMap {objects.configmap.name}</strong>
        <StateBadge tone={tone(activeCount('configmap'))} label={activeCount('configmap') ? 'referenced by active Pod' : 'not referenced by active Pod'} />
        <span class="anatomy-status-detail">{objects.configmap.key} = {configValue()} · referenced by active Pod {activeCount('configmap')} · staged template {stagedCount('configmap')}</span>
      </li>
      <li class="cs-card" data-object="secret">
        <strong>Secret {objects.secret.name}</strong>
        <StateBadge tone={tone(activeCount('secret'))} label={activeCount('secret') ? 'referenced by active Pod' : 'not referenced by active Pod'} />
        <span class="anatomy-status-detail">{objects.secret.key} stored as base64 {btoa(secretValue())} · an encoding, not encryption · referenced by active Pod {activeCount('secret')} · staged template {stagedCount('secret')}</span>
      </li>
      <li class="cs-card" data-object="pod">
        <strong>Active Pod {pod().name}</strong>
        <StateBadge tone="pass" label="Running" />
        <span class="anatomy-status-detail">{describeSpec(pod().spec)} · {appView(pod())} · container started; Ready not modelled</span>
      </li>
      <Show when={blockedCandidate()}>{(candidate) => <li class="cs-card" data-object="blocked">
        <strong>Replacement {candidate().name}</strong>
        <StateBadge tone="fail" label="Not started" />
        <span class="anatomy-status-detail">{describeSpec(candidate().spec)} · the active Pod keeps running</span>
      </li>}</Show>
    </ul>
    </div>
    </div>
    <div class="anatomy-yaml-figure-grid">
      <ManifestPanel title="Deployment template (staged)" lines={templateView()} note={pendingSpec() ? `Running ${pod().name} still has: ${describeSpec(pod().spec)}.` : 'Matches the running Pod.'} />
      <ManifestPanel title="Stored objects" lines={storeView()} note="Secret data is base64: an encoding anyone who can read the object can decode, not encryption." />
    </div>
    <p class="anatomy-fixture-note cs-caption">Pods are created by a controller from the template. A running Pod keeps the reference it was created with. Only a mounted volume follows the object after kubelet sync, and never a subPath copy. Assignment is not Running; Running is not Ready.</p>
  </div>;
}
