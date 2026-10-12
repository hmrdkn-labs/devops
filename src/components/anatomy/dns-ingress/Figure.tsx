import { createSignal, For, onMount, Show } from 'solid-js';
import ChangeReport from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import { iso, type Point3 } from '@/lib/anatomy/vendor/iso-kit';
import * as G from './geometry';
import {
  CHECK_LABEL, CLUSTER_IP, EDGE_ADDRESS, MANIFEST, NDOTS, POD_IP, PODS, SEARCH, STATION,
  candidates, focusFor, initialConfig, positionAt, runExternal, runInCluster, runResolve,
  settingReport, startReport, stateSummary, webEndpoints,
  type CheckId, type Config, type Host, type ManifestKey, type Query, type Report, type Run, type RunKind, type Setting, type Station,
} from './model';
import './figure.css';

const QUERY_OPTIONS: Array<[Query, string]> = [
  ['web', 'web (short name, same namespace)'],
  ['ledger', 'ledger (short name, other namespace)'],
  ['ledger.billing', 'ledger.billing (namespace in the name)'],
  ['ledger.billing.svc.cluster.local.', 'ledger.billing.svc.cluster.local. (absolute)'],
];
const HOST_OPTIONS: Host[] = ['shop.example.com', 'other.example.com'];
/** External checks in the order a real controller reaches them: TLS (SNI) before the Host rule. */
const CHECK_ORDER: CheckId[] = ['public-dns', 'controller', 'tls', 'rule', 'backend', 'endpoint'];
const runners: Record<RunKind, (config: Config) => Run> = { resolve: runResolve, 'in-cluster': runInCluster, external: runExternal };
/** The cord a card passes when it moves from one station to the next. */
const SEGMENT: Record<string, G.SegId> = {
  'drawer>web': 'drawer-web',
  'drawer>billing': 'drawer-billing',
  'web>web-7c9d4-k2xqp': 'web-pod1',
  'web>web-7c9d4-w8mvn': 'web-pod2',
  'outside>gate': 'outside-gate',
  'gate>web': 'gate-web',
};

/** A lamp: a lit disc with a halo when on, a dark ring when off. The title states the state in words too. */
function Lamp(props: { at: Point3; on: boolean; name: string }) {
  const [x, y] = iso(props.at, G.P);
  return <g class="nw-lamp" data-on={props.on ? 'on' : 'off'}>
    <title>{props.name}: {props.on ? 'on' : 'off'}</title>
    <circle class="nw-halo" cx={x} cy={y} r={7} />
    <circle class="nw-core" cx={x} cy={y} r={3.2} />
  </g>;
}

/** Identity label or notch number at its projected anchor; hidden on narrow screens, where the status cards carry the same names. */
function Label(props: { at: Point3; text: string; anchor: 'middle' | 'start' | 'end'; size: number }) {
  const [x, y] = iso(props.at, G.P);
  return <text class="nw-label" x={x} y={y} text-anchor={props.anchor} style={{ 'font-size': `${props.size}px` }}>{props.text}</text>;
}

