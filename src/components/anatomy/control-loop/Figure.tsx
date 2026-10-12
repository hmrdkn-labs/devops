import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge from '@/components/anatomy/shared/StateBadge';
import {
  BEAM_Z, LEFT_X, RIGHT_X, VIEW_H, beamPath, bellArt, cartridgeSlots, chainPath, chassis, columnArt, controllerBackArt,
  controllerFrontArt, counterArt, deskArt, desiredChipArt, dialArt, dialPointer, endZ, glassArt, hintLampArt,
  needlePath, nodeBackArt, observedChipArt, outboxArt, outboxLampArt, panPlateArt, panTags, podSlots, socketArt,
  statusLampArt, translateZ,
} from './geometry';
import {
  converged, countMatches, deletePodObject, dropHints, editReplicas, initialState, manifestOf, pass, readyMatches, readyOf,
  reportReady, statusCurrent, tiltOf, type LoopState,
} from './model';
import './figure.css';

/** A value that eases toward its target; the figure only ever writes attributes from these. */
interface Pose { value: number; target: number }
const pose = (value: number): Pose => ({ value, target: value });
const slots = [0, 1, 2, 3];
const lastLabel: Record<LoopState['lastRequest'], string> = {
  none: 'nothing: no write', create: 'a Pod create request', delete: 'a Pod delete request', status: 'a status write',
};
const leftTag = panTags(LEFT_X);
const rightTag = panTags(RIGHT_X);

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  let keyEl: HTMLDetailsElement | undefined;
  onMount(() => {
    setHydrated(true);
    // The key is open on wide screens and collapsed on phones, where the controls and report need the room.
    if (keyEl) keyEl.open = window.matchMedia('(min-width: 700px)').matches;
  });
  const [state, setState] = createSignal<LoopState>(initialState());
  const [moving, setMoving] = createSignal(false);
  const [victim, setVictim] = createSignal<number | null>(null);
  const ordered = createMemo(() => [...state().pods].sort((a, b) => a.id - b.id));
  const selectedId = createMemo(() => {
    const id = victim();
    return id !== null && state().pods.some((pod) => pod.id === id) ? id : null;
  });
  const pending = createMemo(() => state().pods.some((pod) => !pod.ready));
  const manifestLines = createMemo<ManifestLine[]>(() => manifestOf(state()).map((line) => ({
    text: line.text,
    highlight: line.field !== undefined && state().change.reads.includes(line.field),
  })));

  const start = initialState();
  const tilt = pose(tiltOf(start));
  const dial = pose(start.desired);
  const needle = pose(readyOf(start));
  const apiCreated = slots.map(() => pose(0));
  const apiReady = slots.map(() => pose(0));
  const cartLift = slots.map(() => pose(40));
  const cartAlpha = slots.map(() => pose(0));
  const chipDesired = slots.map(() => pose(0));
  const chipCreated = slots.map(() => pose(0));
  const chipReady = slots.map(() => pose(0));
  const allPoses = () => [
    tilt, dial, needle, ...apiCreated, ...apiReady, ...cartLift, ...cartAlpha, ...chipDesired, ...chipCreated, ...chipReady,
  ];

  let root: HTMLDivElement | undefined;
  let beam: SVGPathElement | undefined;
  let chainLeft: SVGPathElement | undefined;
  let chainRight: SVGPathElement | undefined;
  let panLeft: SVGGElement | undefined;
  let panRight: SVGGElement | undefined;
  let pointer: SVGPathElement | undefined;
  let gaugeNeedle: SVGPathElement | undefined;
  const createdEls: (SVGGElement | undefined)[] = [];
  const readyEls: (SVGGElement | undefined)[] = [];
  const cartEls: (SVGGElement | undefined)[] = [];
  const chipDesiredEls: (SVGGElement | undefined)[] = [];
  const chipCreatedEls: (SVGGElement | undefined)[] = [];
  const chipReadyEls: (SVGGElement | undefined)[] = [];

  /** Sets every pose target from the state; motion only moves values toward them. */
  function aim(next: LoopState) {
    tilt.target = tiltOf(next);
    dial.target = next.desired;
    needle.target = readyOf(next);
    for (const slot of slots) {
      const pod = next.pods.find((candidate) => candidate.slot === slot);
      apiCreated[slot]!.target = pod && !pod.ready ? 1 : 0;
      apiReady[slot]!.target = pod?.ready ? 1 : 0;
      cartLift[slot]!.target = pod?.ready ? 0 : 40;
      cartAlpha[slot]!.target = pod?.ready ? 1 : 0;
      chipDesired[slot]!.target = slot < next.desired ? 1 : 0;
      chipCreated[slot]!.target = pod && !pod.ready ? 1 : 0;
      chipReady[slot]!.target = pod?.ready ? 1 : 0;
    }
  }
  aim(start);
  for (const item of allPoses()) item.value = item.target;

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / 0.16);
    let remains = false;
    const ease = (item: Pose) => {
      item.value += (item.target - item.value) * blend;
      if (Math.abs(item.target - item.value) < 0.002) item.value = item.target;
      remains ||= item.value !== item.target;
      return item.value;
    };
    const t = ease(tilt);
    beam?.setAttribute('d', beamPath(t));
    chainLeft?.setAttribute('d', chainPath(LEFT_X, endZ('left', t)));
    chainRight?.setAttribute('d', chainPath(RIGHT_X, endZ('right', t)));
    panLeft?.setAttribute('transform', translateZ(endZ('left', t) - BEAM_Z));
    panRight?.setAttribute('transform', translateZ(endZ('right', t) - BEAM_Z));
    pointer?.setAttribute('d', dialPointer(ease(dial)));
    gaugeNeedle?.setAttribute('d', needlePath(ease(needle)));
    for (const slot of slots) {
      createdEls[slot]?.setAttribute('opacity', String(ease(apiCreated[slot]!)));
      readyEls[slot]?.setAttribute('opacity', String(ease(apiReady[slot]!)));
      cartEls[slot]?.setAttribute('transform', translateZ(ease(cartLift[slot]!)));
      cartEls[slot]?.setAttribute('opacity', String(ease(cartAlpha[slot]!)));
      chipDesiredEls[slot]?.setAttribute('opacity', String(ease(chipDesired[slot]!)));
      chipCreatedEls[slot]?.setAttribute('opacity', String(ease(chipCreated[slot]!)));
      chipReadyEls[slot]?.setAttribute('opacity', String(ease(chipReady[slot]!)));
    }
    if (!remains && moving()) setMoving(false);
    return remains;
  });

  function apply(next: LoopState) {
    if (next === state()) return;
    setState(next);
    aim(next);
    setMoving(allPoses().some((item) => item.value !== item.target));
    wake();
  }

  function deleteSelected() {
    const id = selectedId();
    if (id === null) return;
    apply(deletePodObject(state(), id));
    setVictim(null);
  }

  return (
    <div ref={root} class="anatomy-figure loop-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 04 · CONTROL LOOP BALANCE</span><span>Compare, then act through the API</span></div>
      <div class="anatomy-bench">
      <div class="anatomy-bench-object">
      <svg class="iso-svg loop-svg" viewBox={`0 0 760 ${VIEW_H}`} role="img" aria-labelledby="loop-title loop-description">
        <title id="loop-title">A balance comparing desired and observed Pods, an API desk, and a sealed node enclosure</title>
        <desc id="loop-description">A controller balance compares the spec count on the left pan with observed Pod objects on the right. The beam tilts toward the heavier side. The controller writes Pod objects to the API desk through an outbox. Containers sit in numbered node sockets behind glass that the controller cannot reach. A level beam means nothing is left for the loop to write.</desc>
        <g innerHTML={chassis} />
        <g innerHTML={deskArt} />
        <g innerHTML={dialArt} />
        <path class="loop-pointer" ref={pointer} d={dialPointer(dial.value)} />
        <g innerHTML={counterArt} />
        <g class="loop-lamp" data-on={String(statusCurrent(state()))} innerHTML={statusLampArt} />
        <For each={slots}>{(slot) => <g>
          <g innerHTML={podSlots[slot]!.plate} />
          <g ref={(element) => { createdEls[slot] = element; }} opacity={String(apiCreated[slot]!.value)} innerHTML={podSlots[slot]!.created} />
          <g ref={(element) => { readyEls[slot] = element; }} opacity={String(apiReady[slot]!.value)} innerHTML={podSlots[slot]!.ready} />
          <text class="loop-numeral" x={podSlots[slot]!.numeral[0]} y={podSlots[slot]!.numeral[1]}>{slot + 1}</text>
        </g>}</For>
        <g innerHTML={bellArt} />
        <For each={[0, 1]}>{(index) => <g class="loop-lamp" data-on={String(state().hints > index)} innerHTML={hintLampArt[index]} />}</For>
        <g innerHTML={controllerBackArt} />
        <g innerHTML={columnArt} />
        <path class="loop-beam" ref={beam} d={beamPath(tilt.value)} />
        <path class="loop-chain" ref={chainLeft} d={chainPath(LEFT_X, endZ('left', tilt.value))} />
        <path class="loop-chain" ref={chainRight} d={chainPath(RIGHT_X, endZ('right', tilt.value))} />
        <g ref={panLeft} transform={translateZ(endZ('left', tilt.value) - BEAM_Z)}>
          <g innerHTML={panPlateArt(LEFT_X)} />
          <For each={slots}>{(slot) => <g ref={(element) => { chipDesiredEls[slot] = element; }} opacity={String(chipDesired[slot]!.value)} innerHTML={desiredChipArt(LEFT_X, slot)} />}</For>
          <text class="loop-tag-label" x={leftTag.label[0]} y={leftTag.label[1]}>spec</text>
          <text class="loop-tag-value" x={leftTag.value[0]} y={leftTag.value[1]}>{state().desired}</text>
        </g>
        <g ref={panRight} transform={translateZ(endZ('right', tilt.value) - BEAM_Z)}>
          <g innerHTML={panPlateArt(RIGHT_X)} />
          <For each={slots}>{(slot) => <>
            <g ref={(element) => { chipCreatedEls[slot] = element; }} opacity={String(chipCreated[slot]!.value)} innerHTML={observedChipArt(RIGHT_X, slot, false)} />
            <g ref={(element) => { chipReadyEls[slot] = element; }} opacity={String(chipReady[slot]!.value)} innerHTML={observedChipArt(RIGHT_X, slot, true)} />
          </>}</For>
          <text class="loop-tag-label" x={rightTag.label[0]} y={rightTag.label[1]}>observed</text>
          <text class="loop-tag-value" x={rightTag.value[0]} y={rightTag.value[1]}>{state().pods.length}</text>
        </g>
        <g innerHTML={controllerFrontArt} />
        <g innerHTML={outboxArt} />
        <g class="loop-lamp" data-on={String(state().lastRequest !== 'none')} innerHTML={outboxLampArt} />
        <g innerHTML={nodeBackArt} />
        <For each={slots}>{(slot) => <g innerHTML={socketArt[slot]} />}</For>
        <For each={slots}>{(slot) => <g ref={(element) => { cartEls[slot] = element; }} opacity={String(cartAlpha[slot]!.value)} transform={translateZ(cartLift[slot]!.value)}>
          <g innerHTML={cartridgeSlots[slot]!.art} />
          <text class="loop-numeral" x={cartridgeSlots[slot]!.numeral[0]} y={cartridgeSlots[slot]!.numeral[1]}>{slot + 1}</text>
        </g>}</For>
        <path class="loop-needle" ref={gaugeNeedle} d={needlePath(needle.value)} />
        <g innerHTML={glassArt} />
      </svg>

      <details class="loop-key" ref={keyEl}>
        <summary>Key</summary>
        <ul class="anatomy-legend">
          <li>Left pan: spec.replicas, the desired count (flat accent discs)</li>
          <li>Right pan: observed Pod objects (tall green Ready, short amber Created)</li>
          <li>Numerals: the same slot on the API tray and in the node sockets</li>
          <li>Cartridge behind glass: container seated and Ready on node-b</li>
          <li>Bell lamps: pending watch hints (up to two shown). Outbox lamp: the last pass sent a request. Status lamp: stored status matches live state.</li>
        </ul>
        <p class="loop-hint">Only a pass writes, one step at a time. Only the node side makes a Pod Ready.</p>
      </details>
      </div>
      <div class="anatomy-bench-panel">
      <div class="anatomy-controls loop-controls">
        <label for="loop-desired">Desired replicas
          <select id="loop-desired" value={state().desired} disabled={!hydrated()} onChange={(event) => apply(editReplicas(state(), Number(event.currentTarget.value)))}>
            <For each={[0, 1, 2, 3, 4]}>{(count) => <option value={count} selected={state().desired === count}>{count}</option>}</For>
          </select>
        </label>
        <label for="loop-victim">Pod to delete
          <select id="loop-victim" value={selectedId() ?? ''} disabled={!hydrated() || state().pods.length === 0} onChange={(event) => setVictim(event.currentTarget.value === '' ? null : Number(event.currentTarget.value))}>
            <option value="" selected={selectedId() === null}>None selected</option>
            <For each={ordered()}>{(pod) => <option value={pod.id} selected={selectedId() === pod.id}>{pod.name}</option>}</For>
          </select>
        </label>
        <button type="button" class="loop-primary" data-anatomy-primary disabled={!hydrated()} onClick={() => apply(pass(state()))}>Run controller pass</button>
        <button type="button" disabled={!hydrated() || !pending()} onClick={() => apply(reportReady(state()))}>Node reports one Pod Ready</button>
        <button type="button" disabled={!hydrated() || selectedId() === null} onClick={deleteSelected}>Delete Pod object</button>
        <button type="button" disabled={!hydrated() || state().hints === 0} onClick={() => apply(dropHints(state()))}>Drop pending hints</button>
        <button type="button" class="loop-wide" disabled={!hydrated()} onClick={() => { setVictim(null); apply(initialState()); }}>Reset / replay</button>
      </div>

      <ChangeReport busy={moving()} change={state().change} />
      <div class="loop-state" data-anatomy-status>
      <div class="loop-status">
        <StateBadge tone={countMatches(state()) ? 'pass' : 'wait'} label={countMatches(state()) ? 'Count matches spec' : 'Count differs from spec'} />
        <StateBadge tone={readyMatches(state()) ? 'pass' : 'wait'} label={readyMatches(state()) ? 'Ready matches spec' : 'Ready differs from spec'} />
        <StateBadge tone={statusCurrent(state()) ? 'pass' : 'wait'} label={statusCurrent(state()) ? 'Stored status current' : 'Stored status stale'} />
        <StateBadge tone={converged(state()) ? 'pass' : 'wait'} label={converged(state()) ? 'Converged' : 'Reconciling'} />
        <Show when={moving()}><StateBadge tone="info" label="apparatus settling" /></Show>
      </div>
      <section class="loop-pods-wrap" aria-label="Pod objects">
        <Show when={ordered().length} fallback={<p class="loop-empty">No Pod objects.</p>}>
          <ul class="loop-pods">
            <For each={ordered()}>{(pod) => <li data-selected={selectedId() === pod.id ? 'true' : 'false'}>
              <strong>{pod.name}</strong>
              <span>slot {pod.slot + 1}</span>
              <StateBadge tone={pod.ready ? 'pass' : 'wait'} label={pod.ready ? 'Ready' : 'Created, not Ready'} />
              <Show when={selectedId() === pod.id}><StateBadge tone="selected" label="selected" /></Show>
            </li>}</For>
          </ul>
        </Show>
        <p class="loop-retired">Retired names are not reused until Reset / replay: {state().retired.length ? state().retired.join(', ') : 'none'}</p>
      </section>

      <dl class="loop-compare" aria-label="Live state and stored status">
        <div data-field="live-pods"><dt>Live Pods</dt><dd>{state().pods.length}</dd></div>
        <div data-field="live-ready"><dt>Live Ready</dt><dd>{readyOf(state())}</dd></div>
        <div data-field="stored-replicas"><dt>Stored replicas</dt><dd>{state().status.replicas}</dd></div>
        <div data-field="stored-ready"><dt>Stored ready</dt><dd>{state().status.readyReplicas}</dd></div>
        <div data-field="generation"><dt>Generation</dt><dd>{state().generation}</dd></div>
        <div data-field="observed-generation"><dt>Observed generation</dt><dd>{state().status.observedGeneration}</dd></div>
        <div data-field="hints"><dt>Hints pending</dt><dd>{state().hints}</dd></div>
        <div data-field="last-pass"><dt>Last pass sent</dt><dd>{lastLabel[state().lastRequest]}</dd></div>
      </dl>
      </div>
      </div>
      </div>

      <div class="loop-manifest">
        <ManifestPanel title="ReplicaSet web (fixture object)" lines={manifestLines()}
          note="Highlighted lines are the fields the last step read or changed. Pod objects are listed above, not in this YAML." />
      </div>
    </div>
  );
}
