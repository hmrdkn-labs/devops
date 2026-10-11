import { createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { axisVector } from '@/lib/anatomy/vendor/iso-kit';
import { actors, snapshot, stages, type ActorId } from './model';
import { assemblies, consoleFront, foundation, indexShoe, projection } from './geometry';
import './figure.css';

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  let shoe: SVGGElement | undefined;
  let cartridge: SVGGElement | undefined;
  const drawers: Partial<Record<ActorId, SVGGElement>> = {};
  const latches: Partial<Record<ActorId, SVGGElement>> = {};
  const [stage, setStage] = createSignal(0);
  const [selected, setSelected] = createSignal<ActorId>('api');
  const [open, setOpen] = createSignal(false);
  const [moving, setMoving] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);
  let target = 0;
  let indexPosition = 0;
  const drawerPositions = actors.map(() => 0);
  const latchPositions = actors.map(() => 0);
  const alongX = axisVector(projection, [1, 0, 0]);
  const alongY = axisVector(projection, [0, 1, 0]);
  const state = () => snapshot(stage());
  const inspected = () => actors.find((actor) => actor.id === selected())!;
  const completionStage: Record<ActorId, number> = { api: 1, store: 2, controllers: 4, scheduler: 5, kubelet: 6, runtime: 7 };

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    // Replay is finite; reduced motion resolves the whole requested replay at once.
    if (reduced && playing()) {
      target = stages.length - 1;
      setSelected(stages[target].actor);
    }
    const blend = reduced ? 1 : 1 - Math.exp(-seconds / .16);
    let unsettled = false;
    const indexTarget = target * 30;
    indexPosition += (indexTarget - indexPosition) * blend;
    if (Math.abs(indexTarget - indexPosition) < .06) indexPosition = indexTarget;
    else unsettled = true;
    shoe?.setAttribute('transform', `translate(${alongX[0] * indexPosition} ${alongX[1] * indexPosition})`);
    for (let i = 0; i < actors.length; i++) {
      const actor = actors[i];
      const drawerTarget = open() && selected() === actor.id ? 20 : 0;
      const latchTarget = target >= completionStage[actor.id] ? 7 : 0;
      drawerPositions[i] += (drawerTarget - drawerPositions[i]) * blend;
      latchPositions[i] += (latchTarget - latchPositions[i]) * blend;
      if (Math.abs(drawerTarget - drawerPositions[i]) < .03) drawerPositions[i] = drawerTarget;
      else unsettled = true;
      if (Math.abs(latchTarget - latchPositions[i]) < .03) latchPositions[i] = latchTarget;
      else unsettled = true;
      drawers[actor.id]?.setAttribute('transform', `translate(${alongY[0] * drawerPositions[i]} ${alongY[1] * drawerPositions[i]})`);
      latches[actor.id]?.setAttribute('transform', `translate(${alongX[0] * latchPositions[i]} ${alongX[1] * latchPositions[i]})`);
      if (actor.id === 'runtime') {
        const extension = 12 * (1 - latchPositions[i] / 7);
        cartridge?.setAttribute('transform', `translate(${alongY[0] * extension} ${alongY[1] * extension})`);
      }
    }
    if (!unsettled) {
      setStage(target);
      if (playing() && target < stages.length - 1) {
        target += 1;
        setSelected(stages[target].actor);
        return true; // The next physical carriage movement is now pending.
      }
      setPlaying(false);
      setMoving(false);
    }
    return unsettled;
  });
  onMount(() => {
    cartridge = root?.querySelector<SVGGElement>('[data-runtime-cartridge]') ?? undefined;
    wake();
  });

  function advance() {
    if (moving() || stage() === stages.length - 1) return;
    target = stage() + 1;
    setSelected(stages[target].actor);
    setOpen(false);
    setMoving(true);
    wake();
  }
  function reset(replay: boolean) {
    // Cancels the previous finite sequence without timers or stale completion callbacks.
    target = 0;
    setSelected('api');
    setOpen(false);
    setPlaying(replay);
    setMoving(true);
    wake();
  }

  return (
    <div class="anatomy-figure cluster-console" ref={root} aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG 01 · RESPONSIBILITY CONSOLE</span><span>One Deployment · one node</span></div>
      <svg class="iso-svg" viewBox="0 0 760 490" role="img" aria-labelledby="cluster-console-title cluster-console-desc">
        <title id="cluster-console-title">Kubernetes cluster responsibility console</title>
        <desc id="cluster-console-desc">An open four-drawer control-plane rack beside a two-tray node chassis. Inspect a service drawer using the labelled controls. A moving ruler carriage tracks illustrative checkpoints; witness latches shift when their actor has acted. The physical drawer is an analogy, not the real software topology.</desc>
        <g innerHTML={foundation} />
        <For each={assemblies}>{(assembly) => <>
          <g innerHTML={assembly.shelf} />
          <g class="cc-assembly" data-selected={selected() === assembly.id ? 'true' : 'false'} ref={(element) => { drawers[assembly.id] = element; }}>
            <g innerHTML={assembly.tray} />
            <g ref={(element) => { latches[assembly.id] = element; }} innerHTML={assembly.latch} />
          </g>
        </>}</For>
        <g innerHTML={consoleFront} />
        <g ref={shoe} innerHTML={indexShoe} />
      </svg>
      <p class="cc-hint">Pull out a service drawer to inspect its board. Step through the ownership chain; the ruler tracks checkpoints, not network traffic.</p>
      <div class="anatomy-controls">
        <button type="button" onClick={advance} disabled={!hydrated() || moving() || stage() === stages.length - 1}>Next checkpoint</button>
        <button type="button" onClick={() => reset(true)} disabled={!hydrated() || moving()}>Replay apply → execution</button>
        <button type="button" onClick={() => reset(false)} disabled={!hydrated()}>Reset</button>
      </div>
      <div class="anatomy-controls">
        <label for="cluster-actor">Inspect actor
          <select id="cluster-actor" value={selected()} disabled={!hydrated() || moving()} onChange={(event) => {
            setSelected(event.currentTarget.value as ActorId);
            setOpen(false);
            setMoving(true);
            wake();
          }}>
            <For each={actors}>{(actor) => <option value={actor.id} selected={selected() === actor.id}>{actor.name}</option>}</For>
          </select>
        </label>
        <button type="button" aria-pressed={open()} disabled={!hydrated() || moving()} onClick={() => {
          setOpen(!open());
          setMoving(true);
          wake();
        }}>{open() ? 'Close inspection drawer' : 'Open inspection drawer'}</button>
      </div>
      <div class="anatomy-readout" aria-live="polite" aria-atomic="true">
        <strong>{moving() ? (playing() ? 'Replaying · ' : 'Moving · ') : ''}{state().checkpoint.title}</strong>
        <p>{state().checkpoint.detail}</p>
        <dl class="cc-state">
          <div><dt>Deployment</dt><dd>{state().deployment}</dd></div>
          <div><dt>ReplicaSet</dt><dd>{state().replicaSet}</dd></div>
          <div><dt>Pod objects</dt><dd>{state().pod}</dd></div>
          <div><dt>Assigned node</dt><dd>{state().pod ? state().node : 'no Pod'}</dd></div>
          <div><dt>Running containers</dt><dd>{state().running}</dd></div>
          <div><dt>API Pod status</dt><dd>{state().apiStatus}</dd></div>
        </dl>
      </div>
      <div class="cc-inspection">
        <p><strong>{inspected().name}</strong> · {inspected().location}</p>
        <p>{inspected().role}</p>
      </div>
      <ul class="anatomy-legend"><li>Accent: inspected actor</li><li>Shifted latch: actor has acted</li><li>Ruler shoe: illustrated checkpoint</li></ul>
      <p class="cc-caption">Fixture assumptions: accepted request, one replica, node-a eligible, successful image/network/storage setup. No time scale, retries, high availability or application-readiness check is simulated. Inspection changes the view only.</p>
      <noscript><p>The object is visible without JavaScript. Enable JavaScript for drawer inspection and checkpoint controls; the complete responsibility trace is explained below.</p></noscript>
    </div>
  );
}
