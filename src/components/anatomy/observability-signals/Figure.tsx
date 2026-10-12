import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge from '@/components/anatomy/shared/StateBadge';
import {
  BAYS, cabinetArt, cardsFace, CABINET_X, chassis, eventsTape, gateBar, gateFrame, GATE_TRAVEL, lampArt, lampLabels,
  logLines, needleArt, podLabels, probesCaption, projection, requestsArt, service, shelf, type Bay,
} from './geometry';
import {
  advance, check, CLAIM, CLAIMS, CLOCK, countsAt, dialAngle, endpointsAt, eventRetained, EVENTS, initialState,
  INSTRUMENT_PLACE, LAST_TICK, logsUpTo, manifestOf, P99_C, PODS, pick, podSnapshot, POD_NAME, retainedEvents,
  SIGNAL_LABEL, SIGNALS, SUBJECT, tracesUpTo, verdictOf, VERDICT_LABEL, VERDICT_RULE, VERDICT_TONE, WRITER_OF,
  type ObservabilityState, type Signal,
} from './model';
import './figure.css';

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<ObservabilityState>(initialState());
  const [moving, setMoving] = createSignal(false);
  const idle = createMemo(() => hydrated() && !moving());
  const snapshots = createMemo(() => PODS.map((pod) => podSnapshot(pod, state().tick)));
  const subject = createMemo(() => podSnapshot(SUBJECT, state().tick));
  const counts = createMemo(() => countsAt(state().tick));
  const endpoints = createMemo(() => endpointsAt(state().tick));
  const manifestLines = createMemo<ManifestLine[]>(() => manifestOf(state().change.reads).map((line) => ({
    text: line.text, highlight: line.highlight,
  })));
  const nextLabel = createMemo(() => (state().tick >= LAST_TICK ? 'Fixture ends at 12:00' : `Advance to ${CLOCK[state().tick + 1]}`));
  const isRead = (signal: Signal) => state().lastRead === signal;

  let root: HTMLDivElement | undefined;
  let needle: SVGPathElement | undefined;
  const gates: (SVGGElement | undefined)[] = [];
  // Gates slide along z between raised (Ready, in endpoints) and lowered (not Ready).
  const gatePose = PODS.map(() => ({ z: 0, target: 0 }));
  let angle = 0;
  let targetAngle = 0;

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / 0.16);
    let remains = false;
    for (let index = 0; index < gatePose.length; index++) {
      const pose = gatePose[index]!;
      pose.z += (pose.target - pose.z) * blend;
      if (Math.abs(pose.target - pose.z) < 0.05) pose.z = pose.target;
      remains ||= pose.z !== pose.target;
      gates[index]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.z]));
    }
    angle += (targetAngle - angle) * blend;
    if (Math.abs(targetAngle - angle) < 0.05) angle = targetAngle;
    remains ||= angle !== targetAngle;
    needle?.setAttribute('d', needleArt(angle));
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  function aim(next: ObservabilityState) {
    PODS.forEach((pod, index) => {
      gatePose[index]!.target = podSnapshot(pod, next.tick).ready ? 0 : GATE_TRAVEL;
    });
    targetAngle = dialAngle(P99_C[next.tick] ?? null);
  }
  aim(state());
  for (const pose of gatePose) pose.z = pose.target;
  angle = targetAngle;

  // Advance and reset move the apparatus; picks and checks only read it.
  function apply(next: ObservabilityState) {
    if (!idle() || next === state()) return;
    aim(next);
    setState(next);
    setMoving(gatePose.some((pose) => pose.z !== pose.target) || angle !== targetAngle);
    wake();
  }

  /** Instrument contents that change with the fixture moment; static faces come from geometry. */
  const dynamicArt = (signal: Bay['signal']) => {
    const tick = state().tick;
    if (signal === 'events') return eventsTape(retainedEvents(tick).length);
    if (signal === 'logs') return logLines(logsUpTo(tick).length);
    if (signal === 'traces') return cardsFace(tracesUpTo(tick).length);
    return '';
  };

  return (
    <div ref={root} class="anatomy-figure obs-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 03 · SIGNAL BENCH</span><span>Each signal keeps different history</span></div>
      <svg class="iso-svg obs-svg" viewBox="0 0 760 470" role="img" aria-labelledby="obs-title obs-description">
        <title id="obs-title">Four instruments on a rear shelf and three Pod cabinets on a Service belt</title>
        <desc id="obs-description">Above the cabinets, a printer tape holds Events, a dial shows the metrics backend p99 for the subject Pod, a rack holds sampled trace cards, and a cassette holds the subject's container logs. Each cabinet has a gate on the belt that is raised only while its Pod is Ready, and two lamps: R for readiness and L for liveness. The subject is web-z5r1t, the cabinet on the right.</desc>
        <g innerHTML={chassis} />
        <g innerHTML={shelf} />
        {BAYS.map((bay) => <g class="obs-instrument" data-read={isRead(bay.signal) ? 'true' : 'false'}>
          <g innerHTML={bay.body} />
          <g innerHTML={bay.face} />
          <g innerHTML={dynamicArt(bay.signal)} />
          <Show when={bay.signal === 'metrics'}><path class="obs-needle" ref={(element) => { needle = element; }} d={needleArt(angle)} /></Show>
        </g>)}
        {CABINET_X.map((_cx, index) => <g>
          <g innerHTML={cabinetArt[index] ?? ''} />
          <g class="obs-lamp" data-on={snapshots()[index]?.ready ? 'true' : 'false'} data-read={isRead('probes') ? 'true' : 'false'} innerHTML={lampArt[index]?.ready ?? ''} />
          <g class="obs-lamp" data-on={snapshots()[index]?.live ? 'true' : 'false'} data-read={isRead('probes') ? 'true' : 'false'} innerHTML={lampArt[index]?.live ?? ''} />
          <g innerHTML={gateFrame[index] ?? ''} />
          <g ref={(element) => { gates[index] = element; }} transform={translateAlong(projection, [0, 0, gatePose[index]?.z ?? 0])} innerHTML={gateBar[index] ?? ''} />
        </g>)}
        <g innerHTML={service} />
        {CABINET_X.map((cx, index) => <g innerHTML={requestsArt(cx, snapshots()[index]?.rps ?? 0)} />)}
        {/* Final layer: every label sits above all art with a halo, so no part crosses its text. */}
        {BAYS.map((bay) => <text class="obs-label" text-anchor="middle" x={bay.label[0]} y={bay.label[1] - 40}>
          <tspan class="obs-label-title" x={bay.label[0]} y={bay.label[1] - 40}>{bay.title}</tspan>
          <tspan class="obs-label-sub" x={bay.label[0]} dy="20">{bay.sub}</tspan>
          <tspan class="obs-label-sub" x={bay.label[0]} dy="18">{isRead(bay.signal) ? '◆ read' : ' '}</tspan>
        </text>)}
        {CABINET_X.map((cx, index) => <g>
          <text class="obs-label-lamp" text-anchor="middle" x={lampLabels[index]?.ready[0] ?? cx} y={lampLabels[index]?.ready[1] ?? 0}>{`R ${snapshots()[index]?.ready ? '✓' : '✕'}`}</text>
          <text class="obs-label-lamp" text-anchor="middle" x={lampLabels[index]?.live[0] ?? cx} y={lampLabels[index]?.live[1] ?? 0}>{`L ${snapshots()[index]?.live ? '✓' : '✕'}`}</text>
          <text class="obs-label obs-podname" text-anchor="middle" x={podLabels[index]?.[0] ?? cx} y={podLabels[index]?.[1] ?? 0}>
            {`${POD_NAME[PODS[index]!]}${PODS[index] === SUBJECT ? ' · subject' : ''}`}
          </text>
        </g>)}
        <text class="obs-label-probes" text-anchor="middle" x={probesCaption[0]} y={probesCaption[1]}>{`PROBES · R readiness · L liveness${isRead('probes') ? ' · ◆ read' : ''}`}</text>
      </svg>
      <ul class="anatomy-legend obs-legend">
        <li>Gate up = Pod Ready, in Service endpoints · belt = requests into the Service</li>
        <li>R lamp = readiness, drives the gate · L lamp = liveness, restarts only</li>
        <li>Dial = metrics backend p99, not kubectl top</li>
        <li>Rack = sampled traces only · Cassette = subject logs</li>
      </ul>
      <div class="anatomy-controls">
        <button type="button" disabled={!idle() || state().tick >= LAST_TICK} onClick={() => apply(advance(state()))}>{nextLabel()}</button>
        <button type="button" disabled={!idle() || state().tick === 0} onClick={() => apply(initialState())}>Reset to 10:00</button>
        <span class="obs-note">Each step is 30 minutes and summarises many probe runs.</span>
      </div>
      <ChangeReport busy={moving()} change={state().change} />
      <div class="obs-status">
        <StateBadge tone={endpoints() === PODS.length ? 'pass' : 'wait'} label={`${endpoints()} of ${PODS.length} Pods in Service endpoints`} />
        <Show when={moving()}><StateBadge tone="info" label="apparatus settling" /></Show>
        <p>Clock {CLOCK[state().tick]} · Events on tape {counts().events} · Log lines {counts().logs} · Sampled traces {counts().traces}</p>
      </div>
      <section class="obs-claims" aria-label="Claims to check">
        <h3>Which signal can prove this claim?</h3>
        <p class="obs-hint">Pick a signal, press Check. The verdict appears under its claim and is re-read as the clock moves.</p>
        <ol>
          <For each={CLAIMS}>{(claim) => <li class="obs-claim">
            <p><strong>{CLAIM[claim].text}</strong></p>
            <div class="obs-claim-row">
              <label for={`obs-pick-${claim}`}>Signal for “{CLAIM[claim].short}”</label>
              <select id={`obs-pick-${claim}`} value={state().picks[claim] ?? ''} disabled={!idle()}
                onChange={(event) => {
                  const value = event.currentTarget.value as Signal | '';
                  if (value) setState(pick(state(), claim, value));
                }}>
                <option value="">Choose a signal</option>
                <For each={SIGNALS}>{(signal) => <option value={signal}>{SIGNAL_LABEL[signal]}</option>}</For>
              </select>
              <button type="button" disabled={!idle() || !state().picks[claim]} onClick={() => setState(check(state(), claim))}>Check</button>
            </div>
            <Show when={verdictOf(state(), claim)}>{(verdict) => <div class="obs-verdict">
              <StateBadge tone={VERDICT_TONE[verdict().verdict]} label={`${VERDICT_LABEL[verdict().verdict]} · ${SIGNAL_LABEL[verdict().signal]}`} />
              <dl>
                <div><dt>Changed</dt><dd>{verdict().evidence}</dd></div>
                <div><dt>Who wrote it</dt><dd>{WRITER_OF[verdict().signal]}</dd></div>
                <div><dt>Why</dt><dd>{VERDICT_RULE[verdict().verdict]}</dd></div>
                <div><dt>Cannot say</dt><dd>{verdict().limit}</dd></div>
                <div><dt>Read at {CLOCK[state().tick]}</dt><dd>{INSTRUMENT_PLACE[verdict().signal]}</dd></div>
              </dl>
            </div>}</Show>
          </li>}</For>
        </ol>
      </section>
      <div class="obs-pods">
        <For each={PODS}>{(pod, index) => <section class="obs-pod" aria-label={`Pod ${POD_NAME[pod]}`}>
          <h3>{POD_NAME[pod]} <span class="obs-note">cabinet {index() + 1}{pod === SUBJECT ? ' · subject' : ''}</span></h3>
          <StateBadge tone={snapshots()[index()]?.ready ? 'pass' : 'wait'} label={snapshots()[index()]?.ready ? 'Ready' : 'Not Ready'} />
          <dl class="obs-counts">
            <div><dt>Gate</dt><dd>{snapshots()[index()]?.ready ? 'raised' : 'lowered'}</dd></div>
            <div><dt>req/s</dt><dd>{snapshots()[index()]?.rps ?? 0}</dd></div>
            <div><dt>Restarts</dt><dd>{snapshots()[index()]?.restarts ?? 0}</dd></div>
            <div><dt>Liveness</dt><dd>{snapshots()[index()]?.live ? 'pass' : 'fail'}</dd></div>
          </dl>
          <Show when={pod === SUBJECT}>
            <p class="obs-note">Backend p99 {P99_C[state().tick] === null ? 'none: no requests in this window' : `${P99_C[state().tick]} ms`}</p>
          </Show>
        </section>}</For>
      </div>
      <div class="obs-ledgers">
        <section class="obs-ledger" aria-label="Events tape">
          <h3>Events tape <span class="obs-note">best-effort, about 1 h</span></h3>
          <Show when={isRead('events')}><StateBadge tone="info" label="read by last check" /></Show>
          <ul>
            <For each={EVENTS.filter((record) => record.tick <= state().tick)} fallback={<li>No events yet.</li>}>{(record) => <li>
              <span>{CLOCK[record.tick]} · {record.reason} · {POD_NAME[record.pod]}</span>
              <span>{record.message}</span>
              <StateBadge tone={eventRetained(state().tick, record) ? 'info' : 'wait'} label={eventRetained(state().tick, record) ? 'on tape' : 'expired'} />
            </li>}</For>
          </ul>
        </section>
        <section class="obs-ledger" aria-label="Container logs">
          <h3>Container logs <span class="obs-note">one instance, never restarted</span></h3>
          <Show when={isRead('logs')}><StateBadge tone="info" label="read by last check" /></Show>
          <ul>
            <For each={logsUpTo(state().tick)} fallback={<li>No log lines yet.</li>}>{(record) => <li>
              <span>{CLOCK[record.tick]} · {record.text}</span>
            </li>}</For>
          </ul>
        </section>
        <section class="obs-ledger" aria-label="Metric windows">
          <h3>Metric windows <span class="obs-note">backend, {POD_NAME[SUBJECT]}</span></h3>
          <Show when={isRead('metrics')}><StateBadge tone="info" label="read by last check" /></Show>
          <ul>
            <For each={CLOCK.slice(0, state().tick + 1)}>{(clock, index) => <li>
              <span>{clock} · {podSnapshot(SUBJECT, index()).rps} req/s</span>
              <span>p99 {P99_C[index()] === null ? 'no requests, no p99' : `${P99_C[index()]} ms`}</span>
            </li>}</For>
          </ul>
        </section>
        <section class="obs-ledger" aria-label="Sampled traces">
          <h3>Sampled traces <span class="obs-note">unsampled requests leave none</span></h3>
          <Show when={isRead('traces')}><StateBadge tone="info" label="read by last check" /></Show>
          <ul>
            <For each={tracesUpTo(state().tick)} fallback={<li>No sampled traces yet.</li>}>{(record) => <li>
              <span>{CLOCK[record.tick]} · total {record.totalMs} ms</span>
              <span>db span {record.dbMs} ms</span>
            </li>}</For>
          </ul>
        </section>
        <section class="obs-ledger" aria-label="Probe state">
          <h3>Probe state <span class="obs-note">current result and last change</span></h3>
          <Show when={isRead('probes')}><StateBadge tone="info" label="read by last check" /></Show>
          <ul>
            <li>
              <span>{POD_NAME[SUBJECT]} · Ready={subject().ready ? 'True' : 'False'} since {CLOCK[subject().transition]}</span>
              <span>liveness {subject().live ? 'pass' : 'fail'} · restartCount {subject().restarts} (kubelet Pod status)</span>
            </li>
          </ul>
        </section>
      </div>
      <ManifestPanel title="Pod spec (fixture)" lines={manifestLines()}
        note="Highlighted lines are the Pod spec fields the last step or check depended on. Logs, metrics, traces and events are not set in this spec; their collection lives outside it." />
    </div>
  );
}
