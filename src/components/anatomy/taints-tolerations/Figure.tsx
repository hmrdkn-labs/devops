import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { base, blade, cartridge, frame, laneFloor, laneY, move } from './geometry';
import { evaluate, initialConfig, profiles, type Config, type Profile } from './model';
import './figure.css';

// Geometry is built once; only lift and carriage transforms change during motion.
const lanes = laneY.map((y) => ({ floor: laneFloor(y), car: cartridge(y),
  gates: [-40, 36].map((x) => ({ back: frame(y, x, false), blade: blade(y, x), front: frame(y, x, true) })) }));

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  const cars: Array<SVGGElement | undefined> = [];
  const gates: Array<SVGGElement | undefined> = [];
  const [config, setConfig] = createSignal<Config>({ ...initialConfig });
  const result = createMemo(() => evaluate(config()));
  const [busy, setBusy] = createSignal(false);
  const [phase, setPhase] = createSignal<'ready' | 'moving' | 'complete'>('ready');
  const [notice, setNotice] = createSignal('');
  let carX = -108;
  let targetX = -108;
  const lift = [0, 38, 38, 0];
  let targetLift = [...lift];
  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    const follow = (at: number, target: number) => {
      const next = reduced ? target : at + (target - at) * (1 - Math.exp(-dt / .18));
      return Math.abs(next - target) < .025 ? target : next;
    };
    carX = follow(carX, targetX);
    cars.forEach((car) => car?.setAttribute('transform', move(carX)));
    lift.forEach((at, i) => {
      lift[i] = follow(at, targetLift[i]!);
      gates[i]?.setAttribute('transform', move(0, 0, lift[i]!));
    });
    const moving = carX !== targetX || lift.some((at, i) => at !== targetLift[i]);
    if (!moving && busy()) {
      setBusy(false);
      if (phase() === 'moving') {
        setPhase('complete');
        setNotice(result().selected ? `Assigned to ${result().selected}; containers have not been started by this model.` : 'Unscheduled: no feasible node.');
      } else setNotice('Filters settled. Attempt placement to inspect the outcome.');
    }
    return moving;
  });
  function configure(next: Config) {
    if (busy()) return;
    setConfig(next);
    setPhase('ready');
    // A changed fixture starts a NEW unassigned Pod, not a migration of a bound Pod.
    carX = targetX = -108;
    cars.forEach((car) => car?.setAttribute('transform', move(carX)));
    const state = evaluate(next);
    targetLift = [state.taintPass ? 38 : 0, state.capacityPass ? 38 : 0, 38, next.alternate ? 38 : 0];
    setBusy(true);
    setNotice('Preparing a new unassigned Pod and evaluating filters.');
    wake();
  }
  function attempt() {
    if (busy()) return;
    carX = -108;
    cars.forEach((car) => car?.setAttribute('transform', move(carX)));
    targetX = result().selected === 'node-b' ? 96 : result().stopA;
    setPhase('moving');
    setBusy(true);
    setNotice('Inspecting placement; the cartridge is moving.');
    wake();
  }
  const readout = createMemo(() => {
    const r = result();
    if (phase() === 'moving') return 'Attempt in progress · no assignment recorded yet';
    if (phase() === 'complete') return r.selected ? `Assigned: ${r.selected} · not proof of Running` : 'Unscheduled · no feasible node · no forced placement';
    return busy() ? 'Preparing filters · new unassigned Pod' : 'Created, unassigned · filters shown · attempt placement';
  });
  return <div ref={root} class="anatomy-figure tt-figure" aria-label="NoSchedule placement gate controls" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 04 · Scheduling</span><span>Permission is not attraction</span></div>
    <svg class="iso-svg" viewBox="0 0 720 430" role="img" aria-labelledby="tt-title tt-desc">
      <title id="tt-title">Two-lane placement inspection apparatus</title>
      <desc id="tt-desc">Rear lane: node A, with a taint gate then an independent CPU gate. Front lane: untainted node B, optionally available. Lifted blades permit passage. The highlighted Pod cartridge moves on an explicit placement attempt, never through a closed gate.</desc>
      <g innerHTML={base} />
      <For each={lanes}>{(lane, laneIndex) => <g>
        <g innerHTML={lane.floor} />
        <For each={lane.gates}>{(gate) => <g innerHTML={gate.back} />}</For>
        <Show when={(config().alternate ? 1 : 0) === laneIndex()}>
          <g ref={(el) => { cars[laneIndex()] = el; }} transform={move(-108)} innerHTML={lane.car} />
        </Show>
        <For each={lane.gates}>{(gate, gateIndex) => <>
          <g ref={(el) => { gates[laneIndex() * 2 + gateIndex()] = el; }} transform={move(0, 0, lift[laneIndex() * 2 + gateIndex()]!)} innerHTML={gate.blade} />
          <g innerHTML={gate.front} />
        </>}</For>
      </g>}</For>
    </svg>
    <ul class="anatomy-legend"><li>Rear lane = node A</li><li>Front lane = node B</li><li>Left blade = taint filter</li><li>Right blade = capacity filter</li><li>Accent = one Pod</li></ul>
    <div class="anatomy-controls">
      <label>Toleration profile<select value={config().profile} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), profile: e.currentTarget.value as Profile })}>
        <For each={Object.entries(profiles)}>{([id, profile]) => <option value={id} selected={config().profile === id}>{profile.label}</option>}</For>
      </select></label>
      <label><input type="checkbox" checked={config().tainted} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), tainted: e.currentTarget.checked })} />Node A: NoSchedule taint</label>
      <label><input type="checkbox" checked={config().cpuFits} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), cpuFits: e.currentTarget.checked })} />Node A: enough CPU</label>
      <label><input type="checkbox" checked={config().alternate} disabled={!hydrated() || busy()} onChange={(e) => configure({ ...config(), alternate: e.currentTarget.checked })} />Node B: available (higher fixture score)</label>
      <button type="button" disabled={!hydrated() || busy()} onClick={attempt}>{phase() === 'complete' ? 'Replay placement' : 'Attempt placement'}</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={() => configure({ ...initialConfig })}>Reset</button>
    </div>
    <p class="anatomy-readout" data-readout>{readout()}</p>
    <div class="tt-facts">
      <p><strong>Node A taint:</strong> {config().tainted ? 'dedicated=batch:NoSchedule' : 'none'}</p>
      <p><strong>Pod toleration:</strong> {profiles[config().profile].toleration ? JSON.stringify(profiles[config().profile].toleration) : 'none'}</p>
      <p><strong>Node A filters:</strong> taint {result().taintPass ? 'permits' : 'rejects'} · CPU {result().cpuAvailable}m available / 600m requested ({result().capacityPass ? 'fits' : 'rejects'}) · memory 1024Mi available / 256Mi requested (fits)</p>
      <p><strong>Node B:</strong> {config().alternate ? 'eligible; no taints; 1000m CPU and 1024Mi available' : 'unavailable in this fixture'} · illustrative score B 20, A 10; tolerations add no score.</p>
    </div>
    <p class="tt-caption">Change a condition to prepare a new unassigned Pod. Then attempt placement. Gates show eligibility, not container execution; the left-to-right check order is an analogy.</p>
    <span class="tt-sr-only" role="status" aria-live="polite">{notice()}</span>
  </div>;
}
