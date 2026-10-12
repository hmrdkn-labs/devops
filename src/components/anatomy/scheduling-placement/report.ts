import type { Change } from '@/components/anatomy/shared/ChangeReport';
import type { BadgeTone } from '@/components/anatomy/shared/StateBadge';
import { candidates, ranking, tiedAtTop, visibleScore, type Evaluation, type Interaction, type Placement, type ResourceCheck } from './model';

const POD = 'reports/report-worker';
const BUDGET_NAME = { mixed: 'mixed-bottleneck', equal: 'equal (tie)' } as const;

const ACTOR: Record<Interaction, string> = {
  configure: 'Pod author (this bench control), not kube-scheduler',
  filter: 'kube-scheduler filter stage: CPU and memory requests checked against allocatable minus existing requests',
  score: 'Fixture policy standing in for kube-scheduler scoring; not the default scoring plugins or weights',
  assign: 'kube-scheduler binding, written to the API server',
  execute: 'kubelet and container runtime on the bound node (one assumed-successful fixture step)',
  replay: 'This bench replay control, not a Kubernetes action',
  reset: 'Fixture author (this bench control)',
};

const REASON: Record<Interaction, string> = {
  configure: 'In this fixture an edited input starts a fresh unassigned Pod; in-place resize and moving a bound Pod are not modeled',
  filter: 'A dock is feasible only if CPU and memory both fit; equality fits, and a shortfall in either removes the dock',
  score: 'Among feasible docks, the authored policy ranks average normalized slack after placement',
  assign: 'The scheduler binds the Pod to the dock it selected; binding is recorded once',
  execute: 'The kubelet starts the containers of a Pod that is bound to its node',
  replay: 'Restarts the fixture from created with the same inputs; filter and score must be pressed again',
  reset: 'Restores the authored starting values',
};

const PROGRESS: Record<Interaction, [string, string]> = {
  configure: ['Preparing a fresh unassigned Pod', 'Applying the new requests and budgets; the previous placement is being discarded'],
  filter: ['Filtering docks', 'Checking CPU and memory for each dock; flags are not final until the motion settles'],
  score: ['Scoring feasible docks', 'Ranking only docks that passed the filter; no score is shown until this settles'],
  assign: ['Recording assignment', 'The cartridge is moving into the chosen dock; nodeName is written only when this settles'],
  execute: ['Starting containers on the node', 'The execution latch is rising; status.phase is not Running until this settles'],
  replay: ['Replaying the same inputs', 'Returning to created; spec.nodeName is cleared when this settles'],
  reset: ['Resetting the fixture', 'Restoring the mixed budgets and starting requests'],
};

const NOT_COMMITTED = 'Not committed until the motion settles';

function shortfall(evaluation: Evaluation): string {
  const parts: string[] = [];
  if (!evaluation.cpu.pass) parts.push(`CPU short by ${-evaluation.cpu.margin}m`);
  if (!evaluation.memory.pass) parts.push(`memory short by ${-evaluation.memory.margin}Mi`);
  return parts.join(' and ');
}

export function idleReport(state: Placement): Change {
  return {
    title: 'Created · waiting for the scheduler',
    changed: `Pod ${POD} requests ${state.request.cpu}m CPU / ${state.request.memory}Mi memory; spec.nodeName is empty`,
    actor: 'Pod author (the manifest); no scheduler action yet',
    reason: 'The Pod is unbound, so no dock has been evaluated for it',
    notYet: 'No filter, score, assignment, or node execution has happened',
  };
}

export function pendingReport(kind: Interaction): Change {
  const [title, changed] = PROGRESS[kind];
  return { title: `${title}…`, changed, actor: ACTOR[kind], reason: REASON[kind], notYet: NOT_COMMITTED };
}

function filterReport(next: Placement): Change {
  const evaluations = candidates(next);
  const feasible = evaluations.filter((evaluation) => evaluation.eligible);
  const rejected = evaluations.filter((evaluation) => !evaluation.eligible).map((evaluation) => `${evaluation.node.id} ${shortfall(evaluation)}`);
  const base = { actor: ACTOR.filter, reason: REASON.filter };
  if (feasible.length === 0) {
    return {
      ...base,
      title: 'Filter rejected every dock',
      changed: `${rejected.join('; ')}. kube-scheduler records PodScheduled=False (Unschedulable); spec.nodeName stays empty`,
      notYet: 'Nothing is forced onto a dock; this bench does not simulate scheduler retries over time',
    };
  }
  return {
    ...base,
    title: `Filter kept ${feasible.length} of ${evaluations.length} docks`,
    changed: `Feasible: ${feasible.map((evaluation) => evaluation.node.id).join(', ')}${rejected.length ? `. Rejected: ${rejected.join('; ')}` : ''}`,
    notYet: 'Feasible docks have no score yet; no node is selected and spec.nodeName is still empty',
  };
}

