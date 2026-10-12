import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge from '@/components/anatomy/shared/StateBadge';
import { banks, chassis, countStop, identityAnchor, projection, rulerArt, selectionPin, templateKey } from './geometry';
import {
  advance, bedOf, changeTemplate, converged, deletePod, initialState, manifestOf, nodeIndex, podAt, readyOf,
  scale, select, selectedPod, SLOTS, type ReplicaState, type Revision,
} from './model';
import './figure.css';

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<ReplicaState>(initialState());
  const [moving, setMoving] = createSignal(false);
  // Selection is inspection, so it stays available during rollout; intents wait for convergence.
  const selectable = createMemo(() => hydrated() && !moving());
  const editable = createMemo(() => selectable() && converged(state()));
  const pinned = createMemo(() => {
    const pod = selectedPod(state());
    return pod ? nodeIndex(pod) : -1;
  });
  const ledger = createMemo(() => [...state().pods].sort((a, b) => a.revision - b.revision || a.slot - b.slot));
  const identityOf = (index: number) => {
    const pod = state().pods.find((candidate) => nodeIndex(candidate) === index);
    return pod ? `p${pod.id}${state().fresh === pod.id ? ' new' : ''}` : '';
  };
  const manifestLines = createMemo<ManifestLine[]>(() => manifestOf(state()).map((line) => ({
    text: line.text,
    highlight: line.field !== undefined && state().change.reads.includes(line.field),
  })));
  let root: HTMLDivElement | undefined;
  let stop: SVGGElement | undefined;
  let key: SVGGElement | undefined;
  const nodes: (SVGGElement | undefined)[] = [];
  // One pose per cartridge slot: rear bed RS-v1 is 0–3, front bed RS-v2 is 4–7.
  const poses = Array.from({ length: 2 * SLOTS }, () => ({ y: 55, alpha: 0, targetY: 55, targetAlpha: 0 }));
  function aim(next: ReplicaState) {
    for (let index = 0; index < poses.length; index++) {
      const pod = next.pods.find((candidate) => nodeIndex(candidate) === index);
      poses[index]!.targetY = pod ? (pod.ready ? 0 : 22) : 55;
      poses[index]!.targetAlpha = pod ? 1 : 0;
    }
  }
  const first = initialState();
  aim(first);
  for (const pose of poses) {
    pose.y = pose.targetY;
    pose.alpha = pose.targetAlpha;
  }
  let stopX = first.desired * 53;
  let keyY = 0;
  let targetStop = stopX;
  let targetKey = keyY;

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    let remains = false;
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / .16);
    for (let index = 0; index < poses.length; index++) {
      const pose = poses[index]!;
      pose.y += (pose.targetY - pose.y) * blend;
      pose.alpha += (pose.targetAlpha - pose.alpha) * blend;
      if (Math.abs(pose.targetY - pose.y) < .05) pose.y = pose.targetY;
      if (Math.abs(pose.targetAlpha - pose.alpha) < .002) pose.alpha = pose.targetAlpha;
      remains ||= pose.y !== pose.targetY || pose.alpha !== pose.targetAlpha;
      nodes[index]?.setAttribute('transform', translateAlong(projection, [0, pose.y, 0]));
      nodes[index]?.setAttribute('opacity', String(pose.alpha));
    }
    stopX += (targetStop - stopX) * blend;
    keyY += (targetKey - keyY) * blend;
    if (Math.abs(targetStop - stopX) < .05) stopX = targetStop;
    if (Math.abs(targetKey - keyY) < .05) keyY = targetKey;
    remains ||= stopX !== targetStop || keyY !== targetKey;
    stop?.setAttribute('transform', translateAlong(projection, [stopX, 0, 0]));
    key?.setAttribute('transform', translateAlong(projection, [0, keyY, 0]));
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  function apply(next: ReplicaState) {
    if (moving() || next === state()) return;
    aim(next);
    targetStop = next.desired * 53;
    targetKey = next.revision === 2 ? 28 : 0;
    setState(next);
    const changedPose = poses.some((pose) => pose.y !== pose.targetY || pose.alpha !== pose.targetAlpha) || stopX !== targetStop || keyY !== targetKey;
    setMoving(changedPose);
    wake();
  }

  return (
    <div ref={root} class="anatomy-figure replica-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 02 · REPLICA BENCH</span><span>Intent ≠ instance</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <svg class="iso-svg" viewBox="0 0 760 470" role="img" aria-labelledby="replica-title replica-description">
        <title id="replica-title">A keyed, two-bed replica cartridge apparatus</title>
        <desc id="replica-description">The left console holds the Deployment template key. The rear bed represents RS-v1 and the front bed RS-v2. Cartridges are Pod identities: a raised cartridge is Created, not Ready; a seated one is Ready. A diamond pin marks the selected Pod. The accent stop on the ruler represents the Deployment desired count. Removed cartridges leave; they do not migrate.</desc>
        <g innerHTML={chassis} />
        <g ref={key} innerHTML={templateKey} />
        <For each={banks}>{(bank, bankIndex) => <g>
          <g innerHTML={bank.floor} />
          <For each={bank.slots}>{(slot, slotIndex) => {
            const index = bankIndex() * SLOTS + slotIndex();
            return <g>
              <g innerHTML={slot.hardware} />
              <g ref={(element) => { nodes[index] = element; }} opacity={poses[index]!.alpha}
                transform={translateAlong(projection, [0, poses[index]!.y, 0])}>
                <g innerHTML={slot.art} />
                <path class="replica-pin" d={selectionPin[index]} opacity={pinned() === index ? 1 : 0} />
                <text class="replica-identity" x={identityAnchor[index]!.x} y={identityAnchor[index]!.y} data-selected={pinned() === index ? 'true' : 'false'}>{identityOf(index)}</text>
              </g>
            </g>;
          }}</For>
          <g innerHTML={bank.front} />
        </g>}</For>
        <g innerHTML={rulerArt} />
        <g ref={stop} transform={translateAlong(projection, [stopX, 0, 0])} innerHTML={countStop} />
      </svg>
      <ul class="anatomy-legend">
        <li>Console: Deployment template and desired count</li>
        <li>Rear bed: RS-v1</li>
        <li>Front bed: {state().revision === 2 ? 'RS-v2' : 'spare, no RS-v2 yet'}</li>
        <li>Seated cartridge: Pod Ready</li>
        <li>Raised cartridge: Pod Created, not Ready</li>
        <li>◆ pin: selected Pod</li>
        <li>p-label on a cartridge: Pod identity (UID stand-in)</li>
        <li>Accent stop: Deployment desired count</li>
      </ul>
      <p class="replica-hint">Select a Pod, then Delete it. The ReplicaSet creates a replacement with a new UID in the reused slot; the deleted UID never returns. Intents wait until the state converges; each Step reveals one owner's action.</p>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls replica-controls">
        <label for="replica-desired">Desired replicas
          <select id="replica-desired" value={state().desired} disabled={!editable()} onChange={(event) => apply(scale(state(), Number(event.currentTarget.value)))}>
            <For each={[0, 1, 2, 3, 4]}>{(count) => <option value={count} selected={state().desired === count}>{count}</option>}</For>
          </select>
        </label>
        <label for="replica-pod">Selected Pod
          <select id="replica-pod" value={state().selected ?? ''} disabled={!selectable() || state().pods.length === 0}
            onChange={(event) => apply(select(state(), event.currentTarget.value === '' ? null : Number(event.currentTarget.value)))}>
            <option value="" selected={state().selected === null}>None selected</option>
            <For each={state().pods}>{(pod) => <option value={pod.id} selected={state().selected === pod.id}>p{pod.id} · RS-v{pod.revision} · slot {pod.slot + 1}</option>}</For>
          </select>
        </label>
        <button type="button" disabled={!editable() || state().selected === null} onClick={() => {
          const current = state();
          if (current.selected !== null) apply(deletePod(current, current.selected));
        }}>Delete selected Pod</button>
        <button type="button" data-anatomy-primary disabled={!editable() || state().revision === 2} onClick={() => apply(changeTemplate(state()))}>Change template to app:v2</button>
        <button type="button" disabled={!hydrated() || moving() || converged(state())} onClick={() => apply(advance(state()))}>Step reconciliation</button>
        <button type="button" disabled={!hydrated() || moving()} onClick={() => apply(initialState())}>Reset / replay</button>
      </div>
      <ChangeReport busy={moving()} change={state().change} />
      <div class="replica-state" data-anatomy-status>
      <div class="replica-status">
        <StateBadge tone={converged(state()) ? 'pass' : 'wait'} label={converged(state()) ? 'Converged' : 'Reconciling'} />
        <Show when={moving()}><StateBadge tone="info" label="apparatus settling" /></Show>
        <p>Deployment desired {state().desired} · template app:v{state().revision} · Pods observed {state().pods.length} · Ready {readyOf(state())}</p>
      </div>
      <div class="replica-beds">
        <For each={[1, 2] as Revision[]}>{(revision) => <section class="replica-bed" aria-label={`RS-v${revision} bed`}>
          <h3>{revision === 1 ? 'Rear bed' : 'Front bed'} · RS-v{revision}</h3>
          <Show when={bedOf(state(), revision).exists} fallback={<p class="replica-empty">RS-v2 does not exist: no app:v2 template has been requested.</p>}>
            <dl class="replica-counts">
              <div><dt>Desired</dt><dd>{bedOf(state(), revision).target}</dd></div>
              <div><dt>Current</dt><dd>{bedOf(state(), revision).current}</dd></div>
              <div><dt>Ready</dt><dd>{bedOf(state(), revision).ready}</dd></div>
              <div><dt>Not Ready</dt><dd>{bedOf(state(), revision).notReady}</dd></div>
            </dl>
            <ol class="replica-slots">
              <For each={[0, 1, 2, 3]}>{(slot) => <li>
                <span class="replica-slot-name">Slot {slot + 1}</span>
                <Show when={podAt(state(), revision, slot)} fallback={<span class="replica-empty">empty</span>}>{(pod) => <>
                  <strong>p{pod().id}</strong>
                  <Show when={state().selected === pod().id}><StateBadge tone="selected" label="selected" /></Show>
                  <Show when={state().fresh === pod().id}><StateBadge tone="info" label="new UID" /></Show>
                  <StateBadge tone={pod().ready ? 'pass' : 'wait'} label={pod().ready ? 'Ready' : 'Not Ready'} />
                </>}</Show>
              </li>}</For>
            </ol>
          </Show>
        </section>}</For>
      </div>
      </div>
      </div>
      </div>
      <div class="replica-grid">
        <section class="replica-ledger" aria-label="Pod identity ledger">
          <h3>Pod identity ledger <span class="replica-note">UIDs are fixture stand-ins</span></h3>
          <Show when={state().pods.length} fallback={<p class="replica-empty">No Pod objects in this fixture.</p>}>
            <ul><For each={ledger()}>{(pod) => <li data-selected={state().selected === pod.id ? 'true' : 'false'}>
              <strong>p{pod.id}</strong>
              <span>RS-v{pod.revision} · slot {pod.slot + 1} · app:v{pod.revision}</span>
              <span class="replica-badges">
                <Show when={state().selected === pod.id}><StateBadge tone="selected" label="selected" /></Show>
                <Show when={state().fresh === pod.id}><StateBadge tone="info" label="new UID" /></Show>
                <StateBadge tone={pod.ready ? 'pass' : 'wait'} label={pod.ready ? 'Ready' : 'Not Ready'} />
              </span>
            </li>}</For></ul>
          </Show>
          <p class="replica-retired">Retired, never reused: {state().retired.length ? state().retired.map((id) => `p${id}`).join(', ') : 'none'}</p>
        </section>
        <ManifestPanel title="Deployment spec (fixture)" lines={manifestLines()}
          note="Highlighted lines are the Deployment fields the last step read or changed. ReplicaSet targets and Pod identities are not in this YAML." />
      </div>
      <p class="replica-hint">RollingUpdate fixture: maxSurge 1, maxUnavailable 0. Cartridge travel depicts creation, readiness or removal, never a Pod moving to another node.</p>
    </div>
  );
}
