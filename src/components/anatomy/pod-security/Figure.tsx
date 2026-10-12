import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import ChangeReport from '../shared/ChangeReport';
import ManifestPanel, { type ManifestLine as PanelLine } from '../shared/ManifestPanel';
import StateBadge from '../shared/StateBadge';
import {
  BAY_AGENT, BAY_LEGACY, GATE_FRONT, IMAGE_REGISTRY, IMAGE_TRAY, RAIL, cellArt, chassis, gateArt, imageArt, latchArt, offset,
  registryArt, translateBy, zoneLabels, type Vec,
} from './geometry';
import {
  admissionBadge, agentOf, apply, containerBadge, editDraft, editNamespace, probeCache, pullBadge, initialState, isHighlighted,
  levels, manifestLines, removeAgent, retestOf, runtimeReadout, specFacts, startAgent, type Caps, type Escalation, type ImageUser,
  type Level, type Mode, type RunAsUser, type Seccomp, type State, modes,
} from './model';
import './figure.css';

const levelLabel: Record<Level, string> = { none: 'none (no label)', privileged: 'privileged', baseline: 'baseline', restricted: 'restricted' };
const capsLabel: Record<Caps, string> = {
  default: 'no capabilities field', 'drop-all': 'drop ALL', 'drop-all-bind': 'drop ALL, add NET_BIND_SERVICE', 'add-net-admin': 'add NET_ADMIN',
};
const capsOptions = Object.keys(capsLabel) as Caps[];
/** The cartridge part each readout row reads, named as in the legend. */
const partOf: Record<string, string> = {
  'Effective UID': 'dial',
  no_new_privs: 'lock',
  Capabilities: '3 tiles',
  seccomp: 'tile (left)',
  'Root filesystem': 'shutter',
  privileged: 'tile (right)',
};
const NONE: Vec = [0, 0, 0];

/** Ease toward the target and snap once close, so each motion ends on an exact pose. */
function ease(value: number, target: number, seconds: number) {
  const next = value + (target - value) * Math.min(1, seconds * 8);
  return Math.abs(target - next) < 0.02 ? target : next;
}

