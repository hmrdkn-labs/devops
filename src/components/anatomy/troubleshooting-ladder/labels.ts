import * as G from './geometry';
import * as M from './model';

/** One HTML label over the figure. The long text is shown on wide stages; the short text on phones. */
export interface LadderLabel {
  kind: 'rung' | 'pod' | 'container' | 'node' | 'service';
  /** Part the label names, placed at this world point (see geometry LABEL and lampAt). */
  anchor: [number, number, number];
  long: string[];
  short: string;
  /** For rung labels: 0-based index of the rung. */
  rung?: number;
  read?: boolean;
}

const containerWords = (state: M.LadderState) => {
  const facts = M.factsOf(state);
  const container = facts.container;
  if (container.state === 'none') return { long: 'container: not created', short: 'no container' };
  if (container.state === 'running') return { long: 'container: running', short: 'running' };
  return { long: `container: waiting (${container.reason})`, short: 'waiting' };
};

/** Every label on the figure for one state. Text is authored here, so the figure and any harness stay in step. */
export function labelsOf(state: M.LadderState): LadderLabel[] {
  const facts = M.factsOf(state);
  const pod = M.podName(state);
  const node = facts.node ?? 'unassigned';
  const container = containerWords(state);
  const lastExit = facts.container.last ? [`last exit ${facts.container.last.exitCode} ${facts.container.last.reason}`] : [];
  const listed = M.listedOf(state, facts);
  return [
    ...M.RUNGS.map((rung, index): LadderLabel => ({
      kind: 'rung', anchor: G.lampAt(index), long: [`${index + 1} ${rung.title}`], short: `${index + 1}`, rung: index, read: state.read[index] === true,
    })),
    { kind: 'pod', anchor: G.LABEL.pod, long: [`Pod ${pod}`, `p-${state.generation} · ${node}`], short: `p-${state.generation}` },
    { kind: 'container', anchor: G.LABEL.container, long: [container.long, ...lastExit], short: container.short },
    { kind: 'node', anchor: G.LABEL.node, long: [`node ${node}`], short: facts.node ?? 'no node' },
    { kind: 'service', anchor: G.LABEL.service, long: ['Service orders-api', `selector app=${M.selectorOf(state)} · ${listed ? 1 : 0} endpoint(s)`], short: 'Service' },
  ];
}
