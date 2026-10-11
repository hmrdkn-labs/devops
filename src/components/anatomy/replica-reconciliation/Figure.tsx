import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import { banks, chassis, countStop, projection, rulerArt, templateKey } from './geometry';
import { advance, changeTemplate, converged, countOf, deletePod, initialState, readyOf, scale, type ReplicaState } from './model';
import './figure.css';

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const initial = initialState();
  const [state, setState] = createSignal(initial);
  const [moving, setMoving] = createSignal(false);
  const [selection, setSelection] = createSignal(1);
  const selectedId = createMemo(() => state().pods.some((pod) => pod.id === selection()) ? selection() : (state().pods[0]?.id ?? 0));
  const editable = createMemo(() => hydrated() && !moving() && converged(state()));
  let root: HTMLDivElement | undefined;
  let stop: SVGGElement | undefined;
  let key: SVGGElement | undefined;
  const nodes: (SVGGElement | undefined)[] = [];
  const poses = Array.from({ length: 8 }, (_, index) => ({
    y: index < 3 ? 0 : 55, alpha: index < 3 ? 1 : 0,
    targetY: index < 3 ? 0 : 55, targetAlpha: index < 3 ? 1 : 0,
  }));
  let stopX = 159;
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
    for (let index = 0; index < poses.length; index++) {
      const revision = index < 4 ? 1 : 2;
      const pod = next.pods.find((candidate) => candidate.revision === revision && candidate.slot === index % 4);
      poses[index]!.targetY = pod ? (pod.ready ? 0 : 22) : 55;
      poses[index]!.targetAlpha = pod ? 1 : 0;
    }
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
      <svg class="iso-svg" viewBox="0 0 760 470" role="img" aria-labelledby="replica-title replica-description">
        <title id="replica-title">A keyed, two-bed replica cartridge apparatus</title>
        <desc id="replica-description">The left console holds the Deployment template key. The rear bed represents RS-v1 and the front bed RS-v2. Cartridges are Pod identities: an unseated cartridge is Created, a seated one is Ready. The accent stop on the front ruler represents the desired count. Removed cartridges leave, not migrate.</desc>
        <g innerHTML={chassis} />
        <g ref={key} innerHTML={templateKey} />
        <For each={banks}>{(bank, bankIndex) => <g>
          <g innerHTML={bank.floor} />
          <For each={bank.slots}>{(slot, slotIndex) => {
            const index = bankIndex() * 4 + slotIndex();
            return <g>
              <g innerHTML={slot.hardware} />
              <g ref={(element) => { nodes[index] = element; }} opacity={poses[index]!.alpha}
                transform={translateAlong(projection, [0, poses[index]!.y, 0])} innerHTML={slot.art} />
            </g>;
          }}</For>
          <g innerHTML={bank.front} />
        </g>}</For>
        <g innerHTML={rulerArt} />
        <g ref={stop} transform={translateAlong(projection, [159, 0, 0])} innerHTML={countStop} />
      </svg>
      <ul class="anatomy-legend">
        <li>Console: Deployment template</li><li>Rear bed: RS-v1</li><li>Front bed: {state().revision === 2 ? 'RS-v2' : 'spare (no RS-v2 yet)'}</li>
        <li>Cartridge: Pod · seated = Ready</li><li>Accent stop: desired count</li>
      </ul>
      <div class="anatomy-controls">
        <label for="replica-desired">Desired replicas
          <select id="replica-desired" value={state().desired} disabled={!editable()} onChange={(event) => apply(scale(state(), Number(event.currentTarget.value)))}>
            <For each={[0, 1, 2, 3, 4]}>{(count) => <option value={count} selected={state().desired === count}>{count}</option>}</For>
          </select>
        </label>
        <label for="replica-pod">Pod identity
          <select id="replica-pod" value={selectedId()} disabled={!editable() || !state().pods.length} onChange={(event) => setSelection(Number(event.currentTarget.value))}>
            <For each={state().pods}>{(pod) => <option value={pod.id} selected={selectedId() === pod.id}>p{pod.id} · RS-v{pod.revision}</option>}</For>
          </select>
        </label>
        <button type="button" disabled={!editable() || !state().pods.length} onClick={() => apply(deletePod(state(), selectedId()))}>Delete selected Pod</button>
        <button type="button" disabled={!editable() || state().revision === 2} onClick={() => apply(changeTemplate(state()))}>Change template to app:v2</button>
        <button type="button" disabled={!hydrated() || moving() || converged(state())} onClick={() => apply(advance(state()))}>Step reconciliation</button>
        <button type="button" disabled={!hydrated() || moving()} onClick={() => { setSelection(1); apply(initialState()); }}>Reset / replay</button>
      </div>
      <div class="anatomy-readout" role="status" aria-live="polite" aria-atomic="true">
        <strong>{converged(state()) ? 'Converged' : 'Reconciling'}{moving() ? ' · apparatus settling' : ''}</strong>
        <p>Deployment desired {state().desired} · template app:v{state().revision} · revision {state().revision}</p>
        <p>Observed non-terminating Pods {state().pods.length} · Ready {readyOf(state())}</p>
        <p>RS-v1 target {state().targets[0]} / observed {countOf(state(), 1)} · {state().revision === 2 ? `RS-v2 target ${state().targets[1]} / observed ${countOf(state(), 2)}` : 'RS-v2 does not exist'}</p>
        <p>{state().message}</p>
      </div>
      <section class="replica-ledger" aria-label="Current Pod ownership and identity ledger">
        <h3>Pod identity ledger</h3>
        <ul><For each={[...state().pods].sort((a, b) => a.revision - b.revision || a.slot - b.slot)}>{(pod) =>
          <li><strong>p{pod.id}</strong><span>RS-v{pod.revision} · slot {pod.slot + 1}</span><span>app:v{pod.revision} · {pod.ready ? 'Ready' : 'Created; not Ready'}</span></li>
        }</For></ul>
        <p>{state().pods.length ? '' : 'No Pod objects in this fixture.'} Retired identities: {state().retired.length ? state().retired.map((id) => `p${id}`).join(', ') : 'none'}.</p>
      </section>
      <p class="replica-hint">Choose an intent or delete a Pod, then step. Each click reveals one owner’s action. Controls lock while the apparatus moves and until that intent converges; reset restarts the fixture.</p>
      <p class="replica-hint">RollingUpdate fixture: maxSurge 1, maxUnavailable 0. All new Pods eventually become Ready. Cartridge travel depicts creation, readiness or removal—not a Pod moving to another node.</p>
    </div>
  );
}
