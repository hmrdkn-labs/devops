import { createMemo, createSignal, For, onMount } from 'solid-js';
import ChangeReport, { type Change } from '@/components/anatomy/shared/ChangeReport';
import ManifestPanel, { type ManifestLine } from '@/components/anatomy/shared/ManifestPanel';
import StateBadge, { type BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { createAnatomyMotion } from '@/lib/anatomy/motion';
import * as k from '@/lib/anatomy/vendor/iso-kit';
import {
  BAY, GATE_X, H, LANE_Y, LIFT, P, START, STOP, TANK, W, base, blade, cartridge, gate, lane, move, platform, tankFill, tankRing, tankShell, tray,
} from './geometry';
import {
  evictionThreshold, fmt, initialConfig, limitRange, loadDemand, memPodsOf, node, policyYaml, podName, podYaml, profiles, qosOf,
  quotaHard, relieve, residents, runLoad, submit,
  type Config, type Profile, type Relief, type Resource, type Runtime, type Spec, type Submission,
} from './model';
import './figure.css';

type CartId = 'candidate' | 'checkout-7f9c' | 'search-5d6b' | 'batch-report-x';
type ResidentId = Exclude<CartId, 'candidate'>;
type GateId = 'limitrange' | 'quota' | 'fit';
type Badge = { tone: BadgeTone; label: string };
type Pos = { x: number; y: number; tx: number; ty: number };
type Edit = 'profile' | 'limitrange' | 'quota' | 'search' | 'load';

const CART_IDS: CartId[] = ['candidate', 'checkout-7f9c', 'search-5d6b', 'batch-report-x'];
const RESIDENT_IDS: ResidentId[] = ['checkout-7f9c', 'search-5d6b', 'batch-report-x'];
const GATE_IDS: GateId[] = ['limitrange', 'quota', 'fit'];
const RESIDENT_BAY = { 'checkout-7f9c': BAY.checkout, 'search-5d6b': BAY.search, 'batch-report-x': BAY.batch } as const;
const groups = [['basic', 'Requests and limits'], ['edge', 'Edge cases']] as const;
const RESIDENT_SPEC = Object.fromEntries(residents('within').map((pod): [string, Spec] => [pod.name, pod.spec])) as Record<ResidentId, Spec>;

/** Tray slot for the nth evicted cartridge: three in a row, a fourth on the second row. */
const traySlot = (index: number) => ({ x: -124 + (index % 3) * 32, y: index < 3 ? 72 : 94 });

/** Screen position as a percent of the canvas, for HTML labels that sit beside world-space objects. */
function screenAt(x: number, y: number, z: number) {
  const [sx, sy] = k.iso([x, y, z], P);
  return { left: `${(sx / W) * 100}%`, top: `${(sy / H) * 100}%` };
}

const quantityNote = (r: Resource, value: number | undefined) => (value === undefined ? 'none' : fmt(r, value));

const initialChange: Change = {
  title: 'Draft api-canary-1 ready. Press Submit Pod to run admission.',
  changed: 'No Pod object exists yet, so nothing has been evaluated.',
  actor: 'Workload author (draft, not sent)',
  reason: 'Admission, scheduling and the kubelet act only after a Pod is submitted.',
  notYet: 'No admission, scheduling, QoS or runtime check has run.',
};

function resetChange(name: string): Change {
  return {
    title: `Reset: node-a back to its fixture state; draft ${name}`,
    changed: 'Residents are restored and the candidate is removed. The next draft takes the next Pod name.',
    actor: 'Learner (page reset)',
    reason: 'A new Pod is a new object with a new name; the old one is not reused.',
    notYet: 'Nothing has run against the new draft.',
  };
}

function editChange(edit: Edit, config: Config, name: string, cleared: boolean): Change {
  const cleanup = cleared ? ' The rejected attempt is cleared.' : '';
  if (edit === 'profile') return {
    title: `Draft changed to ${profiles[config.profile].label}`,
    changed: `The author spec of ${name} is now the draft. No Pod object exists yet.${cleanup}`,
    actor: 'Workload author (draft only, not sent)',
    reason: 'Requests and limits belong to the Pod spec, so the draft is evaluated only when you press Submit Pod.',
    notYet: 'No admission, scheduling, QoS or runtime check has run for this spec.',
  };
  if (edit === 'limitrange') return {
    title: config.limitRange ? 'LimitRange shop-defaults switched on' : 'LimitRange shop-defaults switched off',
    changed: config.limitRange ? 'Namespace shop has a LimitRange: defaults for omitted fields and a max of 1Gi memory.' : 'Namespace shop has no LimitRange, so no defaults are filled and no max applies.',
    actor: 'Namespace administrator (policy object)',
    reason: 'LimitRange acts when a Pod is created. The next Submit uses this policy.',
    notYet: 'Pods already on node-a are not re-checked. The rule applies only to Pods created after this change.',
  };
  if (edit === 'quota') return {
    title: config.quota ? 'ResourceQuota shop-quota switched on' : 'ResourceQuota shop-quota switched off',
    changed: config.quota ? 'Namespace shop caps requests at 1000m CPU and 1024Mi memory across its non-terminal Pods.' : 'Namespace shop has no ResourceQuota, so no aggregate request cap applies.',
    actor: 'Namespace administrator (policy object)',
    reason: 'ResourceQuota counts requests when a Pod is created. It does not cap usage.',
    notYet: 'The quota never rejects an existing Pod. It applies at the next Submit.',
  };
  if (edit === 'search') return {
    title: `search-5d6b memory use is now ${config.searchUse === 'above' ? '600Mi' : '200Mi'}`,
    changed: config.searchUse === 'above' ? 'The resident Pod uses 600Mi, which is 344Mi above its 256Mi request.' : 'The resident Pod uses 200Mi, within its 256Mi request.',
    actor: 'Resident workload (outside this draft; the fixture sets its usage)',
    reason: 'Eviction ranks Pods by usage above their requests, so this changes the eviction order.',
    notYet: 'Nothing is evicted until you press Apply node memory pressure. Any earlier pressure check no longer applies.',
  };
  return {
    title: `Load set to ${config.load}`,
    changed: `The candidate's demand becomes ${config.load === 'spike' ? '900m CPU and 900Mi memory' : config.load === 'busy' ? '400m CPU and 384Mi memory' : '100m CPU and 128Mi memory'} when you press Run load.`,
    actor: 'Learner (the demand is set by the workload)',
    reason: 'The kernel enforces limits against actual use, so the demand decides what happens at runtime.',
    notYet: 'Nothing has run. Press Run load to apply it.',
  };
}

function submitChange(s: Submission, name: string): Change {
  const { limitRange: lr, quota: q } = s.admission;
  const filled = s.admission.provenance.filter((p) => p.origin !== 'author');
  const copied = filled.some((p) => p.origin === 'API default');
  const defaultNote = filled.length
    ? ` Filled: ${filled.map((p) => `${p.field} (${p.origin === 'API default' ? 'copied from its limit' : 'LimitRange default'})`).join(', ')}.${copied ? ' The copy order is noted under Assumptions in the explanation.' : ''}`
    : '';
  if (s.phase === 'rejected') {
    const who = !lr.pass && !q.pass ? 'LimitRanger and ResourceQuota admission (namespace shop)'
      : !lr.pass ? 'LimitRanger admission (namespace shop)' : 'ResourceQuota admission (namespace shop)';
    return {
      title: `${name} rejected at admission`,
      changed: 'No Pod object was created, so the scheduler never saw it.',
      actor: who,
      reason: [...lr.violations, q.reason].filter(Boolean).join('; '),
      notYet: `No node was chosen and nothing started. The name stays ${name}, because nothing was created.`,
    };
  }
  if (s.phase === 'pending' && s.fit?.short) {
    const short = s.fit.short;
    return {
      title: `${name} Pending: no node-a fit`,
      changed: 'The Pod object exists with no nodeName.',
      actor: 'kube-scheduler (filters on requests only)',
      reason: `${short} request ${fmt(short, s.admission.effective.requests[short] ?? 0)} is more than the ${fmt(short, s.fit.free[short])} free on node-a.${defaultNote}`,
      notYet: 'Not bound and not started. The scheduler ignores limits, and no container exists.',
    };
  }
  return {
    title: `${name} Running on node-a`,
    changed: `nodeName is node-a; container started; qosClass ${s.qos}.`,
    actor: 'kube-scheduler binds; kubelet starts the container',
    reason: `Requests fit node-a's free space.${defaultNote}`,
    notYet: 'Limits are not exercised until you press Run load.',
  };
}

function loadChange(name: string, spec: Spec, rt: Runtime): Change {
  const demand = loadDemand[rt.load];
  const limitMem = spec.limits.memory;
  const limitCpu = spec.limits.cpu;
  const cpuNote = rt.throttled && limitCpu !== undefined ? `; CPU ${fmt('cpu', demand.cpu)} capped at ${fmt('cpu', limitCpu)}` : '';
  if (rt.oomKilled && limitMem !== undefined) return {
    title: `${name} OOMKilled; restartCount ${rt.restarts}`,
    changed: `Memory ${fmt('memory', demand.memory)} exceeded the ${fmt('memory', limitMem)} limit. The container was killed and restarted in the same Pod${cpuNote}.`,
    actor: 'Kernel cgroup OOM for the container; the kubelet restarts it (restartPolicy defaults to Always)',
    reason: `The memory limit is ${fmt('memory', limitMem)} and usage is ${fmt('memory', demand.memory)}. The request does not raise the limit.`,
    notYet: 'Pod name, UID and node are unchanged. The fixture kills at once, while the kernel may kill later under pressure. CrashLoopBackOff is not modelled.',
  };
  if (rt.throttled && limitCpu !== undefined) return {
    title: `${name} CPU throttled to ${fmt('cpu', limitCpu)}`,
    changed: `CPU demand ${fmt('cpu', demand.cpu)} is capped at the limit. No restart happened.`,
    actor: 'Kernel CPU throttling (the cgroup CPU limit)',
    reason: `The CPU limit ${fmt('cpu', limitCpu)} is below the demand of ${fmt('cpu', demand.cpu)}.`,
    notYet: 'The work runs slower. The container is not killed for CPU use, and the Pod keeps its name.',
  };
  if (limitCpu === undefined && limitMem === undefined) return {
    title: `${name} runs at ${fmt('cpu', demand.cpu)} CPU and ${fmt('memory', demand.memory)} memory`,
    changed: 'No limit applies, so nothing is throttled or killed by a limit.',
    actor: 'Kubelet (no limit in the spec)',
    reason: 'Only the request reserves space for scheduling; the kernel has no ceiling to enforce.',
    notYet: 'Node-level pressure can still evict this Pod. See Apply node memory pressure.',
  };
  return {
    title: `${name} within its limits`,
    changed: 'No throttle and no OOM kill.',
    actor: 'Kernel (cgroup limits)',
    reason: `Demand ${fmt('cpu', demand.cpu)} and ${fmt('memory', demand.memory)} is within the limits.`,
    notYet: 'Within limits says nothing about node memory pressure, which is checked separately.',
  };
}

function pressureChange(relief: Relief, used: number): Change {
  if (!relief.pressure) return {
    title: `No eviction: ${relief.available}Mi available is at or above the ${evictionThreshold}Mi line`,
    changed: 'No Pod was evicted. The tank stays under the eviction ring.',
    actor: 'Kubelet memory check on node-a',
    reason: `Allocatable ${node.memory}Mi minus Pods' memory use ${used}Mi leaves ${relief.available}Mi.`,
    notYet: 'The check runs only when you press. Usage can still rise, and a later press checks again.',
  };
  const first = relief.ranking.find((row) => row.name === relief.evicted[0]);
  const why = first?.exceeds
    ? `${first.name} (${first.qos}) uses ${first.use}Mi, which is ${first.excess}Mi above its ${first.request}Mi request`
    : `${first?.name ?? 'none'} is ranked first`;
  return {
    title: `Evicted ${relief.evicted.join(', ')}`,
    changed: `Available memory was ${relief.available}Mi, below ${evictionThreshold}Mi. Evicted Pods are set to Failed; ${relief.availableAfter}Mi is free afterwards.`,
    actor: 'Kubelet node-pressure eviction',
    reason: `${why}. Eviction ranks by usage above request, then priority. The QoS class is not an input.`,
    notYet: 'No replacement Pod was created. These are bare Pods with no controller, and the fixture does not model controllers.',
  };
}

export default function Figure() {
  const [hydrated, setHydrated] = createSignal(false);
  const [config, setConfig] = createSignal<Config>({ ...initialConfig });
  const [serial, setSerial] = createSignal(1);
  const [submission, setSubmission] = createSignal<Submission | null>(null);
  const [runtime, setRuntime] = createSignal<Runtime | null>(null);
  const [evicted, setEvicted] = createSignal<string[]>([]);
  const [relief, setRelief] = createSignal<Relief | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [marks, setMarks] = createSignal<string[]>([]);
  const [change, setChange] = createSignal<Change>(initialChange);

  let root: HTMLDivElement | undefined;
  const carts: Partial<Record<CartId, SVGGElement>> = {};
  const blades: Partial<Record<GateId, SVGGElement>> = {};
  const tags: Partial<Record<CartId, HTMLSpanElement>> = {};
  const pos: Record<CartId, Pos> = {
    candidate: { x: START.x, y: START.y, tx: START.x, ty: START.y },
    'checkout-7f9c': { x: BAY.checkout.x, y: BAY.checkout.y, tx: BAY.checkout.x, ty: BAY.checkout.y },
    'search-5d6b': { x: BAY.search.x, y: BAY.search.y, tx: BAY.search.x, ty: BAY.search.y },
    'batch-report-x': { x: BAY.batch.x, y: BAY.batch.y, tx: BAY.batch.x, ty: BAY.batch.y },
  };
  const lift: Record<GateId, { at: number; target: number }> = {
    limitrange: { at: 0, target: 0 }, quota: { at: 0, target: 0 }, fit: { at: 0, target: 0 },
  };

  const podExists = () => submission() !== null && submission()!.phase !== 'rejected';
  const candidateName = () => podName(serial());
  const candidateRunning = () => submission()?.phase === 'running' && !evicted().includes(candidateName());
  const lrOn = () => submission()?.admission.limitRange.active ?? config().limitRange;
  const quotaOn = () => submission()?.admission.quota.active ?? config().quota;
  const gateOff = (g: GateId) => (g === 'limitrange' ? !lrOn() : g === 'quota' ? !quotaOn() : false);

  const memPods = createMemo(() => memPodsOf(config(), serial(), submission(), runtime(), new Set(evicted())));
  const usedMem = createMemo(() => memPods().reduce((sum, pod) => sum + pod.use, 0));
  const fillHeight = createMemo(() => Math.min(TANK.height, (usedMem() / node.memory) * TANK.height));
  const ringZ = 3 + ((node.memory - evictionThreshold) / node.memory) * TANK.height;

  /** Cartridge and blade targets follow from state, so a later edit never pulls an evicted Pod back. */
  function syncTargets() {
    const order = evicted();
    for (const id of RESIDENT_IDS) {
      const index = order.indexOf(id);
      const target = index < 0 ? RESIDENT_BAY[id] : traySlot(index);
      pos[id].tx = target.x;
      pos[id].ty = target.y;
    }
    const index = order.indexOf(candidateName());
    const s = submission();
    const target = index >= 0 ? traySlot(index) : s ? { x: STOP[s.stop], y: LANE_Y } : START;
    pos.candidate.tx = target.x;
    pos.candidate.ty = target.y;
  }

  function placeTags() {
    for (const id of CART_IDS) {
      const tag = tags[id];
      if (!tag) continue;
      const [sx, sy] = k.iso([pos[id].x, pos[id].y, 24], P);
      tag.style.left = `${(sx / W) * 100}%`;
      tag.style.top = `${(sy / H) * 100}%`;
    }
  }

  const wake = createAnatomyMotion(() => root, (dt, reduced) => {
    const follow = (at: number, target: number) => {
      const next = reduced ? target : at + (target - at) * (1 - Math.exp(-dt / .18));
      return Math.abs(next - target) < .025 ? target : next;
    };
    let moving = false;
    for (const id of CART_IDS) {
      const p = pos[id];
      p.x = follow(p.x, p.tx);
      p.y = follow(p.y, p.ty);
      if (p.x !== p.tx || p.y !== p.ty) moving = true;
      carts[id]?.setAttribute('transform', move(p.x, p.y, 3));
    }
    for (const g of GATE_IDS) {
      const l = lift[g];
      l.at = follow(l.at, l.target);
      if (l.at !== l.target) moving = true;
      blades[g]?.setAttribute('transform', move(0, 0, l.at));
    }
    placeTags();
    if (!moving && busy()) setBusy(false);
    return moving;
  });

  function setLifts(targets: Record<GateId, number>) {
    for (const g of GATE_IDS) lift[g].target = targets[g];
  }

  function changeConfig(next: Config, edit: Edit) {
    if (busy()) return;
    const rejectedAttempt = submission() !== null && !podExists();
    const keepPod = podExists();
    setConfig(next);
    if (!keepPod) {
      setSubmission(null);
      setRuntime(null);
      setLifts({ limitrange: 0, quota: 0, fit: 0 });
    }
    setRelief(null);
    syncTargets();
    setBusy(true);
    wake();
    setMarks([]);
    setChange(editChange(edit, next, candidateName(), rejectedAttempt));
  }

  function submitPod() {
    if (busy() || podExists()) return;
    const s = submit(config(), new Set(evicted()));
    setSubmission(s);
    setRelief(null);
    setRuntime(s.phase === 'running' ? runLoad(s.admission.effective, 'idle', 0) : null);
    setLifts({
      limitrange: config().limitRange && s.admission.limitRange.pass ? LIFT : 0,
      quota: config().quota && s.admission.quota.pass ? LIFT : 0,
      fit: s.fit?.pass ? LIFT : 0,
    });
    syncTargets();
    setBusy(true);
    wake();
    setMarks([
      ...s.admission.provenance.map((p) => p.field),
      ...(config().limitRange ? ['lr.max.cpu', 'lr.max.memory'] : []),
      ...(config().quota ? ['quota.cpu', 'quota.memory'] : []),
      'requests.cpu', 'requests.memory',
    ]);
    setChange(submitChange(s, candidateName()));
  }

  function runCandidate() {
    const s = submission();
    if (busy() || !s || !candidateRunning()) return;
    const rt = runLoad(s.admission.effective, config().load, runtime()?.restarts ?? 0);
    setRuntime(rt);
    setRelief(null);
    setBusy(true);
    wake();
    setMarks(['limits.cpu', 'limits.memory', 'status.restarts', 'status.reason']);
    setChange(loadChange(candidateName(), s.admission.effective, rt));
  }

  function checkPressure() {
    if (busy()) return;
    const pods = memPods();
    const used = pods.reduce((sum, pod) => sum + pod.use, 0);
    const result = relieve(pods);
    setRelief(result);
    if (result.evicted.length > 0) setEvicted([...evicted(), ...result.evicted]);
    syncTargets();
    setBusy(true);
    wake();
    setMarks(['requests.memory', 'status.phase', 'status.reason']);
    setChange(pressureChange(result, used));
  }

  function resetAll() {
    if (busy()) return;
    const nextSerial = serial() + 1;
    setConfig({ ...initialConfig });
    setSerial(nextSerial);
    setSubmission(null);
    setRuntime(null);
    setEvicted([]);
    setRelief(null);
    setLifts({ limitrange: 0, quota: 0, fit: 0 });
    syncTargets();
    setBusy(true);
    wake();
    setMarks([]);
    setChange(resetChange(podName(nextSerial)));
  }

  onMount(() => {
    setHydrated(true);
    syncTargets();
    placeTags();
  });

  /** Every Pod that was on node-a, including evicted ones (Failed), with the fields the ledger and cards show. */
  const ledger = createMemo(() => {
    const rows: Array<{ name: string; qos: string; reqCpu: number; reqMem: number; use: number; state: string }> = RESIDENT_IDS.map((id) => {
      const spec = RESIDENT_SPEC[id];
      const usage = residents(config().searchUse).find((pod) => pod.name === id)!.usage.memory;
      return {
        name: id, qos: qosOf(spec), reqCpu: spec.requests.cpu ?? 0, reqMem: spec.requests.memory ?? 0,
        use: usage, state: evicted().includes(id) ? 'Failed (Evicted)' : 'Running',
      };
    });
    const s = submission();
    if (s !== null && s.phase === 'running') {
      const evictedCandidate = evicted().includes(candidateName());
      rows.push({
        name: candidateName(), qos: s.qos, reqCpu: s.admission.effective.requests.cpu ?? 0, reqMem: s.admission.effective.requests.memory ?? 0,
        use: runtime()?.memoryUse ?? 0, state: evictedCandidate ? 'Failed (Evicted)' : 'Running',
      });
    }
    return rows;
  });

  const committed = createMemo(() => {
    const totals = { cpu: 0, memory: 0 };
    for (const row of ledger()) {
      if (row.state !== 'Running') continue;
      totals.cpu += row.reqCpu;
      totals.memory += row.reqMem;
    }
    return totals;
  });

  /** The quota counts non-terminal Pods: running residents, a running or pending candidate. Evicted (Failed) Pods do not count. */
  const quotaUsed = createMemo(() => {
    const totals = { cpu: committed().cpu, memory: committed().memory };
    const s = submission();
    if (s !== null && s.phase === 'pending') {
      totals.cpu += s.admission.effective.requests.cpu ?? 0;
      totals.memory += s.admission.effective.requests.memory ?? 0;
    }
    return totals;
  });
  const runningCount = () => ledger().filter((row) => row.state === 'Running').length;
  const rankOf = (name: string) => relief()?.ranking.find((row) => row.name === name)?.rank;

  const nodeLines = createMemo<ManifestLine[]>(() => policyYaml(config()).map((line) => ({
    text: line.text, highlight: !!line.id && marks().includes(line.id),
  })));
  const podLines = createMemo<ManifestLine[]>(() => podYaml(config(), serial(), submission(), runtime(), runtime()?.restarts ?? 0, evicted().includes(candidateName())).map((line) => ({
    text: line.text, highlight: !!line.id && marks().includes(line.id),
  })));

  const badges = (): Record<'lr' | 'quota' | 'fit' | 'pod' | 'runtime' | 'pressure', Badge> => {
    const s = submission();
    const current = runtime();
    const pressure = relief();
    return {
      lr: !lrOn() ? { tone: 'info', label: 'LimitRange off: no check' }
        : !s ? { tone: 'wait', label: 'LimitRange: not run' }
          : s.admission.limitRange.pass ? { tone: 'pass', label: 'LimitRange admits' } : { tone: 'fail', label: 'LimitRange rejects: above max' },
      quota: !quotaOn() ? { tone: 'info', label: 'ResourceQuota off: no check' }
        : !s ? { tone: 'wait', label: 'quota: not run' }
          : s.admission.quota.pass ? { tone: 'pass', label: 'quota admits' } : { tone: 'fail', label: 'quota rejects' },
      fit: !s ? { tone: 'wait', label: 'fit: not run' }
        : s.fit === null ? { tone: 'info', label: 'fit: not reached (no Pod)' }
          : s.fit.pass ? { tone: 'pass', label: `fits node-a (${fmt('cpu', s.fit.free.cpu)} CPU free)` }
            : { tone: 'fail', label: `Insufficient ${s.fit.short}` },
      pod: !s ? { tone: 'wait', label: 'no Pod object yet' }
        : s.phase === 'rejected' ? { tone: 'fail', label: 'rejected: no Pod object' }
          : s.phase === 'pending' ? { tone: 'info', label: 'Pending · no nodeName' }
            : evicted().includes(candidateName()) ? { tone: 'fail', label: 'Failed · Evicted' }
              : { tone: 'selected', label: 'Running on node-a' },
      runtime: evicted().includes(candidateName()) ? { tone: 'fail', label: 'stopped: evicted' }
        : !current ? { tone: 'wait', label: candidateRunning() ? 'load: not run' : 'no running load' }
          : current.oomKilled ? { tone: 'fail', label: `OOMKilled · restarts ${current.restarts}` }
            : current.throttled ? { tone: 'info', label: `CPU throttled to ${fmt('cpu', current.cpuUse)}` }
              : { tone: 'pass', label: 'within limits' },
      pressure: !pressure ? { tone: 'wait', label: 'pressure check: not run' }
        : pressure.pressure ? { tone: 'fail', label: `evicted ${pressure.evicted.length}` }
          : { tone: 'pass', label: 'no eviction needed' },
    };
  };

  /** Object tags carry identity only. QoS, state and numbers live in the cards and the ledger. */
  const tagText = (id: CartId): string => {
    const s = submission();
    if (id !== 'candidate') return id;
    if (!s) return `${candidateName()} draft`;
    if (s.phase === 'rejected') return `${candidateName()} not created`;
    if (evicted().includes(candidateName())) return `${candidateName()} Failed`;
    return candidateName();
  };

  return <div ref={root} class="anatomy-figure rl-figure" aria-label="Requests, limits and QoS inspection" aria-busy={!hydrated()}>
    <div class="anatomy-figure-header"><span>Fig 07 · Workloads</span><span>Requests reserve; limits enforce</span></div>
    <p class="rl-purpose"><strong>Goal:</strong> a container has a request, which the scheduler reserves, and a limit, which the kernel enforces. Admission checks both in the namespace; the scheduler fits requests; the kubelet throttles CPU and OOM-kills memory at the limit; under node memory pressure the kubelet ranks Pods by usage above request. <span class="rl-phone-only">On a phone, the machine sits below the status cards.</span></p>
    <div class="anatomy-bench">
    <div class="anatomy-bench-object">
    <div class="rl-stage">
      <svg class="iso-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="rl-title rl-desc">
        <title id="rl-title">Admission lane, node platform and memory tank</title>
        <desc id="rl-desc">A Pod cartridge enters a lane with three gates: LimitRange, ResourceQuota and the scheduler fit. A blade lifts only for a check that passed. Four bays on node-a hold the candidate and three resident Pods. A tank shows memory in use against the eviction ring; evicted cartridges move to the tray.</desc>
        <g innerHTML={base} />
        <g innerHTML={lane} />
        <g innerHTML={platform} />
        <g innerHTML={tray} />
        <g innerHTML={tankShell} />
        <g innerHTML={tankFill(fillHeight())} />
        <g innerHTML={tankRing(ringZ)} />
        <For each={GATE_IDS}>{(g) => <>
          <g innerHTML={gate(GATE_X[g])} />
          <g ref={(el) => { blades[g] = el; }} class="rl-blade" data-off={gateOff(g) ? '' : undefined} transform={move(0, 0, 0)} innerHTML={blade(GATE_X[g])} />
        </>}</For>
        <For each={CART_IDS}>{(id) => <g ref={(el) => { carts[id] = el; }} transform={move(pos[id].x, pos[id].y, 3)} innerHTML={cartridge} />}</For>
      </svg>
      <span class="rl-tag rl-object rl-gate" style={screenAt(GATE_X.limitrange, LANE_Y, 40)} data-gate="limitrange">LimitRange</span>
      <span class="rl-tag rl-object rl-gate" style={screenAt(GATE_X.quota, LANE_Y, 40)} data-gate="quota">ResourceQuota</span>
      <span class="rl-tag rl-object rl-gate" style={screenAt(GATE_X.fit, LANE_Y, 40)} data-gate="fit">scheduler</span>
      <span class="rl-tag rl-object rl-node" style={screenAt(64, 102, 4)} data-object="node">node-a</span>
      <span class="rl-tag rl-object rl-tank" style={screenAt(TANK.x, TANK.y, 20 + TANK.height)} data-object="tank">{usedMem()}Mi in use</span>
      <span class="rl-tag rl-object rl-tray" style={screenAt(-82, 58, 8)} data-object="tray">Failed</span>
      <For each={CART_IDS}>{(id) => <span ref={(el) => { tags[id] = el; }} class={`rl-tag rl-pod${id === 'candidate' ? '' : ' rl-object'}`} data-object="pod" data-cart={id}>{tagText(id)}</span>}</For>
    </div>
    <div class="anatomy-controls rl-config">
      <label class="rl-wide">Draft Pod resources
        <select value={config().profile} disabled={!hydrated() || busy() || podExists()} onChange={(e) => changeConfig({ ...config(), profile: e.currentTarget.value as Profile }, 'profile')}>
          <For each={groups}>{([group, title]) => <optgroup label={title}>
            <For each={Object.entries(profiles).filter(([, p]) => p.group === group)}>{([id, p]) => <option value={id} selected={config().profile === id}>{p.label}</option>}</For>
          </optgroup>}</For>
        </select>
      </label>
      <label class="rl-wide"><input type="checkbox" checked={config().limitRange} disabled={!hydrated() || busy()} onChange={(e) => changeConfig({ ...config(), limitRange: e.currentTarget.checked }, 'limitrange')} />LimitRange shop-defaults</label>
      <label class="rl-wide"><input type="checkbox" checked={config().quota} disabled={!hydrated() || busy()} onChange={(e) => changeConfig({ ...config(), quota: e.currentTarget.checked }, 'quota')} />ResourceQuota shop-quota</label>
      <label>search-5d6b memory use
        <select value={config().searchUse} disabled={!hydrated() || busy()} onChange={(e) => changeConfig({ ...config(), searchUse: e.currentTarget.value as Config['searchUse'] }, 'search')}>
          <option value="within">200Mi (≤ request)</option>
          <option value="above">600Mi (&gt; request)</option>
        </select>
      </label>
      <label>Candidate load
        <select value={config().load} disabled={!hydrated() || busy()} onChange={(e) => changeConfig({ ...config(), load: e.currentTarget.value as Config['load'] }, 'load')}>
          <option value="idle">idle</option>
          <option value="busy">busy</option>
          <option value="spike">spike</option>
        </select>
      </label>
    </div>
    </div>
    <div class="anatomy-bench-panel">
    <div class="anatomy-controls rl-actions">
      <button type="button" data-anatomy-primary disabled={!hydrated() || busy() || podExists()} onClick={submitPod}>Submit Pod</button>
      <button type="button" disabled={!hydrated() || busy() || !candidateRunning()} onClick={runCandidate}>Run load</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={checkPressure}>Apply node memory pressure</button>
      <button type="button" disabled={!hydrated() || busy()} onClick={resetAll}>Reset</button>
    </div>
    <ChangeReport change={change()} busy={busy()} />
    <div class="rl-cards" data-anatomy-status>
      <section class="rl-card" data-object="pod">
        <p><strong>{candidateName()}</strong> · candidate Pod</p>
        <p class="rl-fact">Spec req {quantityNote('cpu', profiles[config().profile].spec.requests.cpu)}/{quantityNote('memory', profiles[config().profile].spec.requests.memory)} · lim {quantityNote('cpu', profiles[config().profile].spec.limits.cpu)}/{quantityNote('memory', profiles[config().profile].spec.limits.memory)}</p>
        <p class="rl-fact">{submission() ? `qosClass ${submission()!.qos} · ${submission()!.phase === 'running' ? 'node-a' : 'no node'} · restarts ${runtime()?.restarts ?? 0}` : 'not submitted'}</p>
        <div class="rl-badges"><StateBadge tone={badges().pod.tone} label={badges().pod.label} /><StateBadge tone={badges().runtime.tone} label={badges().runtime.label} /></div>
      </section>
      <section class="rl-card" data-object="namespace">
        <p><strong>namespace shop</strong> · policy objects</p>
        <p class="rl-fact">ResourceQuota: {config().quota ? `requests ${fmt('cpu', quotaUsed().cpu)} / ${fmt('cpu', quotaHard.cpu)} CPU, ${fmt('memory', quotaUsed().memory)} / ${fmt('memory', quotaHard.memory)} memory` : 'none'}</p>
        <p class="rl-fact">LimitRange: {config().limitRange ? `default request ${fmt('cpu', limitRange.defaultRequest.cpu)} / ${fmt('memory', limitRange.defaultRequest.memory)}, default limit ${fmt('cpu', limitRange.defaultLimit.cpu)} / ${fmt('memory', limitRange.defaultLimit.memory)}` : 'none'}</p>
        <div class="rl-badges"><StateBadge tone={badges().lr.tone} label={badges().lr.label} /><StateBadge tone={badges().quota.tone} label={badges().quota.label} /></div>
      </section>
      <section class="rl-card" data-object="node">
        <p><strong>node-a</strong> · {runningCount()} Pods running · allocatable {fmt('cpu', node.cpu)} / {fmt('memory', node.memory)}</p>
        <p class="rl-fact">Requests committed: {fmt('cpu', committed().cpu)} CPU, {fmt('memory', committed().memory)} memory · memory in use {usedMem()}Mi</p>
        <div class="rl-badges"><StateBadge tone={badges().fit.tone} label={badges().fit.label} /><StateBadge tone={badges().pressure.tone} label={badges().pressure.label} /></div>
      </section>
    </div>
    </div>
    </div>
    <div class="rl-ledger-scroll">
      <table class="rl-ledger">
        <caption>Pods that were on node-a: requests, memory use and eviction rank</caption>
        <thead><tr><th scope="col">Pod</th><th scope="col">QoS</th><th scope="col">Requests</th><th scope="col">Memory use</th><th scope="col">Use minus request</th><th scope="col">Eviction rank</th><th scope="col">State</th></tr></thead>
        <tbody>
          <For each={ledger()}>{(row) => <tr>
            <th scope="row">{row.name}</th>
            <td>{row.qos}</td>
            <td>{fmt('cpu', row.reqCpu)} CPU · {fmt('memory', row.reqMem)}</td>
            <td>{row.use}Mi</td>
            <td>{row.use - row.reqMem >= 0 ? '+' : ''}{row.use - row.reqMem}Mi</td>
            <td>{rankOf(row.name) !== undefined ? `#${rankOf(row.name)}` : 'not checked'}</td>
            <td>{row.state}</td>
          </tr>}</For>
        </tbody>
      </table>
    </div>
    <div class="rl-details">
      <div class="anatomy-yaml-figure-grid">
        <ManifestPanel title="Namespace shop · policy objects" lines={nodeLines()} note="Highlighted after a submit or a pressure check: the policy fields that check read. A switched-off policy has no object." />
        <ManifestPanel title={`Pod ${candidateName()} · spec and status`} lines={podLines()} note="After Submit: the stored spec, with a comment naming who filled each field (author, API default or LimitRange default). Status appears once the Pod exists." />
      </div>
      <p class="rl-facts">Fixture facts: node-a has 2000m CPU and 2048Mi allocatable. Residents request 800m CPU and 768Mi. The eviction line is memory.available below 768Mi, not the kubelet default of 100Mi, so pressure shows at this scale. Namespace figures are fixture values.</p>
      <p class="rl-caption">Blades rise only for a check that passed; a switched-off policy has no blade. The lane order is explanatory: admission, then scheduling, then the kubelet.</p>
    </div>
  </div>;
}
