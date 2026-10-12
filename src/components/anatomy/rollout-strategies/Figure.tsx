import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { banks, chassis, identityAnchor, laneCentre, pointerKnob, pointerRest, projection, railPaths, spanBar } from './geometry';
import {
  advance, chooseStrategy, DEADLINE, deadlinePasses, deployGreen, DESIRED, endpointsOf, failingPod, initialState,
  isWaiting, laneNames, manifestOf, observedOf, readyOf, resetState, rolloutStatus, routedTo, servesOf, setCanary, setDefect, settled,
  shipTemplate, SLOTS, strategyLabel, switchService, trafficOf, undoRollout, type Defect, type Lane, type ReleaseState,
  type Strategy,
} from './model';
import './figure.css';

const percent = (share: number) => `${Math.round(share * 100)}%`;
const hints: Record<Strategy, string> = {
  rolling: 'Steps are controller events; Update template and Undo are your edits. A Pod that is not Ready gets no requests, so a build that fails readiness never reaches users, but its rollout leaves capacity split between two beds. After a completed rollout, Reset / replay starts another release from app:v1.',
  blueGreen: 'The switch is one Service edit. Both Deployments keep their Pods, so switching back does not roll anything.',
  canary: 'The canary share follows Ready Pod counts: one canary Pod beside three stable Pods gets about a quarter of requests. Only Ready Pods count.',
};

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<ReleaseState>(initialState());
  const [moving, setMoving] = createSignal(false);
  // Controls wait for settling motion, and for hydration, so no action is taken on a half-drawn bench.
  const live = createMemo(() => hydrated() && !moving());
  const isSettled = createMemo(() => settled(state()));
  const waiting = createMemo(() => isWaiting(state()));
  const traffic = createMemo(() => trafficOf(state()));
  const endpointIds = createMemo(() => new Set(endpointsOf(state()).map((pod) => pod.id)));
  const ledger = createMemo(() => [...state().pods].sort((a, b) => a.lane - b.lane || a.slot - b.slot));
  const manifestLines = createMemo<ManifestLine[]>(() => manifestOf(state()).map((line) => ({
    text: line.text,
    highlight: line.field !== undefined && state().change.reads.includes(line.field),
  })));
  const statusBadge = createMemo<{ tone: BadgeTone; label: string }>(() => {
    const current = state();
    if (current.strategy !== 'rolling') return isSettled() ? { tone: 'pass', label: 'Settled' } : { tone: 'wait', label: 'Reconciling' };
    const status = rolloutStatus(current);
    if (status === 'complete') return { tone: 'pass', label: 'Complete · NewReplicaSetAvailable' };
    if (status === 'stalled') return { tone: 'fail', label: 'Stalled · ProgressDeadlineExceeded' };
    return waiting() ? { tone: 'wait', label: 'Waiting · no progress possible' } : { tone: 'wait', label: 'Progressing · ReplicaSetUpdated' };
  });
  const selectorText = createMemo(() => (state().strategy === 'blueGreen' ? `app=web, version=${state().route === 'new' ? 'green' : 'blue'}` : 'app=web'));
  const historyText = createMemo(() => state().lanes
    .map((lane, index) => ({ index, revision: lane.revision }))
    .filter((entry) => entry.revision !== null)
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))
    .map((entry) => `revision ${entry.revision} = RS-v${entry.index + 1} (app:v${entry.index + 1})`)
    .join(' · '));

  let root: HTMLDivElement | undefined;
  let knobGroup: SVGGElement | undefined;
  let spanGroup: SVGGElement | undefined;
  const cartridges: (SVGGElement | undefined)[] = [];
  // One pose per cartridge: rear bed lane 0 is 0–3, front bed lane 1 is 4–7. z lifts a raised (Not Ready) Pod.
  const poses = Array.from({ length: 2 * SLOTS }, () => ({ z: 0, alpha: 0, targetZ: 0, targetAlpha: 0 }));
  const pointer = { y: pointerRest, target: pointerRest, span: 0, targetSpan: 0 };

  function aim(next: ReleaseState) {
    for (let index = 0; index < poses.length; index++) {
      const lane = Math.floor(index / SLOTS) as Lane;
      const pod = next.pods.find((candidate) => candidate.lane === lane && candidate.slot === index % SLOTS);
      poses[index]!.targetZ = pod ? (pod.ready ? 0 : 16) : 0;
      poses[index]!.targetAlpha = pod ? 1 : 0;
    }
    if (next.route === 'both') pointer.target = (laneCentre[0] + laneCentre[1]) / 2;
    else pointer.target = next.route === 'old' ? laneCentre[0] : laneCentre[1];
    pointer.targetSpan = next.route === 'both' ? 1 : 0;
  }
  const first = initialState();
  aim(first);
  for (const pose of poses) {
    pose.z = pose.targetZ;
    pose.alpha = pose.targetAlpha;
  }
  pointer.y = pointer.target;
  pointer.span = pointer.targetSpan;

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    let remains = false;
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / .16);
    for (let index = 0; index < poses.length; index++) {
      const pose = poses[index]!;
      pose.z += (pose.targetZ - pose.z) * blend;
      pose.alpha += (pose.targetAlpha - pose.alpha) * blend;
      if (Math.abs(pose.targetZ - pose.z) < .05) pose.z = pose.targetZ;
      if (Math.abs(pose.targetAlpha - pose.alpha) < .002) pose.alpha = pose.targetAlpha;
      remains ||= pose.z !== pose.targetZ || pose.alpha !== pose.targetAlpha;
      cartridges[index]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.z]));
      cartridges[index]?.setAttribute('opacity', String(pose.alpha));
    }
    pointer.y += (pointer.target - pointer.y) * blend;
    pointer.span += (pointer.targetSpan - pointer.span) * blend;
    if (Math.abs(pointer.target - pointer.y) < .05) pointer.y = pointer.target;
    if (Math.abs(pointer.targetSpan - pointer.span) < .002) pointer.span = pointer.targetSpan;
    remains ||= pointer.y !== pointer.target || pointer.span !== pointer.targetSpan;
    knobGroup?.setAttribute('transform', translateAlong(projection, [0, pointer.y - pointerRest, 0]));
    spanGroup?.setAttribute('opacity', String(pointer.span));
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  function apply(next: ReleaseState) {
    if (moving() || next === state()) return;
    aim(next);
    setState(next);
    const changedPose = poses.some((pose) => pose.z !== pose.targetZ || pose.alpha !== pose.targetAlpha) ||
      pointer.y !== pointer.target || pointer.span !== pointer.targetSpan;
    setMoving(changedPose);
    wake();
  }

  const podAtIndex = (index: number) => {
    const lane = Math.floor(index / SLOTS) as Lane;
    return state().pods.find((candidate) => candidate.lane === lane && candidate.slot === index % SLOTS);
  };
  // Identity on the object is the Pod name; a failing build adds a symbol as well as the error colour.
  const identityOf = (index: number) => {
    const pod = podAtIndex(index);
    if (!pod) return '';
    return `p${pod.id}${failingPod(state(), pod) ? ' ✕' : ''}`;
  };
  const failingOf = (index: number) => {
    const pod = podAtIndex(index);
    return pod !== undefined && failingPod(state(), pod) ? 'true' : 'false';
  };
  const bedTitle = (lane: Lane) => {
    const current = state();
    if (current.strategy === 'rolling') return `RS-v${lane + 1} · app:v${lane + 1} · revision ${current.lanes[lane].revision ?? '—'}`;
    return `${laneNames[current.strategy][lane]} · app:v${lane + 1}`;
  };
  const podLabel = (lane: Lane) => {
    if (state().strategy === 'blueGreen') return `version=${lane === 0 ? 'blue' : 'green'}`;
    if (state().strategy === 'canary') return `track=${lane === 0 ? 'stable' : 'canary'}`;
    return `app:v${lane + 1}`;
  };
  const manifestTitle = () => {
    if (state().strategy === 'blueGreen') return 'Service web (fixture)';
    if (state().strategy === 'canary') return 'Deployment web-canary (fixture)';
    return 'Deployment web (fixture)';
  };
  const manifestNote = () => {
    if (state().strategy === 'blueGreen') return 'Blue and green are separate Deployments. This Service selector is the only switch.';
    if (state().strategy === 'canary') return 'The stable Deployment is not shown. Its comment line states its selector.';
    return 'Highlighted lines are the fields the last step read or changed. Revision numbers are ReplicaSet annotations, not fields in this spec.';
  };

  return (
    <div ref={root} class="anatomy-figure release-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>RELEASE BENCH · FIXTURE</span><span>Traffic follows Ready Pods</span></div>
      <svg class="iso-svg release-svg" viewBox="107 60 546 385" role="img" aria-labelledby="release-title release-description">
        <title id="release-title">A Service selector gate feeding two keyed beds of Pod cartridges</title>
        <desc id="release-description">A Service selector gate sits at the left. Its pointer covers both beds for app=web, or one bed for version=blue or version=green. The rear bed and the front bed hold Pod cartridges: a seated cartridge is Ready, a raised cartridge is Created but Not Ready, and an empty socket has no Pod. A rail is lit only while the Service routes to Ready Pods in that bed. Cartridges never move between beds; a rollback or a switch changes which bed the selector or template points at.</desc>
        <g innerHTML={chassis} />
        <g ref={(element) => { spanGroup = element; }} opacity={pointer.span} innerHTML={spanBar} />
        <g ref={(element) => { knobGroup = element; }} transform={translateAlong(projection, [0, pointer.y - pointerRest, 0])} innerHTML={pointerKnob} />
        <For each={banks}>{(bank, bankIndex) => <g>
          <g innerHTML={bank.floor} />
          <For each={bank.slots}>{(slot, slotIndex) => {
            const index = bankIndex() * SLOTS + slotIndex();
            return <g>
              <g innerHTML={slot.hardware} />
              <g ref={(element) => { cartridges[index] = element; }} opacity={poses[index]!.alpha}
                transform={translateAlong(projection, [0, 0, poses[index]!.z])}>
                <g innerHTML={slot.art} />
                <text class="release-identity" x={identityAnchor[index]!.x} y={identityAnchor[index]!.y} data-failing={failingOf(index)}>{identityOf(index)}</text>
              </g>
            </g>;
          }}</For>
          <g innerHTML={bank.front} />
        </g>}</For>
        <For each={[0, 1] as Lane[]}>{(lane) => <path class="release-rail" d={railPaths[lane]}
          data-lit={routedTo(state().route, lane) && readyOf(state(), lane) > 0 ? 'true' : 'false'} />}</For>
      </svg>
      <div class="anatomy-controls">
        <label for="release-strategy">Release strategy
          <select id="release-strategy" value={state().strategy} disabled={!live()}
            onChange={(event) => apply(chooseStrategy(state(), event.currentTarget.value as Strategy))}>
            <option value="rolling" selected={state().strategy === 'rolling'}>Rolling update</option>
            <option value="blueGreen" selected={state().strategy === 'blueGreen'}>Blue-green</option>
            <option value="canary" selected={state().strategy === 'canary'}>Canary</option>
          </select>
        </label>
        <label for="release-build">New app:v2 build
          <select id="release-build" value={state().defect} disabled={!live() || state().started}
            onChange={(event) => apply(setDefect(state(), event.currentTarget.value as Defect))}>
            <option value="healthy" selected={state().defect === 'healthy'}>Healthy</option>
            <option value="notReady" selected={state().defect === 'notReady'}>Fails readiness</option>
            <option value="silentErrors" selected={state().defect === 'silentErrors'}>Ready, returns errors</option>
          </select>
        </label>
        <Show when={state().strategy === 'rolling'}>
          <button type="button" disabled={!live() || state().template !== 0 || !isSettled()} onClick={() => apply(shipTemplate(state()))}>Update template to app:v2</button>
          <button type="button" disabled={!live() || state().template !== 1} onClick={() => apply(undoRollout(state()))}>Undo rollout</button>
          <button type="button" disabled={!live() || !waiting() || state().sinceProgress >= DEADLINE} onClick={() => apply(deadlinePasses(state()))}>Let progress deadline pass ({DEADLINE} s)</button>
        </Show>
        <Show when={state().strategy === 'blueGreen'}>
          <button type="button" disabled={!live() || state().lanes[1].present} onClick={() => apply(deployGreen(state()))}>Deploy green (3 replicas)</button>
          <button type="button" disabled={!live() || state().route !== 'old' || !state().lanes[1].present} onClick={() => apply(switchService(state(), 'new'))}>Switch Service to green</button>
          <button type="button" disabled={!live() || state().route !== 'new'} onClick={() => apply(switchService(state(), 'old'))}>Switch Service to blue</button>
        </Show>
        <Show when={state().strategy === 'canary'}>
          <label for="release-canary">Canary replicas (stable stays {DESIRED})
            <select id="release-canary" value={state().lanes[1].target} disabled={!live()}
              onChange={(event) => apply(setCanary(state(), Number(event.currentTarget.value)))}>
              <option value="0" selected={state().lanes[1].target === 0}>0</option>
              <option value="1" selected={state().lanes[1].target === 1}>1</option>
              <option value="2" selected={state().lanes[1].target === 2}>2</option>
              <option value="3" selected={state().lanes[1].target === 3}>3</option>
            </select>
          </label>
        </Show>
        <button type="button" disabled={!hydrated() || moving() || isSettled()} onClick={() => apply(advance(state()))}>Step controllers</button>
        <button type="button" disabled={!live()} onClick={() => apply(resetState(state()))}>Reset / replay</button>
      </div>
      <ChangeReport busy={moving()} change={state().change} />
      <div class="release-status">
        <StateBadge tone={statusBadge().tone} label={statusBadge().label} />
        <Show when={traffic().endpoints === 0}><StateBadge tone="fail" label="No endpoints: requests fail" /></Show>
        <Show when={moving()}><StateBadge tone="info" label="controllers settling" /></Show>
        <p>{strategyLabel[state().strategy]} · targets {state().lanes[0].target} / {state().lanes[1].target} · Pods {state().pods.length} · Ready {readyOf(state())} · endpoints {traffic().endpoints}</p>
      </div>
      <dl class="release-traffic" aria-label="Service traffic">
        <div><dt>Service selector</dt><dd>{selectorText()}</dd></div>
        <div><dt>Ready endpoints</dt><dd>{traffic().endpoints}</dd></div>
        <div><dt>app:v2 share of requests</dt><dd>{percent(traffic().newShare)}</dd></div>
        <div><dt>Failing requests (fixture)</dt><dd>{percent(traffic().failShare)}</dd></div>
      </dl>
      <div class="release-beds">
        <For each={[0, 1] as Lane[]}>{(lane) => <section class="release-bed" aria-label={`${lane === 0 ? 'Rear' : 'Front'} bed: ${bedTitle(lane)}`}>
          <h3>{lane === 0 ? 'Rear bed' : 'Front bed'} · {bedTitle(lane)}</h3>
          <dl class="release-counts">
            <div><dt>Target</dt><dd>{state().lanes[lane].target}</dd></div>
            <div><dt>Pods</dt><dd>{observedOf(state(), lane)}</dd></div>
            <div><dt>Ready</dt><dd>{readyOf(state(), lane)}</dd></div>
            <div><dt>Requests</dt><dd>{percent(servesOf(state(), lane))}</dd></div>
          </dl>
          <ol class="release-slots">
            <For each={[0, 1, 2, 3]}>{(slot) => <li>
              <span class="release-slot-name">Slot {slot + 1}</span>
              <Show when={state().pods.find((pod) => pod.lane === lane && pod.slot === slot)} fallback={<span class="release-empty">empty</span>}>{(pod) => <>
                <strong>p{pod().id}</strong>
                <Show when={state().fresh === pod().id}><StateBadge tone="info" label="new UID" /></Show>
                <StateBadge tone={pod().ready ? 'pass' : 'wait'} label={pod().ready ? 'Ready' : 'Not Ready'} />
                <StateBadge tone={endpointIds().has(pod().id) ? 'info' : 'wait'} label={endpointIds().has(pod().id) ? 'in Service' : 'not in Service'} />
                <Show when={failingPod(state(), pod())}><StateBadge tone="fail" label="returns errors" /></Show>
              </>}</Show>
            </li>}</For>
          </ol>
        </section>}</For>
      </div>
      <Show when={state().strategy === 'rolling'}>
        <p class="release-history">Revision history (ReplicaSets kept under revisionHistoryLimit 10): {historyText()}</p>
      </Show>
      <div class="release-grid">
        <section class="release-ledger" aria-label="Pod identity ledger">
          <h3>Pod identity ledger <span class="release-note">UIDs are fixture stand-ins</span></h3>
          <Show when={state().pods.length} fallback={<p class="release-empty">No Pods in this bench.</p>}>
            <ul><For each={ledger()}>{(pod) => <li>
              <strong>p{pod.id}</strong>
              <span>{laneNames[state().strategy][pod.lane]} · {podLabel(pod.lane)} · app=web</span>
              <span class="release-badges">
                <Show when={state().fresh === pod.id}><StateBadge tone="info" label="new UID" /></Show>
                <StateBadge tone={pod.ready ? 'pass' : 'wait'} label={pod.ready ? 'Ready' : 'Not Ready'} />
                <StateBadge tone={endpointIds().has(pod.id) ? 'info' : 'wait'} label={endpointIds().has(pod.id) ? 'in Service' : 'not in Service'} />
              </span>
            </li>}</For></ul>
          </Show>
          <p class="release-retired">Retired, never reused: {state().retired.length ? state().retired.map((id) => `p${id}`).join(', ') : 'none'}</p>
        </section>
        <ManifestPanel title={manifestTitle()} lines={manifestLines()} note={manifestNote()} />
      </div>
      <details class="release-key">
        <summary>Key and reading guide</summary>
        <ul class="anatomy-legend">
          <li>Gate: Service selector pointer ({selectorText()})</li>
          <li>Rear bed: {laneNames[state().strategy][0]} · app:v1</li>
          <li>Front bed: {laneNames[state().strategy][1]} · app:v2</li>
          <li>Seated cartridge: Pod Ready · raised: Created, not Ready</li>
          <li>Lit rail: Service routes to Ready Pods in that bed</li>
          <li>p-label: Pod identity (UID stand-in) · ✕: serves a build that returns errors</li>
        </ul>
        <p class="release-hint">{hints[state().strategy]}</p>
      </details>
    </div>
  );
}