/** Switchboard for names, Services and an edge gate. Lamps show settings or the last run; the card moves only as far as the run reached. */
export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  onMount(() => setHydrated(true));
  let root: HTMLDivElement | undefined;
  let card: SVGGElement | undefined;
  const segEls: Partial<Record<G.SegId, SVGGElement>> = {};
  const [config, setConfig] = createSignal<Config>({ ...initialConfig, ready: { ...initialConfig.ready } });
  const [run, setRun] = createSignal<Run | null>(null);
  const [dns, setDns] = createSignal<Run | null>(null);
  const [edge, setEdge] = createSignal<Run | null>(null);
  const [note, setNote] = createSignal<Report | null>(null);
  const [focus, setFocus] = createSignal<ManifestKey[]>([]);
  const [busy, setBusy] = createSignal(false);
  let path: Station[] = ['drawer'];
  let progress = 0;
  let target = 0;
  const place = () => {
    const [x, y, z] = positionAt(path, progress);
    card?.setAttribute('transform', G.move(x, y, z));
    for (const id of G.SEG_IDS) segEls[id]?.setAttribute('data-passed', 'false');
    for (let index = 0; index + 1 < path.length && progress >= index + 1; index++) {
      const id = SEGMENT[`${path[index]}>${path[index + 1]}`];
      if (id) segEls[id]?.setAttribute('data-passed', 'true');
    }
  };
  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    progress = reduced ? target : progress + (target - progress) * (1 - Math.exp(-dt / .22));
    if (Math.abs(progress - target) < .01) progress = target;
    place();
    const moving = progress !== target;
    if (!moving && busy()) setBusy(false);
    return moving;
  });

  function press(kind: RunKind) {
    if (busy() || !hydrated()) return;
    const next = runners[kind](config());
    setRun(next);
    if (kind === 'external') setEdge(next);
    else setDns(next);
    setNote(null);
    setFocus(next.focus);
    path = next.stations;
    progress = 0;
    target = path.length - 1;
    place();
    setBusy(true);
    wake();
  }
  function change(next: Config, what: Setting) {
    if (busy() || !hydrated()) return;
    setConfig(next);
    setRun(null);
    setDns(null);
    setEdge(null);
    setNote(settingReport(what, next));
    setFocus(focusFor(what));
    path = ['drawer'];
    progress = 0;
    target = 0;
    place();
  }
  function reset() {
    if (busy() || !hydrated()) return;
    setConfig({ ...initialConfig, ready: { ...initialConfig.ready } });
    setRun(null);
    setDns(null);
    setEdge(null);
    setNote(null);
    setFocus([]);
    path = ['drawer'];
    progress = 0;
    target = 0;
    place();
  }

  const outcome = () => run()?.outcome ?? 'idle';
  /** Where the ✕ sits: above the station where the card rests after a stopped run. */
  const stopMark = (): [number, number] => {
    const station = run()?.stations.at(-1);
    if (!station) return [0, 0];
    const [x, y, z] = STATION[station];
    return iso([x, y, z + 14], G.P);
  };
  const answeredAt = () => {
    const resolution = dns()?.resolution;
    return resolution?.answer ? resolution.tried.length - 1 : -1;
  };
  const dnsTone = (): { tone: BadgeTone; label: string } => {
    const resolution = dns()?.resolution;
    if (!resolution) return { tone: 'info', label: 'Not run' };
    return resolution.answer ? { tone: 'pass', label: `Answered by ${resolution.answer}` } : { tone: 'fail', label: 'No answer' };
  };
  const dnsRows = () => {
    const tried = dns()?.resolution?.tried ?? [];
    return candidates(config().query).map((name, index) => {
      const attempt = tried[index];
      if (!attempt) return { name, tone: 'info' as BadgeTone, label: dns() ? 'not tried: answer found earlier' : 'not tried yet' };
      return attempt.service
        ? { name, tone: 'pass' as BadgeTone, label: `answer ${CLUSTER_IP[attempt.service]}` }
        : { name, tone: 'fail' as BadgeTone, label: 'no record' };
    });
  };
  const edgeRows = () => {
    const checks = edge()?.checks ?? [];
    return CHECK_ORDER.map((id) => {
      const check = checks.find((item) => item.id === id);
      if (!check) return { id, label: CHECK_LABEL[id], tone: 'info' as BadgeTone, state: 'not run yet', detail: '' };
      if (check.state === 'not-run') return { id, label: check.label, tone: 'info' as BadgeTone, state: 'not reached', detail: '' };
      const pass = check.state === 'pass';
      return { id, label: check.label, tone: (pass ? 'pass' : 'fail') as BadgeTone, state: pass ? 'passed' : 'failed', detail: check.detail };
    });
  };

  return <div ref={root} class="anatomy-figure nw-figure" aria-label="Name lookup, Service endpoints and edge routing controls" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Networking · DNS and ingress</span><span>A name is not a Ready Pod</span></div>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <svg class="iso-svg nw-svg" viewBox={`0 0 ${G.WIDTH} ${G.HEIGHT}`} role="img" aria-labelledby="nw-title nw-desc" data-run-outcome={outcome()} data-run-stop={run()?.stations.at(-1) ?? 'none'}>
      <title id="nw-title">Switchboard for names, Services and an edge gate</title>
      <desc id="nw-desc">A drawer of four name candidates at the rear left, Service web and the billing Service in the centre, a bin per Pod at the right and an edge gate at the front. Lamps are lit for present or Ready state. The request card rests where its run stopped; cords it passed are lit.</desc>
      <g innerHTML={G.base} />
      <g innerHTML={G.outside} />
      <g innerHTML={G.drawer} />
      <g innerHTML={G.billing} />
      <g innerHTML={G.gate} />
      <g innerHTML={G.web} />
      <g innerHTML={G.bins} />
      <For each={G.SEG_IDS}>{(id) => <g innerHTML={G.cordBase[id]} />}</For>
      <For each={G.SEG_IDS}>{(id) => <g class="nw-seg" data-seg={id} data-passed="false" ref={(el) => { segEls[id] = el; }} innerHTML={G.cordLit[id]} />}</For>
      <Lamp at={G.LAMP.dns} on={config().publicDns} name="Public DNS record for the host" />
      <For each={G.LAMP.notches}>{(point, index) => <Lamp at={point} on={answeredAt() === index()} name={`Candidate ${index() + 1} answered`} />}</For>
      <Lamp at={G.LAMP.serviceWeb} on={config().webService} name="Service web exists in shop" />
      <For each={G.LAMP.jacks}>{(point, index) => <Lamp at={point} on={config().ready[PODS[index()]]} name={`${PODS[index()]} Ready`} />}</For>
      <For each={G.LAMP.bins}>{(point, index) => <Lamp at={point} on={config().ready[PODS[index()]]} name={`${PODS[index()]} Ready`} />}</For>
      <Lamp at={G.LAMP.gate[0]!} on={config().controller} name="Edge controller running" />
      <Lamp at={G.LAMP.gate[1]!} on={config().ingress && config().host === 'shop.example.com'} name="Ingress rule exists for the requested host" />
      <Lamp at={G.LAMP.gate[2]!} on={config().tlsSecret} name="Secret shop-tls present" />
      <g class="nw-token" ref={(el) => { card = el; }} transform={G.move(...STATION.drawer)} innerHTML={G.token} />
      <Show when={outcome() === 'stopped' && !busy()}>
        <g class="nw-stop" transform={`translate(${stopMark()[0]} ${stopMark()[1]})`}><path d="M-6 -6 L6 6 M6 -6 L-6 6" /></g>
      </Show>
      <For each={G.CAPTIONS}>{(caption) => <Label at={caption.at} text={caption.text} anchor={caption.anchor} size={caption.size} />}</For>
      <For each={G.NUMBERS}>{(number) => <Label at={number.at} text={number.text} anchor={number.anchor} size={number.size} />}</For>
    </svg>
    <p class="anatomy-readout" data-readout>{stateSummary(config())}</p>
    <section class="nw-candidates" aria-label="Client lookup candidates from the last lookup">
      <h3 class="anatomy-panel-heading">Client lookup candidates (drawer notches)</h3>
      <ol class="anatomy-status-list nw-steps">
        <For each={dnsRows()}>{(row) => <li><code>{row.name}</code><StateBadge tone={row.tone} label={row.label} /></li>}</For>
      </ol>
    </section>
    <div class="anatomy-controls nw-controls">
      <fieldset class="nw-group">
        <legend>Name lookup from the client Pod in shop</legend>
        <label>Name the client asks for
          <select value={config().query} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), query: e.currentTarget.value as Query }, 'query')}>
            <For each={QUERY_OPTIONS}>{([id, text]) => <option value={id} selected={config().query === id}>{text}</option>}</For>
          </select>
        </label>
        <label><input type="checkbox" checked={config().webService} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), webService: e.currentTarget.checked }, 'webService')} />Service web exists in shop</label>
      </fieldset>
      <fieldset class="nw-group">
        <legend>Pods behind Service web</legend>
        <For each={PODS}>{(pod) => <label><input type="checkbox" checked={config().ready[pod]} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), ready: { ...config().ready, [pod]: e.currentTarget.checked } }, pod)} />{pod} Ready</label>}</For>
      </fieldset>
      <fieldset class="nw-group">
        <legend>Edge for an external request</legend>
        <label>Requested host
          <select value={config().host} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), host: e.currentTarget.value as Host }, 'host')}>
            <For each={HOST_OPTIONS}>{(host) => <option value={host} selected={config().host === host}>{host}</option>}</For>
          </select>
        </label>
        <label><input type="checkbox" checked={config().publicDns} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), publicDns: e.currentTarget.checked }, 'publicDns')} />Public DNS points the host at {EDGE_ADDRESS}</label>
        <label><input type="checkbox" checked={config().controller} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), controller: e.currentTarget.checked }, 'controller')} />Edge controller running for class edge-proxy</label>
        <label><input type="checkbox" checked={config().ingress} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), ingress: e.currentTarget.checked }, 'ingress')} />Ingress shop applied (shop.example.com / to web:80)</label>
        <label><input type="checkbox" checked={config().tlsSecret} disabled={!hydrated() || busy()} onChange={(e) => change({ ...config(), tlsSecret: e.currentTarget.checked }, 'tlsSecret')} />Secret shop-tls present</label>
      </fieldset>
    </div>
    </div>

    <div class="anatomy-bench-panel">
    <div class="anatomy-controls nw-actions">
      <button type="button" data-anatomy-primary disabled={!hydrated() || busy()} onClick={() => press('resolve')}>Resolve name from client Pod</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={() => press('in-cluster')}>Send in-cluster request</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={() => press('external')}>Send external HTTP request</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={reset}>Reset</button>
    </div>

    <ChangeReport change={run()?.report ?? note() ?? startReport()} busy={busy()} />

    <div class="anatomy-status-columns nw-status-columns" data-anatomy-status>
      <section>
        <h3 class="anatomy-panel-heading">Objects</h3>
        <ul class="anatomy-status-list nw-status" aria-label="Per-object state">
          <li data-object="client-resolver">
            <strong>Client Pod resolver · shop</strong>
            <StateBadge tone={dnsTone().tone} label={dnsTone().label} />
            <span class="anatomy-status-detail">search {SEARCH.join(' ')} · ndots:{NDOTS}</span>
          </li>
          <li data-object="service-web">
            <strong>Service web · shop</strong>
            <StateBadge tone={config().webService ? 'pass' : 'fail'} label={config().webService ? 'Service exists' : 'Service absent'} />
            <span class="anatomy-status-detail">ClusterIP {CLUSTER_IP.web}:80 → targetPort 8080 · ready endpoints {webEndpoints(config()).length} of {PODS.length}</span>
          </li>
          <For each={PODS}>{(pod) => <li data-object={pod}>
            <strong>{pod}</strong>
            <StateBadge tone={config().ready[pod] ? 'pass' : 'wait'} label={config().ready[pod] ? 'Ready' : 'Not Ready: no traffic'} />
            <span class="anatomy-status-detail">{POD_IP[pod]} · app: web</span>
          </li>}</For>
          <li data-object="service-ledger">
            <strong>Service ledger · billing</strong>
            <StateBadge tone="info" label="Name only" />
            <span class="anatomy-status-detail">ClusterIP {CLUSTER_IP.ledger}:80 · no Pods drawn</span>
          </li>
          <li data-object="edge">
            <strong>Edge · edge-proxy class</strong>
            <ul class="nw-edge-facts">
              <li><span>Public DNS</span><StateBadge tone={config().publicDns ? 'pass' : 'fail'} label={config().publicDns ? 'Record' : 'No record'} /></li>
              <li><span>Controller</span><StateBadge tone={config().controller ? 'pass' : 'fail'} label={config().controller ? 'Running' : 'Not running'} /></li>
              <li><span>Ingress shop</span><StateBadge tone={config().ingress ? 'pass' : 'fail'} label={config().ingress ? 'Applied' : 'Absent'} /></li>
              <li><span>Secret shop-tls</span><StateBadge tone={config().tlsSecret ? 'pass' : 'fail'} label={config().tlsSecret ? 'Present' : 'Absent'} /></li>
            </ul>
          </li>
        </ul>
      </section>

      <section class="nw-ledger" aria-label="Checks from the last runs">
        <h3 class="anatomy-panel-heading">Edge request checks</h3>
        <ol class="anatomy-status-list nw-steps">
          <For each={edgeRows()}>{(row) => <li><span>{row.label}</span><StateBadge tone={row.tone} label={row.state} />
            <Show when={row.detail}><span class="anatomy-status-detail">{row.detail}</span></Show></li>}</For>
        </ol>
      </section>
    </div>
    </div>
    </div>

    <ul class="anatomy-legend nw-legend">
      <li>Rear left: resolver drawer; notches 1–4 are the candidates in the order tried; lit = the one that answered</li>
      <li>Centre: Service web (jacks: lit = Ready) and the billing Service for ledger</li>
      <li>Right: one bin per Pod; lit lamp = Ready</li>
      <li>Front: edge gate with three lamps: controller · rule (an Ingress rule exists for the requested host) · TLS (Secret shop-tls present)</li>
      <li>Accent card: the request; lit cords are the links it passed; ✕ = where it stopped</li>
    </ul>
    <ManifestPanel title="Service and Ingress YAML the figure reads" lines={MANIFEST.map((line) => ({ text: line.text, highlight: line.key !== undefined && focus().includes(line.key) }))} note="Highlighted fields are the ones the last run or setting depends on." />
    <p class="nw-caption">Fixture: an original teaching model, not a live cluster. Stations are teaching positions, not network hops; each run moves the card only as far as its checks allowed. {EDGE_ADDRESS} and the 10.x addresses are fixture values.</p>
  </div>;
}
