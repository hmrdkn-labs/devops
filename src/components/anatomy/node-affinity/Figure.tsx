import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel from '@/components/anatomy/shared/ManifestPanel';
import StateBadge from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { translateAlong } from '@/lib/anatomy/vendor/iso-kit';
import { bedNames, beds, carriage, combClips, combs, foundation, laneX, plungers, projection, scoreClips } from './geometry';
import {
  candidates, defaults, describe, feelers, initialReport, initialState, lifecycle, manifest, NODE_IDS, reduce, plungerRise,
  podName, readout, WEIGHT_MAX, WEIGHT_MIN, type Action, type Evaluation, type Phase, type Setting, type Settings, type State,
} from './model';
import './figure.css';

const stepLabels: Partial<Record<Phase, string>> = {
  created: 'Evaluate node requirements',
  filtered: 'Score eligible nodes',
  scored: 'Record assignment',
  assigned: 'Simulate container startup',
};
const FEELER_LIFT = 16;

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<State>(initialState());
  const [moving, setMoving] = createSignal(false);
  const [report, setReport] = createSignal<Change>(initialReport());
  // The slider shows a draft while dragging; the rule is committed only on change.
  const [draftWeight, setDraftWeight] = createSignal(defaults.weight);
  const rows = createMemo(() => candidates(state()));
  const evaluated = () => state().phase !== 'created';
  const locked = () => !hydrated() || state().bound !== null;
  let root: HTMLDivElement | undefined;
  let shuttle: SVGGElement | undefined;
  const combRefs: SVGGElement[][] = [[], [], []];
  const scoreRefs: SVGGElement[] = [];
  const pose = { x: 0, y: 0, z: 0, comb: Array.from({ length: 9 }, () => 0), score: [0, 0, 0] };
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
    rows().forEach((row: Evaluation, lane) => {
      const lift = feelers(row, evaluated());
      [lift.selector, lift.capacity, lift.required].forEach((up, check) => {
        const index = lane * 3 + check;
        pose.comb[index] = follow(pose.comb[index]!, up ? FEELER_LIFT : 0);
        combRefs[lane]![check]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.comb[index]!]));
      });
      pose.score[lane] = follow(pose.score[lane]!, plungerRise(row, ['scored', 'assigned', 'running'].includes(state().phase)));
      scoreRefs[lane]?.setAttribute('transform', translateAlong(projection, [0, 0, pose.score[lane]!]));
    });
    const remains = active || route.length > 0;
    if (!remains && moving()) setMoving(false);
    return remains;
  });
  function transition(next: State) {
    setState(next);
    const lane = next.bound ? laneX[NODE_IDS.indexOf(next.bound)]! : 0;
    const y = next.bound ? 108 : 0;
    // Retarget from the current pose on every change. Lift clear of label cards before
    // lateral travel; lower only over a bed. A same-bed change just settles the height.
    route = pose.x !== lane || pose.y !== y
      ? [[pose.x, pose.y, 24], [lane, y, 24], [lane, y, 0]]
      : [[lane, y, 0]];
    setMoving(true);
    wake();
  }
  function apply(action: Action) {
    const before = state();
    const next = reduce(before, action);
    if (next !== before) {
      setReport(describe(action, before, next));
      transition(next);
    }
    // The draft always follows the committed rule, including a rejected or reset value.
    setDraftWeight(state().settings.weight);
  }
  // Buttons wait for the apparatus to settle. A rule commit may land mid-travel: it restarts
  // evaluation for the same Pod and retargets the carriage from where it is now.
  function act(action: Action) {
    if (!hydrated() || moving()) return;
    apply(action);
  }
  function commit<K extends Setting>(key: K, value: Settings[K]) {
    if (!hydrated()) return;
    apply({ kind: 'setting', key, value });
  }
  const pod = () => podName(state());
  const lc = () => lifecycle(state());

  function checkBadge(applies: boolean, pass: boolean) {
    if (!evaluated()) return <StateBadge tone="wait" label="not evaluated" />;
    if (!applies) return <StateBadge tone="info" label="not applicable" />;
    return pass ? <StateBadge tone="pass" label="pass" /> : <StateBadge tone="fail" label="fail" />;
  }
  function preferenceText(row: Evaluation) {
    if (state().phase === 'unscheduled') return 'not scored: no eligible node';
    if (!['scored', 'assigned', 'running'].includes(state().phase)) return 'not scored yet';
    if (row.score === null) return 'not scored: not eligible';
    return row.preference.match ? `matches preferred zone, score ${row.score}` : `eligible, no preference match, score ${row.score}`;
  }
  function podHereLabel() {
    if (state().phase === 'assigned') return `${pod()} assigned here, not Running`;
    return state().relabeled ? `Existing Pod ${pod()}: still Running here` : `${pod()} Running here`;
  }
  return <div class="anatomy-figure affinity-sorter" ref={root} aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>FIG 05 · LABEL SORTER</span><span>Filter first. Rank second.</span></div>
    <p class="affinity-purpose">A Pod states hard rules (nodeSelector, required affinity, resource requests) and a soft preference. Filters remove nodes that break a hard rule; only survivors are scored. You write the Pod's rules; administrators write node labels.</p>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <svg class="iso-svg" viewBox="0 0 720 420" role="img" aria-labelledby="affinity-svg-title affinity-svg-desc">
      <title id="affinity-svg-title">A three-bed label-reading placement sorter</title>
      <desc id="affinity-svg-desc">Beds engraved node-a, node-b and node-c from left to right. Each bed has three feelers: left for nodeSelector, middle for request capacity, right for required affinity. A feeler lifts only when its own check passed after evaluation. Eligible beds raise a score plunger. The accent cartridge is the Pod; it seats over its assigned node, and changing that node's labels leaves it in place.</desc>
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
        <g innerHTML={bedNames[index()]} />
        <For each={combs[index()]!}>{(comb, check) => <g clip-path={`url(#affinity-comb-${index()}-${check()})`}>
          <g ref={el => { combRefs[index()]![check()] = el; }} innerHTML={comb} />
        </g>}</For>
        <g clip-path={`url(#affinity-score-${index()})`}>
          <g ref={el => { scoreRefs[index()] = el; }} innerHTML={plungers[index()]} />
        </g>
      </g>}</For>
      <g ref={shuttle} innerHTML={carriage} />
    </svg>
    <ul class="anatomy-legend">
      <li>Beds left to right: node-a, node-b, node-c (engraved)</li>
      <li>Feelers: left nodeSelector · middle request capacity · right required affinity</li>
      <li>Lifted feeler = that check applies and passed</li>
      <li>Raised plunger = eligible and scored; height adds the preference score</li>
      <li>Accent cartridge = the Pod ({pod()})</li>
    </ul>
    <div class="anatomy-controls affinity-rules" aria-label="Pod rules">
      <label>nodeSelector disk <select disabled={locked()} value={state().settings.selector} onChange={e => commit('selector', e.currentTarget.value as Settings['selector'])}><option value="any" selected={state().settings.selector === 'any'}>none</option><option value="ssd" selected={state().settings.selector === 'ssd'}>ssd</option><option value="hdd" selected={state().settings.selector === 'hdd'}>hdd</option></select></label>
      <label class="affinity-wide">Required affinity <select disabled={locked()} value={state().settings.required} onChange={e => commit('required', e.currentTarget.value as Settings['required'])}><option value="none" selected={state().settings.required === 'none'}>none</option><option value="east-ssd" selected={state().settings.required === 'east-ssd'}>east AND ssd</option><option value="east-ssd-or-west" selected={state().settings.required === 'east-ssd-or-west'}>(east AND ssd) OR west</option></select></label>
      <label class="affinity-pref">Preferred zone <select disabled={locked()} value={state().settings.preferredZone} onChange={e => commit('preferredZone', e.currentTarget.value as Settings['preferredZone'])}><option value="east" selected={state().settings.preferredZone === 'east'}>east</option><option value="west" selected={state().settings.preferredZone === 'west'}>west</option></select></label>
      <label>Preference weight <input type="range" min={WEIGHT_MIN} max={WEIGHT_MAX} step="1" disabled={locked()} value={draftWeight()} onInput={e => setDraftWeight(Number(e.currentTarget.value))} onChange={e => commit('weight', Number(e.currentTarget.value))} /><span>{draftWeight()}</span></label>
      <label class="affinity-check"><input type="checkbox" disabled={locked()} checked={state().settings.capacityC} onChange={e => commit('capacityC', e.currentTarget.checked)} /> node-c has request capacity</label>
      <button type="button" class="affinity-reset" disabled={!hydrated() || moving()} onClick={() => act({ kind: 'reset' })}>Reset fixture</button>
    </div>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls affinity-steps" aria-label="Scheduling steps">
      <button type="button" data-anatomy-primary disabled={!hydrated() || moving() || ['running', 'unscheduled'].includes(state().phase)} onClick={() => act({ kind: 'step' })}>{stepLabels[state().phase] ?? 'Placement finished'}</button>
      <button type="button" disabled={!hydrated() || moving() || state().phase !== 'running' || state().relabeled} onClick={() => act({ kind: 'labels' })}>Change running-node labels</button>
      <button type="button" disabled={!hydrated() || moving()} onClick={() => act({ kind: 'replay' })}>Replay same rules</button>
    </div>
    <div class="affinity-status">
      <ul class="affinity-lifecycle" aria-label="Pod lifecycle">
        <li><StateBadge tone={lc().assignedTo ? 'selected' : 'wait'} label={lc().assignedTo ? `Assigned to ${lc().assignedTo}` : 'Assigned: no'} /></li>
        <li><StateBadge tone={lc().running ? 'pass' : 'wait'} label={lc().running ? 'Running: yes' : 'Running: no'} /></li>
        <Show when={lc().unscheduled}><li><StateBadge tone="fail" label="Unscheduled" /></li></Show>
      </ul>
      <p class="anatomy-readout">{readout(state())}</p>
    </div>
    <ChangeReport change={report()} busy={moving()} />
    <div class="affinity-candidates" aria-label="Node labels and checks" data-anatomy-status>
      <For each={rows()}>{row => <section class="affinity-node" data-node={row.node.id}>
        <header class="affinity-node-head"><h3>{row.node.id}</h3><p class="affinity-labels"><code>disk={row.node.disk}</code> <code>zone={row.node.zone}</code></p></header>
        <Show when={state().bound === row.node.id}>
          <p><StateBadge tone={state().phase === 'assigned' ? 'selected' : state().relabeled ? 'info' : 'pass'} label={podHereLabel()} /></p>
        </Show>
        <p class="affinity-count">Pods bound here: {state().bound === row.node.id ? 1 : 0}</p>
        <ul class="affinity-checks">
          <li><span>nodeSelector {row.selector.wanted ? `disk=${row.selector.wanted}` : '(none)'}; node disk={row.selector.actual}</span> {checkBadge(row.selector.wanted !== null, row.selector.pass)}</li>
          <Show when={row.required.applies} fallback={<li><span>Required affinity: none</span> {checkBadge(false, true)}</li>}>
            <For each={row.terms}>{term => <li><span>{term.name}: {term.expressions.map(item => `${item.key} ${item.actual} (need ${item.wanted})`).join(' · ')}</span> {checkBadge(true, term.pass)}</li>}</For>
          </Show>
          <li><span>request capacity: {row.capacity.pass ? 'available' : 'missing'}</span> {checkBadge(true, row.capacity.pass)}</li>
          <li><span>preference: {preferenceText(row)}</span></li>
        </ul>
        <p class="affinity-verdict">New placement under current rules: {!evaluated() ? <StateBadge tone="wait" label="not evaluated" /> : row.eligible ? <StateBadge tone="pass" label="Eligible" /> : <StateBadge tone="fail" label="Rejected" />}</p>
        <Show when={evaluated() && !row.eligible}><p class="affinity-reasons">{row.reasons.join('; ')}</p></Show>
      </section>}</For>
    </div>
    </div>
    </div>
    <ManifestPanel title={`Pod spec · ${pod()}`} lines={manifest(state())} note="Highlighted lines are the fields the last interaction read or changed." />
    <p class="anatomy-fixture-note">Fixture: three nodes, one Pod at a time. Scores are raw preferred-rule weights; other score plugins and normalization are equal and ties go to the alphabetically first node. Ready, Services, eviction and real kubelet behaviour are not modelled. No live cluster is contacted.</p>
    <noscript>JavaScript is required for controls. The initial sorter and node-label preview remain visible; the explanation below is standalone.</noscript>
  </div>;
}