/** Where the request and the image block should be, given the state. A refused request waits in front of the latch. */
function targetsOf(s: State): { request: Vec; image: Vec } {
  const agent = agentOf(s);
  if (agent) return { request: offset(RAIL, BAY_AGENT), image: agent.pull === 'ok' ? offset(IMAGE_REGISTRY, IMAGE_TRAY) : NONE };
  const refused = s.admission !== null && s.admission.outcome !== 'accepted';
  return { request: refused ? offset(RAIL, GATE_FRONT) : NONE, image: NONE };
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  const [state, setState] = createSignal<State>(initialState());
  let root: HTMLDivElement | undefined;

  // A moving object keeps its drawn position, its current displacement and its target. A replaced Pod snaps
  // to its place instead of travelling as the old Pod; the same request, once admitted, travels into the bay.
  type Pose = { el?: SVGGElement; cur: Vec; target: Vec };
  const request: Pose = { cur: [...NONE], target: [...NONE] };
  const image: Pose = { cur: [...NONE], target: [...NONE] };

  const wake = createAnatomyMotion(() => root, (seconds, reduced) => {
    let moving = false;
    for (const pose of [request, image]) {
      for (let i = 0; i < 3; i++) {
        const value = reduced ? pose.target[i]! : ease(pose.cur[i]!, pose.target[i]!, seconds);
        pose.cur[i] = value;
        if (value !== pose.target[i]) moving = true;
      }
      pose.el?.setAttribute('transform', translateBy(pose.cur));
    }
    return moving && !reduced;
  });

  function commit(next: State, snap = false) {
    const goal = targetsOf(next);
    request.target = goal.request;
    image.target = goal.image;
    if (snap) {
      request.cur = [...goal.request];
      image.cur = [...goal.image];
    }
    setState(next);
    wake();
  }

  const agent = createMemo(() => agentOf(state()));
  const legacy = createMemo(() => state().pods.find((pod) => pod.name === 'legacy-agent'));
  const shown = createMemo(() => agent()?.spec ?? state().draft);
  const phase = createMemo(() => {
    const pod = agent();
    if (!pod) return 'no agent Pod';
    return pod.container === 'running' ? 'Running on node-a' : 'Pending on node-a (assigned, not Running)';
  });
  const requestArt = createMemo(() => {
    const pod = agent();
    return pod
      ? cellArt('agent', pod.uid, pod.spec, pod.container === 'running', RAIL)
      : cellArt('draft', 0, state().draft, false, RAIL);
  });
  const legacyArt = createMemo(() => {
    const pod = legacy();
    return pod ? cellArt(pod.name, pod.uid, pod.spec, pod.container === 'running', BAY_LEGACY) : '';
  });
  const manifest = createMemo<PanelLine[]>(() => manifestLines(state()).map((line) => ({
    text: line.text, highlight: isHighlighted(state(), line),
  })));
  const pipeline = createMemo(() => [admissionBadge(state()), pullBadge(agent()), containerBadge(agent())]);
  const readout = createMemo(() => runtimeReadout(state()));

  return (
    <div ref={root} class="anatomy-figure ps-figure" aria-busy={!hydrated()}>
      <div class="anatomy-figure-header"><span>FIG · POD SECURITY BENCH</span><span>Admission checks the spec; the kubelet checks the UID</span></div>

      <div class="ps-layout">
        <div class="ps-controls">
          <fieldset class="ps-group">
            <legend>Namespace sandbox labels</legend>
            <div class="anatomy-controls ps-label-grid">
              <For each={modes}>{(mode: Mode) => <label for={`ps-${mode}`}>{mode}
                <select id={`ps-${mode}`} disabled={!hydrated()} onChange={(event) => commit(editNamespace(state(), mode, event.currentTarget.value as Level))}>
                  <For each={levels}>{(level) => <option value={level} selected={state().ns[mode] === level}>{levelLabel[level]}</option>}</For>
                </select>
              </label>}</For>
            </div>
          </fieldset>

          <fieldset class="ps-group">
            <legend>Pod draft (not sent until Apply)</legend>
            <div class="ps-draft-grid">
              <label class="ps-check"><input type="checkbox" id="ps-nonroot" checked={state().draft.runAsNonRoot} disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { runAsNonRoot: event.currentTarget.checked }, 'runAsNonRoot', `runAsNonRoot ${event.currentTarget.checked ? 'is true' : 'is omitted (false)'} in the draft`))} /><span>runAsNonRoot</span></label>
              <label>runAsUser
                <select id="ps-runasuser" disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { runAsUser: event.currentTarget.value as RunAsUser }, 'runAsUser', `runAsUser is ${event.currentTarget.value} in the draft`))}>
                  <option value="unset" selected={state().draft.runAsUser === 'unset'}>unset</option>
                  <option value="0" selected={state().draft.runAsUser === '0'}>0 (root)</option>
                  <option value="1000" selected={state().draft.runAsUser === '1000'}>1000</option>
                </select>
              </label>
              <label>allowPrivilegeEscalation
                <select id="ps-escalation" disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { allowPrivilegeEscalation: event.currentTarget.value as Escalation }, 'allowPrivilegeEscalation', `allowPrivilegeEscalation is ${event.currentTarget.value} in the draft`))}>
                  <option value="unset" selected={state().draft.allowPrivilegeEscalation === 'unset'}>unset</option>
                  <option value="false" selected={state().draft.allowPrivilegeEscalation === 'false'}>false</option>
                  <option value="true" selected={state().draft.allowPrivilegeEscalation === 'true'}>true</option>
                </select>
              </label>
              <label class="ps-check"><input type="checkbox" id="ps-privileged" checked={state().draft.privileged} disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { privileged: event.currentTarget.checked }, 'privileged', `privileged ${event.currentTarget.checked ? 'is true' : 'is omitted'} in the draft`))} /><span>privileged</span></label>
              <label>capabilities
                <select id="ps-caps" disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { caps: event.currentTarget.value as Caps }, 'capabilities', `capabilities: ${capsLabel[event.currentTarget.value as Caps]} in the draft`))}>
                  <For each={capsOptions}>{(caps) => <option value={caps} selected={state().draft.caps === caps}>{capsLabel[caps]}</option>}</For>
                </select>
              </label>
              <label>seccompProfile
                <select id="ps-seccomp" disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { seccomp: event.currentTarget.value as Seccomp }, 'seccomp', `seccompProfile is ${event.currentTarget.value} in the draft`))}>
                  <option value="unset" selected={state().draft.seccomp === 'unset'}>unset</option>
                  <option value="RuntimeDefault" selected={state().draft.seccomp === 'RuntimeDefault'}>RuntimeDefault</option>
                  <option value="Unconfined" selected={state().draft.seccomp === 'Unconfined'}>Unconfined</option>
                </select>
              </label>
              <label class="ps-check"><input type="checkbox" id="ps-readonly" checked={state().draft.readOnlyRootFilesystem} disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { readOnlyRootFilesystem: event.currentTarget.checked }, 'readOnlyRootFilesystem', `readOnlyRootFilesystem ${event.currentTarget.checked ? 'is true' : 'is omitted'} in the draft`))} /><span>readOnlyRootFilesystem</span></label>
              <label class="ps-check"><input type="checkbox" id="ps-emptydir" checked={state().draft.emptyDirCache} disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { emptyDirCache: event.currentTarget.checked }, 'emptyDir', `${event.currentTarget.checked ? 'an emptyDir is mounted at /app/cache' : 'the emptyDir is removed'} in the draft`))} /><span>emptyDir at /app/cache</span></label>
            </div>
          </fieldset>

          <fieldset class="ps-group">
            <legend>Image (a property of the image, not of the Pod)</legend>
            <div class="ps-draft-grid">
              <label>Image USER
                <select id="ps-imageuser" disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { imageUser: event.currentTarget.value as ImageUser }, 'imageUser', `the image USER is ${event.currentTarget.value === '0' ? '0 (root)' : '1000'}; the Pod captures it at Apply`))}>
                  <option value="0" selected={state().draft.imageUser === '0'}>0 (root)</option>
                  <option value="1000" selected={state().draft.imageUser === '1000'}>1000</option>
                </select>
              </label>
              <label class="ps-check"><input type="checkbox" id="ps-pullsecret" checked={state().draft.pullSecret} disabled={!hydrated()} onChange={(event) => commit(editDraft(state(), { pullSecret: event.currentTarget.checked }, 'imagePullSecrets', `imagePullSecret registry-creds ${event.currentTarget.checked ? 'is attached' : 'is removed'} in the draft`))} /><span>imagePullSecret registry-creds</span></label>
            </div>
          </fieldset>

          <div class="anatomy-controls ps-actions">
            <button type="button" disabled={!hydrated() || agent() !== undefined} onClick={() => commit(apply(state()))}>Apply Pod</button>
            <button type="button" disabled={!hydrated() || agent()?.pull !== 'pending'} onClick={() => commit(startAgent(state()))}>Start container</button>
            <button type="button" disabled={!hydrated() || agent()?.container !== 'running'} onClick={() => commit(probeCache(state()))}>Write to /app/cache</button>
            <button type="button" disabled={!hydrated() || !agent()} onClick={() => commit(removeAgent(state()), true)}>Delete agent Pod</button>
          </div>

          <ManifestPanel title="Manifest · namespace and Pod draft (model state)" lines={manifest()} note="Highlighted lines are the fields the last interaction read or changed. Settings left out of the Pod appear as comments with the same field." />

          <section class="ps-ledger" aria-label="Pods in namespace sandbox">
            <h3>Pods in namespace sandbox</h3>
            <ul>
              <For each={state().pods}>{(pod) => <li>
                <strong>{pod.name} #{pod.uid}</strong>
                <span>{pod.name === 'legacy-agent' ? 'created before the labels' : 'created by Apply'} · node-a</span>
                <dl class="ps-facts"><For each={specFacts(pod.spec)}>{(fact) => <div><dt>{fact.label}</dt><dd>{fact.value}</dd></div>}</For></dl>
                <StateBadge tone={containerBadge(pod).tone} label={containerBadge(pod).label} />
                <Show when={retestOf(state(), pod.uid)}>{(note) => <p class="ps-note">Warned at enforce {note().level} ({note().fields.join(', ')}); warnings do not evict, so it is {pod.container === 'running' ? 'still Running' : 'not Running'}.</p>}</Show>
              </li>}</For>
            </ul>
            <Show when={agent()}>{(pod) => <p class="ps-note">A changed spec needs a new Pod: delete agent #{pod().uid} and Apply again to get a new UID.</p>}</Show>
          </section>
          <p class="ps-hint">Admission checks the fields a namespace level names. The kubelet checks the UID the container would run as, which depends on the image. Pod names are fixture UIDs: a replacement gets a new one.</p>
        </div>

        <div class="ps-object">
          <div class="ps-dock">
            <ChangeReport change={state().change} />
            <section class="ps-status" aria-label="Agent Pod pipeline">
              <p class="ps-phase"><strong>agent</strong> · {phase()}</p>
              <ul class="ps-badges"><For each={pipeline()}>{(badge) => <li><StateBadge tone={badge.tone} label={badge.label} /></li>}</For></ul>
            </section>
          </div>

          <div class="ps-stage">
            <svg class="iso-svg" viewBox="0 0 760 400" role="img" aria-labelledby="ps-title ps-description">
              <title id="ps-title">Admission tollgate, a registry with a key socket, and a node with two Pod cartridges</title>
              <desc id="ps-description">Three labelled knobs on the tollgate show the level set for enforce, audit and warn; a tall knob is a stricter level. The latch rises only when a Pod was admitted. The request cartridge is dashed while it is only a draft. Tiles on a cartridge light only when the runtime has applied that setting. The image block moves to the tray only after the image is pulled.</desc>
              <g innerHTML={chassis} />
              <g innerHTML={gateArt(state().ns)} />
              <g innerHTML={latchArt(agent() !== undefined)} />
              <g innerHTML={registryArt(shown().pullSecret)} />
              <g ref={(element) => { image.el = element; }} innerHTML={imageArt(shown().imageUser)} />
              <g innerHTML={legacyArt()} />
              <g ref={(element) => { request.el = element; }} class={agent() ? 'ps-pod' : 'ps-draft'} innerHTML={requestArt()} />
              <g innerHTML={zoneLabels} />
            </svg>

            <details class="ps-legend-wrap">
              <summary>Legend: what each part means</summary>
              <ul class="anatomy-legend ps-legend">
                <li>dial = Effective UID</li>
                <li>lock = no_new_privs</li>
                <li>tile (left) = seccomp · tile (right) = privileged</li>
                <li>3 tiles = Capabilities</li>
                <li>shutter = Root filesystem</li>
                <li>Tall knob = stricter level · raised latch = admitted · dashed = draft · lit = applied</li>
              </ul>
            </details>

            <section class="ps-readout" aria-label="Runtime applied to the agent Pod">
              <h3>Runtime applied to agent</h3>
              <dl>
                <For each={readout()}>{(row) => <div>
                  <dt>{row.label} <span class="ps-part">{partOf[row.label] ?? ''}</span></dt>
                  <dd><StateBadge tone={row.applied ? 'pass' : 'wait'} label={row.applied ? `applied · ${row.value}` : row.value} /></dd>
                </div>}</For>
              </dl>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