function scoreReport(next: Placement): Change {
  const ranked = ranking(next);
  const [top] = ranked;
  const base = { actor: ACTOR.score, reason: REASON.score };
  if (!top) return { ...base, title: 'No feasible dock to score', changed: 'Scoring received no feasible docks', notYet: 'No node is selected' };
  return {
    ...base,
    title: `${top.node.id} selected by the fixture score`,
    changed: `Scores: ${ranked.map((evaluation) => `${evaluation.node.id} ${(evaluation.score ?? 0).toFixed(2)}`).join(', ')}; the carriage moves to ${top.node.id}`,
    reason: tiedAtTop(next)
      ? `Top score tie at ${(top.score ?? 0).toFixed(2)}; this fixture breaks exact ties by name (kube-scheduler picks randomly)`
      : `${top.node.id} has the highest average normalized slack after placement`,
    notYet: 'Not assigned: spec.nodeName is still empty and no binding has been written',
  };
}

/** Committed report for an interaction, built from the state it produced. */
export function settledReport(kind: Interaction, next: Placement): Change {
  const base = { actor: ACTOR[kind], reason: REASON[kind] };
  switch (kind) {
    case 'configure': return { ...base, title: 'Fresh unassigned Pod', changed: `Requests ${next.request.cpu}m CPU / ${next.request.memory}Mi on ${BUDGET_NAME[next.fixture]} budgets; spec.nodeName empty`, notYet: 'Nothing has been filtered, scored, or assigned' };
    case 'filter': return filterReport(next);
    case 'score': return scoreReport(next);
    case 'assign': return { ...base, title: `Assignment recorded on ${next.selected}`, changed: `spec.nodeName = ${next.selected}; PodScheduled becomes True`, notYet: 'Containers have not started. The phase is still Pending, and the Pod is not Ready' };
    case 'execute': return { ...base, title: `Node execution assumed on ${next.selected}`, changed: 'status.phase = Running; the execution latch rises (fixture step)', notYet: 'Running is not Ready: readiness, probes, and Service endpoints are not modeled' };
    case 'replay': return { ...base, title: 'Replayed the same inputs', changed: 'Back to created: phase Pending, spec.nodeName empty, requests and budgets unchanged', notYet: 'No real Pod was unbound, moved, or deleted; this fixture is restarted, not rescheduled' };
    case 'reset': return { ...base, title: 'Reset to the authored fixture', changed: 'Mixed bottlenecks; requests 600m / 1024Mi; spec.nodeName empty', notYet: 'Nothing has been scheduled' };
  }
}

export interface Status { tone: BadgeTone; label: string }

/** Per-dock eligibility. Placement is a separate predicate and is reported separately. */
export function filterStatus(state: Placement, evaluation: Evaluation): Status {
  if (state.phase === 'created') return { tone: 'wait', label: 'not filtered' };
  if (!evaluation.eligible) return { tone: 'fail', label: 'rejected' };
  return state.phase === 'filtered' ? { tone: 'pass', label: 'eligible · awaiting scoring' } : { tone: 'pass', label: 'eligible' };
}

export function placementStatus(state: Placement, evaluation: Evaluation): Status | null {
  if (state.selected !== evaluation.node.id) return null;
  switch (state.phase) {
    case 'selected': return { tone: 'selected', label: 'selected · not assigned' };
    case 'assigned': return { tone: 'selected', label: 'assigned · containers not started' };
    case 'running': return { tone: 'info', label: 'running (fixture step)' };
    default: return null;
  }
}

export function checkStatus(state: Placement, check: ResourceCheck, unit: 'm' | 'Mi'): Status {
  if (state.phase === 'created') return { tone: 'wait', label: 'not filtered' };
  return check.pass ? { tone: 'pass', label: 'fits' } : { tone: 'fail', label: `short by ${-check.margin}${unit}` };
}

export function scoreText(state: Placement, evaluation: Evaluation): string {
  if (!evaluation.eligible) return 'Score: none (rejected docks are not scored)';
  const shown = visibleScore(state, evaluation);
  if (shown !== null) return `Score ${shown.toFixed(2)}`;
  return state.phase === 'created' ? 'Score: not computed' : 'Score: awaiting scoring';
}
