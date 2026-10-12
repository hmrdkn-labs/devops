import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import ChangeReport from '../shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '../shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '../shared/StateBadge';
import { base, cartridge, floor, gateBack, gateBlade, gateFront, gateX, lamp, move, sleeve, stateMark, startX, stopBefore, trayBack, trayFront, trayX, viewBox } from './geometry';
import {
  callers, defaultsToFill, evaluate, fieldPath, gateStates, initialConfig, liftOf, operations, podLines, profiles, rbacLines, readKeys,
  reportForChange, reportForMotion, reportForOutcome, stages, stateSymbol,
  type Caller, type Config, type Evaluation, type GateId, type Operation, type PodProfile, type Report,
} from './model';
import './figure.css';

const gateIds: GateId[] = ['authn', 'binding', 'rule', 'validate'];
/** Blade heights: passed lifts fully under the bridge, not enforced lifts halfway, anything else stays down. */
const heights = { up: 44, half: 22, down: 0 } as const;
const controlKeys: Record<keyof Config, string[]> = {
  caller: ['sa'], operation: ['role'], roleBinding: ['rb'], enforceRestricted: ['ns'],
  podProfile: Object.keys(fieldPath).map((field) => `ctx:${field}`), mutatingDefaults: [],
};

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  let cart: SVGGElement | undefined;
  const blades: Array<SVGGElement | undefined> = [];
  const [config, setConfig] = createSignal<Config>({ ...initialConfig });
  const [evaluation, setEvaluation] = createSignal<Evaluation | null>(null);
  const [phase, setPhase] = createSignal<'idle' | 'moving' | 'done'>('idle');
  const [report, setReport] = createSignal<Report>(reportForChange('Initial request: a hardened Pod from the ServiceAccount deployer.'));
  const [focus, setFocus] = createSignal<Set<string>>(new Set());
  let pending: Evaluation | null = null;
  let carX = startX;
  let targetX = startX;
  const bladeZ = gateIds.map(() => 0);
  let bladeTarget: number[] = [...bladeZ];

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const follow = (at: number, to: number) => {
      const next = reduced ? to : at + (to - at) * (1 - Math.exp(-seconds / 0.18));
      return Math.abs(next - to) < 0.025 ? to : next;
    };
    carX = follow(carX, targetX);
    cart?.setAttribute('transform', move(carX));
    let moving = carX !== targetX;
    bladeZ.forEach((z, i) => {
      bladeZ[i] = follow(z, bladeTarget[i]!);
      blades[i]?.setAttribute('transform', move(0, 0, bladeZ[i]!));
      if (bladeZ[i] !== bladeTarget[i]) moving = true;
    });
    if (!moving && phase() === 'moving' && pending) {
      const settled = pending;
      pending = null;
      setEvaluation(settled);
      setFocus(readKeys(settled));
      setReport(reportForOutcome(config(), settled));
      setPhase('done');
    }
    return moving;
  });

  function snapToStart() {
    carX = targetX = startX;
    bladeZ.forEach((_, i) => {
      bladeZ[i] = 0;
      bladeTarget[i] = 0;
      blades[i]?.setAttribute('transform', move(0, 0, 0));
    });
    cart?.setAttribute('transform', move(startX));
  }
  /** A control edit starts a new request from the initial state of the rail; it never resumes a previous send. */
  function change(patch: Partial<Config>, label: string, keys: string[]) {
    if (phase() === 'moving') return;
    setConfig({ ...config(), ...patch });
    setEvaluation(null);
    pending = null;
    setPhase('idle');
    snapToStart();
    setFocus(new Set(keys));
    setReport(reportForChange(label));
  }
  function send() {
    if (phase() === 'moving') return;
    const outcome = evaluate(config());
    pending = outcome;
    setEvaluation(null);
    setPhase('moving');
    setFocus(new Set<string>());
    setReport(reportForMotion());
    targetX = outcome.stop === null ? trayX : stopBefore(gateX[outcome.stop]);
    const states = gateStates(outcome);
    bladeTarget = gateIds.map((id) => heights[liftOf(states[id])]);
    wake();
  }
  function reset() {
    if (phase() === 'moving') return;
    setConfig({ ...initialConfig });
    setEvaluation(null);
    pending = null;
    setPhase('idle');
    snapToStart();
    setFocus(new Set<string>());
    setReport(reportForChange('Reset to the initial request: hardened Pod, binding present, sandbox enforces restricted, no mutating step.'));
  }

  const busy = () => phase() === 'moving';
  const states = createMemo(() => gateStates(evaluation()));
  const stageCards = createMemo(() => stages(config(), evaluation()));
  const pod = createMemo<ManifestLine[]>(() => podLines(config(), evaluation(), focus()));
  const rbac = createMemo<ManifestLine[]>(() => rbacLines(config(), focus()));
  /** The Pod's status is about this send only: idle, in flight, then the stored result. */
  const podBadge = (): { tone: BadgeTone; label: string } => {
    if (phase() === 'idle') return { tone: 'wait', label: 'not sent yet' };
    if (phase() === 'moving') return { tone: 'wait', label: 'in flight · not stored yet' };
    return evaluation()?.persisted ? { tone: 'pass', label: 'stored · unassigned' } : { tone: 'info', label: 'not stored' };
  };
  const podNote = () => {
    const ev = evaluation();
    if (!ev || config().operation !== 'create-pod' || ev.validate === 'unreached') return undefined;
    return ev.mutated.length
      ? 'Lines marked added were filled by the mutating step; validation read this object.'
      : 'Highlighted lines were read by the last send.';
  };

  return <div ref={root} class="anatomy-figure ac-figure" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Security · request path</span><span>Authenticate, authorize, then admit</span></div>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <svg class="iso-svg ac-machine" viewBox={viewBox} role="img" aria-labelledby="ac-title ac-desc">
      <title id="ac-title">Request cartridge moving through four numbered gates to an etcd tray</title>
      <desc id="ac-desc">A single rail with four numbered gates: 1 reads the caller's credential, 2 checks for a RoleBinding that names the caller, 3 checks the bound Role's rule, and 4 is PodSecurity. The M sleeve beside the rail is the mutating step, which fills defaults before gate 4 reads the object. A blade lifted to full height passed its check. A half-lifted dashed blade was not enforced, so no check ran. A lowered blade with a cross failed. A faded blade was not reached. A lowered blade with an ellipsis has not been evaluated. The cartridge reaches the etcd tray only when no gate stops it. The machine is an illustration of the order of checks, not a live cluster.</desc>
      <g innerHTML={base} />
      <g innerHTML={floor} />
      <For each={gateIds}>{(id) => <g innerHTML={gateBack(gateX[id])} />}</For>
      <g innerHTML={trayBack} />
      <g ref={cart} transform={move(startX)} innerHTML={cartridge} />
      <For each={gateIds}>{(id, index) => <g class="ac-gate" data-gate={id} data-gate-state={states()[id]} ref={(el) => { blades[index()] = el; }} transform={move(0, 0, 0)} innerHTML={gateBlade(gateX[id])} />}</For>
      <For each={gateIds}>{(id) => <g innerHTML={gateFront(gateX[id])} />}</For>
      <For each={gateIds}>{(id) => <g innerHTML={stateMark(gateX[id], stateSymbol[states()[id]])} />}</For>
      <g innerHTML={trayFront} />
      <g innerHTML={sleeve} />
      <g class="ac-lamp" data-on={(evaluation()?.mutated.length ?? 0) > 0 ? 'true' : 'false'}><g class="lamp-off" innerHTML={lamp.off} /><g class="lamp-on" innerHTML={lamp.on} /></g>
    </svg>
    <div class="anatomy-controls ac-controls">
      <label>Caller
        <select value={config().caller} disabled={!hydrated() || busy()} onChange={(event) => {
          const value = event.currentTarget.value as Caller;
          change({ caller: value }, `Caller set to ${callers[value].label}.`, controlKeys.caller);
        }}>
          <For each={Object.entries(callers)}>{([id, caller]) => <option value={id} selected={config().caller === id}>{caller.label}</option>}</For>
        </select>
      </label>
      <label>Request
        <select value={config().operation} disabled={!hydrated() || busy()} onChange={(event) => {
          const value = event.currentTarget.value as Operation;
          change({ operation: value }, `Request set to ${operations[value].label}.`, controlKeys.operation);
        }}>
          <For each={Object.entries(operations)}>{([id, op]) => <option value={id} selected={config().operation === id}>{op.label}</option>}</For>
        </select>
      </label>
      <label>Pod securityContext
        <select value={config().podProfile} disabled={!hydrated() || busy()} onChange={(event) => {
          const value = event.currentTarget.value as PodProfile;
          change({ podProfile: value }, `Pod securityContext set to ${profiles[value].label}.`, controlKeys.podProfile);
        }}>
          <For each={Object.entries(profiles)}>{([id, profile]) => <option value={id} selected={config().podProfile === id}>{profile.label}</option>}</For>
        </select>
      </label>
      <label><input type="checkbox" checked={config().roleBinding} disabled={!hydrated() || busy()} onChange={(event) => {
        const checked = event.currentTarget.checked;
        change({ roleBinding: checked }, `RoleBinding deployer-pod-writer ${checked ? 'added to' : 'removed from'} sandbox.`, controlKeys.roleBinding);
      }} />RoleBinding deployer-pod-writer exists</label>
      <label><input type="checkbox" checked={config().enforceRestricted} disabled={!hydrated() || busy()} onChange={(event) => {
        const checked = event.currentTarget.checked;
        change({ enforceRestricted: checked }, `sandbox enforce label ${checked ? 'set to restricted' : 'removed'}.`, controlKeys.enforceRestricted);
      }} />sandbox enforces restricted PodSecurity</label>
      <label><input type="checkbox" checked={config().mutatingDefaults} disabled={!hydrated() || busy()} onChange={(event) => {
        const checked = event.currentTarget.checked;
        change({ mutatingDefaults: checked }, `Mutating step ${checked ? 'enabled' : 'disabled'}.`, defaultsToFill(config().podProfile).map((field) => `ctx:${field}`));
      }} />Mutating step fills unset defaults</label>
    </div>
    <p class="ac-hint">Send one request. Gates run in order: 1 authentication, 2 and 3 RBAC, M mutating step, 4 PodSecurity. The first failing check stops the cartridge in front of it.</p>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls ac-actions">
      <button type="button" data-anatomy-primary disabled={!hydrated() || busy()} onClick={send}>Send request</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={reset}>Reset</button>
    </div>
    <ChangeReport change={report()} busy={busy()} />
    <div class="ac-status" data-anatomy-status>
      <h3 class="anatomy-panel-heading">Checks in order</h3>
      <ol class="ac-stages" aria-label="Checks in order, numbered as on the machine">
        <For each={stageCards()}>{(card) => <li data-stage={card.id} data-tone={card.tone}><span class="ac-marker" aria-hidden="true">{card.marker}</span><span class="ac-stage-name">{card.name}</span><StateBadge tone={card.tone} label={card.label} /></li>}</For>
      </ol>
      <h3 class="anatomy-panel-heading">Objects the request meets</h3>
      <dl class="ac-objects" aria-label="Objects the request meets">
        <div><dt>Caller</dt><dd>{callers[config().caller].identity ?? 'no identity (token rejected)'}</dd></div>
        <div><dt>Request</dt><dd>{operations[config().operation].label} in sandbox</dd></div>
        <div><dt>RoleBinding deployer-pod-writer</dt><dd><StateBadge tone={config().roleBinding ? 'selected' : 'info'} label={config().roleBinding ? 'present in sandbox' : 'absent'} /></dd></div>
        <div><dt>Role pod-writer</dt><dd>grants create on pods only</dd></div>
        <div><dt>Namespace sandbox</dt><dd><StateBadge tone={config().enforceRestricted ? 'selected' : 'info'} label={config().enforceRestricted ? 'enforce: restricted' : 'no enforce label'} /></dd></div>
        <div><dt>Pod report-job</dt><dd><StateBadge tone={podBadge().tone} label={podBadge().label} /></dd></div>
      </dl>
    </div>
    </div>
    </div>
    <ul class="anatomy-legend">
      <li>✓ blade up: check passed</li>
      <li>½ blade half-up, dashed: not enforced, no check ran</li>
      <li>✕ blade down, tinted: check failed</li>
      <li>– blade down, faded: not reached</li>
      <li>… blade down, plain: not evaluated yet</li>
      <li>Sleeve lamp lit: the mutating step changed the Pod in the last send</li>
    </ul>
    <div class="anatomy-yaml-figure-grid ac-manifests">
      <ManifestPanel title="Request body · Pod report-job" lines={pod()} note={podNote()} />
      <ManifestPanel title="RBAC and namespace in sandbox" lines={rbac()} />
    </div>
    <p class="ac-caption">Fixture: one ServiceAccount, one user, one Role with a single rule, one RoleBinding, one namespace and an invented mutating step. PodSecurity checks five restricted controls only. Each send starts from an empty sandbox, so an existing report-job is not modelled. The figure shows the order of checks, not a live cluster.</p>
    <noscript><p>Enable JavaScript to send requests. The request path and every check are explained below.</p></noscript>
  </div>;
}
