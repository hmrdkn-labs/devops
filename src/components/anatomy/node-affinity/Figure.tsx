import { createMemo, createSignal, For, onMount } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import { beds, carriage, combs, combClips, foundation, laneX, plungers, projection, scoreClips } from './geometry';
import { advance, candidates, changeRunningLabels, initialState, readout, type Settings, type State } from './model';
import './figure.css';

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal(initialState());
  const [moving, setMoving] = createSignal(false);
  const rows = createMemo(() => candidates(state()));
  let root: HTMLDivElement | undefined;
  let shuttle: SVGGElement | undefined;
  const combRefs: SVGGElement[][] = [[], [], []];
  const scoreRefs: SVGGElement[] = [];
  const pose = { x: 0, y: 0, z: 0, comb: [0, 0, 0, 0, 0, 0], score: [0, 0, 0] };
  let route: Array<[number, number, number]> = [];
  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    let active = false;
    const follow = (at: number, target: number) => {
      const next = reduced ? target : at + (target - at) * (1 - Math.exp(-dt / .18));
      if (Math.abs(next - target) < .08) return target;
      active = true;
      return next;
    };
    if (reduced && route.length) route = [route[route.length - 1]!];
    const target = route[0];
    if (target) {
      pose.x = follow(pose.x, target[0]); pose.y = follow(pose.y, target[1]); pose.z = follow(pose.z, target[2]);
      shuttle?.setAttribute('transform', translateAlong(projection, [pose.x, pose.y, pose.z]));
      if (pose.x === target[0] && pose.y === target[1] && pose.z === target[2]) route.shift();
    }
    const s = state();
    const filtered = s.phase !== 'created';
    const scored = ['scored', 'assigned', 'running'].includes(s.phase);
    rows().forEach((row, lane) => {
      const checks = [row.selector, row.required];
      checks.forEach((passes, check) => {
        const index = lane * 2 + check;
        const target = filtered && passes && row.node.capacity ? 16 : 0;
        pose.comb[index] = follow(pose.comb[index]!, target);
        combRefs[lane]![check]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.comb[index]!]));
      });
      pose.score[lane] = follow(pose.score[lane]!, scored && row.eligible ? row.score! / 5 : 0);
      scoreRefs[lane]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.score[lane]!]));
    });
    const remains = active || route.length > 0;
    if (!remains && moving()) setMoving(false);
    return remains;
  });
  function transition(next: State) {
    if (moving()) return;
    setState(next);
    const lane = next.bound ? laneX[['node-a', 'node-b', 'node-c'].indexOf(next.bound)]! : 0;
    const y = next.bound ? 108 : 0;
    if (pose.x !== lane || pose.y !== y) {
      // Lift clear of label cards before lateral travel; lower only over a bed.
      route = [[pose.x, pose.y, 24], [lane, y, 24], [lane, y, 0]];
    }
    setMoving(true);
    wake();
  }
  function configure<K extends keyof Settings>(key: K, value: Settings[K]) {
    transition({ ...initialState(), settings: { ...state().settings, [key]: value } });
  }
  const locked = () => !hydrated() || moving() || state().bound !== null;
  const terminal = () => ['running', 'unscheduled'].includes(state().phase);
  return <div class="anatomy-figure affinity-sorter" ref={root} aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>FIG 05 · LABEL SORTER</span><span>Filter first. Rank second.</span></div>
    <svg class="iso-svg" viewBox="0 0 720 420" role="img" aria-labelledby="affinity-svg-title affinity-svg-desc">
      <title id="affinity-svg-title">A three-bed label-reading placement sorter</title>
      <desc id="affinity-svg-desc">Left to right: node-a, node-b, node-c. Each bed has selector and required-affinity feelers. Matching feelers lift; only eligible score plungers rise. The accent Pod carriage seats over the assigned node. Changing running-node labels does not move it.</desc>
      <defs>
        <For each={combClips}>{(clips, lane) => <For each={clips}>{(path, check) =>
          <clipPath id={`affinity-comb-${lane()}-${check()}`}><path d={path} /></clipPath>
        }</For>}</For>
        <For each={scoreClips}>{(path, lane) =>
          <clipPath id={`affinity-score-${lane()}`}><path d={path} /></clipPath>
        }</For>
      </defs>
      <g innerHTML={foundation} />
      <For each={beds}>{(art, index) => <g>
        <g innerHTML={art} />
        <For each={combs[index()]!}>{(comb, check) => <g clip-path={`url(#affinity-comb-${index()}-${check()})`}>
          <g ref={el => { combRefs[index()]![check()] = el; }} innerHTML={comb} />
        </g>}</For>
        <g clip-path={`url(#affinity-score-${index()})`}>
          <g ref={el => { scoreRefs[index()] = el; }} innerHTML={plungers[index()]} />
        </g>
      </g>}</For>
      <g ref={shuttle} innerHTML={carriage} />
    </svg>
    <ul class="anatomy-legend"><li>Left / middle / right = A / B / C</li><li>Paired feelers = selector + required affinity</li><li>Raised plunger = preferred contribution</li><li>Accent cartridge = one Pod</li></ul>
    <div class="anatomy-controls">
      <label>nodeSelector: disk <select disabled={locked()} value={state().settings.selector} onChange={e => configure('selector', e.currentTarget.value as Settings['selector'])}><option value="any" selected={state().settings.selector === 'any'}>No selector</option><option value="ssd" selected={state().settings.selector === 'ssd'}>ssd</option><option value="hdd" selected={state().settings.selector === 'hdd'}>hdd</option></select></label>
      <label>Required affinity <select disabled={locked()} value={state().settings.required} onChange={e => configure('required', e.currentTarget.value as Settings['required'])}><option value="none" selected={state().settings.required === 'none'}>None</option><option value="east-ssd" selected={state().settings.required === 'east-ssd'}>east AND ssd</option><option value="east-ssd-or-west" selected={state().settings.required === 'east-ssd-or-west'}>(east AND ssd) OR west</option></select></label>
      <label>Preferred zone <select disabled={locked()} value={state().settings.preferredZone} onChange={e => configure('preferredZone', e.currentTarget.value as Settings['preferredZone'])}><option value="east" selected={state().settings.preferredZone === 'east'}>east</option><option value="west" selected={state().settings.preferredZone === 'west'}>west</option></select></label>
      <label>Preference weight <input type="range" min="1" max="100" step="1" disabled={locked()} value={state().settings.weight} onInput={e => configure('weight', Number(e.currentTarget.value))} /><span>{state().settings.weight}</span></label>
      <label><input type="checkbox" disabled={locked()} checked={state().settings.capacityC} onChange={e => configure('capacityC', e.currentTarget.checked)} /> C has request capacity</label>
    </div>
    <div class="anatomy-controls">
      <button type="button" disabled={!hydrated() || moving() || terminal()} onClick={() => transition(advance(state()))}>{state().phase === 'assigned' ? 'Simulate kubelet start' : 'Step placement'}</button>
      <button type="button" disabled={!hydrated() || moving() || state().phase !== 'running' || state().labelsChanged} onClick={() => transition(changeRunningLabels(state()))}>Change running-node labels</button>
      <button type="button" disabled={!hydrated() || moving()} onClick={() => transition({ ...initialState(), settings: { ...state().settings } })}>Replay same rules</button>
      <button type="button" disabled={!hydrated() || moving()} onClick={() => transition(initialState())}>Reset</button>
    </div>
    <p class="anatomy-readout" role="status" aria-live="polite">{moving() ? `Moving apparatus · ${state().phase} target; wait for parts to settle` : readout(state())}</p>
    <div class="affinity-candidates" aria-label="Node labels and filter results">
      <For each={rows()}>{row => <section>
        <h3>{row.node.id}</h3>
        <p><code>disk={row.node.disk}</code><br /><code>zone={row.node.zone}</code></p>
        <p>{row.eligible ? 'Eligible' : 'Rejected'} · preference: {row.score === null ? 'not scored' : row.score}</p>
        <p>{row.reasons.length ? row.reasons.join('; ') : 'All hard constraints pass'}</p>
      </section>}</For>
    </div>
    <p class="anatomy-fixture-note">Candidate results preview the current rules. Step reveals filter → score → assignment → simulated start. Scores are raw preferred-rule weights; all other score contributions are equal, ties choose the alphabetically first node. No live cluster is contacted.</p>
    <noscript>JavaScript is required for controls. The initial sorter and node-label preview remain visible; the explanation below is standalone.</noscript>
  </div>;
}
