import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import * as g from './geometry';
import * as m from './model';
import './figure.css';

const phaseTone: Record<m.Phase, BadgeTone> = { Pending: 'wait', Running: 'info', Succeeded: 'pass', Failed: 'fail' };
const initialReport: m.Report = {
  title: 'Pod p-1 is created and unassigned',
  changed: 'Phase Pending. No node, no container. Conditions PodScheduled, Initialized, ContainersReady, and Ready are all False.',
  actor: 'You: this is a new Pod object from the spec on the left.',
  reason: 'A Pod is assigned to a node first; only the kubelet on that node starts its containers.',
  notYet: 'No container runs yet, so no probe has been evaluated and no endpoint exists.',
  touched: ['uid', 'phase'],
};

/** Where each moving part should sit for a given state. Animation eases the current value to these. */
function targets(f: m.Fixture, p: m.PodStatus) {
  return {
    cell: p.container.state === 'Running' ? 0 : g.LIFT_OUT,
    shutter: !f.spec.startupProbe || p.startupPassed ? g.SHUTTER_UP : 0,
    gate: m.inEndpoints(p) ? g.GATE_UP : 0,
    puck: m.inEndpoints(p) ? g.PUCK_TRAVEL : 0,
  };
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [fixture, setFixture] = createSignal<m.Fixture>(m.defaultFixture);
  const [pod, setPod] = createSignal<m.PodStatus>(m.newPod(1));
  const [report, setReport] = createSignal<m.Report>(initialReport);
  let root: HTMLDivElement | undefined;
  let cellEl: SVGGElement | undefined;
  let shutterEl: SVGGElement | undefined;
  let gateEl: SVGGElement | undefined;
  let puckEl: SVGGElement | undefined;

  const start = targets(m.defaultFixture, m.newPod(1));
  const current = { ...start };
  let goal = { ...start };

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    let moving = false;
    for (const key of ['cell', 'shutter', 'gate', 'puck'] as const) {
      const next = reduced ? goal[key] : current[key] + (goal[key] - current[key]) * (1 - Math.exp(-dt / 0.16));
      current[key] = Math.abs(next - goal[key]) < 0.05 ? goal[key] : next;
      if (current[key] !== goal[key]) moving = true;
    }
    cellEl?.setAttribute('transform', g.move(0, 0, current.cell));
    shutterEl?.setAttribute('transform', g.move(0, 0, current.shutter));
    gateEl?.setAttribute('transform', g.move(0, 0, current.gate));
    puckEl?.setAttribute('transform', g.move(current.puck, 0, 0));
    if (!moving && busy()) setBusy(false);
    return moving;
  });

  function apply(step: m.Step) {
    setPod(step.pod);
    setFixture(step.fixture);
    setReport(step.report);
    goal = targets(step.fixture, step.pod);
    // Busy must be set before the motion step can settle it.
    setBusy(true);
    wake();
  }

  onMount(() => setHydrated(true));

  const bindPod = () => { if (!busy()) apply(m.bind(pod(), fixture())); };
  const startPod = () => { if (!busy()) apply(m.startContainers(pod(), fixture())); };
  const nextPeriod = () => { if (!busy()) apply(m.tick(pod(), fixture())); };
  const setApp = (app: m.AppBehaviour) => { if (!busy()) apply(m.changeApp(pod(), fixture(), app)); };
  const setSpec = (patch: Partial<m.PodSpec>) => {
    if (busy()) return;
    // A changed spec is a new Pod object: the old uid is deleted and the next uid is created.
    apply(m.replacePod(pod(), fixture(), { ...fixture().spec, ...patch }, pod().uid + 1, 'spec'));
  };
  const reset = () => {
    if (busy()) return;
    const step = m.replacePod(pod(), fixture(), m.defaultFixture.spec, pod().uid + 1, 'reset');
    apply({ ...step, fixture: m.defaultFixture });
  };

  const disabled = () => !hydrated() || busy();

  const phaseIndex = () => m.phaseOrder.indexOf(pod().phase);
  const lampsHtml = createMemo(() => {
    const flags = Object.values(m.conditions(pod()));
    return g.lampX.map((x, i) => g.lampSvg(x, flags[i] ?? false)).join('');
  });
  const needleHtml = createMemo(() => g.needles[phaseIndex()] ?? '');
  const pipsHtml = createMemo(() => {
    const spec = fixture().spec;
    const live = spec.livenessProbe ? pod().livenessFailures : 0;
    const ready = spec.readinessProbe ? pod().readinessFailures : 0;
    return g.pipPositions.map(([x, y], i) => g.pipSvg(x, y, i < 3 ? i < live : i - 3 < ready)).join('');
  });

  /** Identity and per-owner counts written beside the object. Left chips label the housing, right chip the Service endpoint. */
  const chips = createMemo(() => {
    const p = pod();
    const f = fixture();
    const containerText = p.container.state === 'none' ? 'not created' : p.container.state === 'Waiting' ? `Waiting ${p.container.reason}` : p.container.state;
    const probes = [
      !f.spec.startupProbe ? 'startup off' : p.startupPassed ? 'startup passed' : `startup ${p.startupFailures} of ${m.STARTUP_FAILURE_THRESHOLD} failed`,
      f.spec.livenessProbe ? `liveness ${p.livenessFailures} of ${m.PROBE_FAILURE_THRESHOLD} failed` : 'liveness off',
      f.spec.readinessProbe ? `readiness ${p.readinessFailures} of ${m.PROBE_FAILURE_THRESHOLD} failed` : 'readiness off',
    ];
    return {
      pod: `Pod p-${p.uid} · ${p.scheduled ? m.NODE_NAME : 'unbound'}`,
      cell: `container app · ${containerText} · restarts ${p.container.restartCount}`,
      probes,
      endpoint: m.inEndpoints(p) ? 'endpoint: in' : 'endpoint: out',
    };
  });

  const badges = () => {
    const p = pod();
    const f = fixture();
    const cond = m.conditions(p);
    const flag = (value: boolean, name: string) => ({ tone: (value ? 'pass' : 'wait') as BadgeTone, label: `${name} ${value ? 'True' : 'False'}` });
    const c = p.container;
    const containerTone: BadgeTone = c.state === 'Running' ? 'pass' : c.state === 'Terminated' ? (c.exitCode === 0 ? 'info' : 'fail') : 'wait';
    const startup = !f.spec.startupProbe
      ? { tone: 'info' as BadgeTone, label: 'Startup probe off' }
      : p.startupPassed
        ? { tone: 'pass' as BadgeTone, label: 'Startup passed' }
        : { tone: 'wait' as BadgeTone, label: `Startup ${p.startupFailures} of ${m.STARTUP_FAILURE_THRESHOLD} failed` };
    const liveness = !f.spec.livenessProbe
      ? { tone: 'info' as BadgeTone, label: 'Liveness probe off' }
      : { tone: (p.livenessFailures === 0 ? 'pass' : 'wait') as BadgeTone, label: `Liveness ${p.livenessFailures} of ${m.PROBE_FAILURE_THRESHOLD} failed` };
    const readiness = !f.spec.readinessProbe
      ? { tone: 'info' as BadgeTone, label: 'Readiness probe off' }
      : { tone: (p.readinessFailures === 0 ? 'pass' : 'wait') as BadgeTone, label: `Readiness ${p.readinessFailures} of ${m.PROBE_FAILURE_THRESHOLD} failed` };
    return {
      phase: { tone: phaseTone[p.phase], label: `Phase ${p.phase}` },
      container: { tone: containerTone, label: `Container app ${c.state === 'Waiting' ? `Waiting (${c.reason})` : c.state}` },
      scheduled: flag(cond.PodScheduled, 'PodScheduled'),
      initialized: flag(cond.Initialized, 'Initialized'),
      containers: flag(cond.ContainersReady, 'ContainersReady'),
      ready: flag(cond.Ready, 'Ready'),
      startup,
      liveness,
      readiness,
      endpoint: m.inEndpoints(p)
        ? { tone: 'pass' as BadgeTone, label: 'In Service endpoints' }
        : { tone: 'wait' as BadgeTone, label: 'Not in endpoints' },
    };
  };

  const ledger = () => {
    const b = badges();
    return [b.phase, b.container, b.scheduled, b.initialized, b.containers, b.ready, b.startup, b.liveness, b.readiness, b.endpoint];
  };

  return (
    <div ref={root} class="anatomy-figure pl-figure" role="group" aria-label="Pod lifecycle and probe apparatus" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>Fig 01 · Workloads</span><span>Running is not Ready</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <p class="pl-identity">{chips().pod} · {chips().cell} · {chips().endpoint}</p>
      <div class="pl-stage">
        <svg class="iso-svg" viewBox="0 0 720 430" role="img" aria-labelledby="pl-title pl-desc">
          <title id="pl-title">Pod housing with one container cell, probe gates and a Service tray</title>
          <desc id="pl-desc">A housing holds one container cell. The cell is lifted out when it is not running. A startup shutter covers two probe tallies. A readiness gate moves one endpoint puck in or out of a Service tray. A console shows the phase dial and four condition lamps.</desc>
          <g innerHTML={g.base} />
          <g innerHTML={g.housingBack} />
          <g innerHTML={g.consoleBase} />
          <g innerHTML={lampsHtml()} />
          <g innerHTML={needleHtml()} />
          <g innerHTML={g.trayBack} />
          <g innerHTML={g.track} />
          <g ref={(el) => { puckEl = el; }} transform={g.move(current.puck, 0, 0)} innerHTML={g.puck} />
          <g innerHTML={g.gateFrame} />
          <g ref={(el) => { gateEl = el; }} transform={g.move(0, 0, current.gate)} innerHTML={g.gateBlade} />
          <g ref={(el) => { cellEl = el; }} transform={g.move(0, 0, current.cell)} innerHTML={g.cell} />
          <g innerHTML={g.tallyBlocks} />
          <g innerHTML={pipsHtml()} />
          <g innerHTML={g.shutterGuides} />
          <g ref={(el) => { shutterEl = el; }} transform={g.move(0, 0, current.shutter)} innerHTML={g.shutterBar} />
          <g innerHTML={g.housingFront} />
          <g innerHTML={g.trayFront} />
          <g innerHTML={g.labelPlate} />
        </svg>
        <div class="pl-chips" aria-hidden="true">
          <span class="pl-chip" data-chip="pod">{chips().pod}</span>
          <span class="pl-chip" data-chip="cell">{chips().cell}</span>
          <span class="pl-chip" data-chip="probes">
            <For each={chips().probes}>{(line) => <span class="pl-chip-line">{line}</span>}</For>
          </span>
          <span class="pl-chip" data-chip="endpoint">{chips().endpoint}</span>
        </div>
      </div>
      <ul class="anatomy-legend"><li>Housing = Pod identity</li><li>Cell = container app</li><li>Shutter = startup gate</li><li>Left tally = liveness</li><li>Right tally = readiness</li><li>Gate + puck = endpoint</li></ul>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls pl-controls">
        <fieldset class="pl-fieldset">
          <legend>Pod spec (a change creates a new Pod)</legend>
          <label><input type="checkbox" checked={fixture().spec.startupProbe} disabled={disabled()} onChange={(e) => setSpec({ startupProbe: e.currentTarget.checked })} />Startup probe</label>
          <label><input type="checkbox" checked={fixture().spec.livenessProbe} disabled={disabled()} onChange={(e) => setSpec({ livenessProbe: e.currentTarget.checked })} />Liveness probe</label>
          <label><input type="checkbox" checked={fixture().spec.readinessProbe} disabled={disabled()} onChange={(e) => setSpec({ readinessProbe: e.currentTarget.checked })} />Readiness probe</label>
          <label>restartPolicy<select value={fixture().spec.restartPolicy} disabled={disabled()} onChange={(e) => setSpec({ restartPolicy: e.currentTarget.value as m.RestartPolicy })}>
            <option value="Always">Always</option><option value="OnFailure">OnFailure</option><option value="Never">Never</option>
          </select></label>
        </fieldset>
        <fieldset class="pl-fieldset">
          <legend>Application (same Pod)</legend>
          <label>Application behaviour<select value={fixture().app} disabled={disabled()} onChange={(e) => setApp(e.currentTarget.value as m.AppBehaviour)}>
            <For each={Object.entries(m.appLabels)}>{([id, label]) => <option value={id}>{label}</option>}</For>
          </select></label>
        </fieldset>
        <div class="pl-actions">
          <button type="button" data-anatomy-primary disabled={disabled() || pod().scheduled || pod().phase !== 'Pending'} onClick={bindPod}>Bind to node</button>
          <button type="button" disabled={disabled() || !pod().scheduled || pod().container.state !== 'none'} onClick={startPod}>Start containers</button>
          <button type="button" disabled={disabled() || !pod().scheduled || pod().container.state === 'none' || m.isTerminal(pod().phase)} onClick={nextPeriod}>Next probe period</button>
          <button type="button" disabled={disabled()} onClick={reset}>Reset to a new Pod</button>
        </div>
      </div>
      <ChangeReport busy={busy()} change={report()} />
      <ul class="pl-ledger" aria-label="Per-object state" data-anatomy-status>
        <For each={ledger()}>{(item) => <li><StateBadge tone={item.tone} label={item.label} /></li>}</For>
      </ul>
      </div>
      </div>
      <ManifestPanel
        title="Pod object from the current state"
        lines={m.manifestOf(fixture(), pod()).map((line) => ({ text: line.text, highlight: Boolean(line.key && report().touched.includes(line.key)) }))}
        note="Highlighted lines are the fields the last interaction read or changed."
      />
    </div>
  );
}
