import { describe, expect, it } from 'vitest';
import { advance, candidates, choose, evaluate, INITIAL, manifestLines, NODES, ranking, tiedAtTop, visibleScore, type ManifestLine, type Placement } from '../src/components/anatomy/scheduling-placement/model';
import { checkStatus, filterStatus, placementStatus, scoreText, settledReport } from '../src/components/anatomy/scheduling-placement/report';

const CPU_OPTIONS = [300, 600, 1000, 1500];
const MEMORY_OPTIONS = [512, 1024, 2048, 3072];
const FIXTURES = ['mixed', 'equal'] as const;

const highlighted = (lines: ManifestLine[]) => lines.filter((item) => item.highlight).map((item) => item.text.trim());
// First matching line: the request block precedes the fixed limits block, so prefixes resolve to requests.
const first = (lines: ManifestLine[], prefix: string) => lines.find((item) => item.text.trim().startsWith(prefix))!;

describe('capacity placement bench model', () => {
  it('accepts equality in both dimensions but rejects a shortfall in either', () => {
    const node = NODES.mixed[0]!;
    expect(evaluate(node, { cpu: 300, memory: 2048 }).eligible).toBe(true);
    expect(evaluate(node, { cpu: 301, memory: 2048 })).toMatchObject({ eligible: false, score: null });
    expect(evaluate(node, { cpu: 300, memory: 2049 })).toMatchObject({ eligible: false, score: null });
  });

  it('checks CPU and memory independently, so one failing resource leaves the other passing', () => {
    const nodeB = evaluate(NODES.mixed[1]!, INITIAL.request);
    expect(nodeB.cpu.pass).toBe(true);
    expect(nodeB.memory.pass).toBe(false);
    expect(nodeB.eligible).toBe(false);
  });

  it('gives a score to a dock exactly when it is feasible', () => {
    for (const fixture of FIXTURES) {
      for (const cpu of CPU_OPTIONS) {
        for (const memory of MEMORY_OPTIONS) {
          for (const evaluation of candidates({ ...INITIAL, fixture, request: { cpu, memory } })) {
            expect(evaluation.score === null).toBe(!evaluation.eligible);
          }
        }
      }
    }
  });

  it('keeps every feasible score hidden until the Score transition has committed', () => {
    const filtered = advance(INITIAL);
    const [feasible] = ranking(filtered);
    expect(feasible).toBeDefined();
    expect(visibleScore(filtered, feasible!)).toBeNull();
    const selected = advance(filtered);
    expect(visibleScore(selected, feasible!)).toBe(feasible!.score);
  });

  it('selects a feasible dock, and selects nothing exactly when no dock is feasible', () => {
    for (const fixture of FIXTURES) {
      for (const cpu of CPU_OPTIONS) {
        for (const memory of MEMORY_OPTIONS) {
          const state: Placement = { ...INITIAL, fixture, request: { cpu, memory }, phase: 'filtered' };
          const selected = choose(state);
          expect(selected !== null).toBe(candidates(state).some((evaluation) => evaluation.eligible));
          if (selected) expect(candidates(state).find((evaluation) => evaluation.node.id === selected)!.eligible).toBe(true);
        }
      }
    }
  });

  it('does not select, score, or assign when every dock fails one requested dimension', () => {
    const state: Placement = { ...INITIAL, request: { cpu: 1500, memory: 512 } };
    const filtered = advance(state);
    expect(candidates(filtered).every((evaluation) => !evaluation.eligible)).toBe(true);
    expect(choose(filtered)).toBeNull();
    expect(advance(filtered)).toEqual({ ...state, phase: 'filtered', selected: null });
  });

  it('ranks feasible docks by score and breaks exact ties by node name', () => {
    expect(ranking(INITIAL).map((evaluation) => evaluation.node.id)).toEqual(['node-c']);
    expect(tiedAtTop(INITIAL)).toBe(false);
    const equal: Placement = { ...INITIAL, fixture: 'equal', phase: 'filtered' };
    expect(ranking(equal).map((evaluation) => evaluation.node.id)).toEqual(['node-a', 'node-b', 'node-c']);
    expect(tiedAtTop(equal)).toBe(true);
    expect(choose(equal)).toBe('node-a');
  });

  it('keeps selection, assignment, and node execution as distinct transitions', () => {
    const selected = advance(advance(INITIAL));
    expect(selected).toMatchObject({ phase: 'selected', selected: 'node-c' });
    const assigned = advance(selected);
    expect(assigned.phase).toBe('assigned');
    const running = advance(assigned);
    expect(running.phase).toBe('running');
    expect(advance(running)).toEqual(running);
  });

  it('writes spec.nodeName only at assignment, never at selection', () => {
    const selected = advance(advance(INITIAL));
    expect(first(manifestLines(selected, 'score'), 'nodeName').text).toBe('  nodeName: ""');
    const assigned = advance(selected);
    expect(first(manifestLines(assigned, 'assign'), 'nodeName')).toEqual({ text: '  nodeName: node-c', highlight: true });
  });

  it('keeps phase Pending after assignment and moves it to Running only at the execution transition', () => {
    const assigned = advance(advance(advance(INITIAL)));
    expect(first(manifestLines(assigned, 'assign'), 'phase')).toEqual({ text: '  phase: Pending', highlight: false });
    const running = advance(assigned);
    expect(first(manifestLines(running, 'execute'), 'phase')).toEqual({ text: '  phase: Running', highlight: true });
  });

  it('records PodScheduled False only when the filter leaves no feasible dock', () => {
    const unschedulable = advance({ ...INITIAL, request: { cpu: 1500, memory: 1024 } });
    const lines = manifestLines(unschedulable, 'filter');
    expect(lines.some((item) => item.text.trim() === 'status: "False"')).toBe(true);
    expect(lines.some((item) => item.text.trim() === 'reason: Unschedulable')).toBe(true);
    expect(manifestLines(advance(INITIAL), 'filter').some((item) => item.text.includes('PodScheduled'))).toBe(false);
  });

  it('highlights only the lines the last committed interaction read or changed', () => {
    expect(highlighted(manifestLines(INITIAL, null))).toEqual([]);
    expect(highlighted(manifestLines(advance(INITIAL), 'filter'))).toEqual(['cpu: 600m', 'memory: 1024Mi']);
    const selected = advance(advance(INITIAL));
    expect(highlighted(manifestLines(selected, 'score'))).toEqual(['cpu: 600m', 'memory: 1024Mi']);
    const assigned = advance(selected);
    expect(highlighted(manifestLines(assigned, 'assign'))).toEqual(['nodeName: node-c', 'conditions:', '- type: PodScheduled', 'status: "True"']);
    expect(highlighted(manifestLines(advance(assigned), 'execute'))).toEqual(['phase: Running']);
  });

  it('shows in the manifest the same request values the bench evaluates', () => {
    for (const cpu of CPU_OPTIONS) {
      for (const memory of MEMORY_OPTIONS) {
        const lines = manifestLines({ ...INITIAL, request: { cpu, memory } }, 'configure');
        expect(first(lines, 'cpu:').text.trim()).toBe(`cpu: ${cpu}m`);
        expect(first(lines, 'memory:').text.trim()).toBe(`memory: ${memory}Mi`);
      }
    }
  });
});

describe('status and report invariants', () => {
  it('shows no numeric score for a feasible dock until scoring has committed', () => {
    const filtered = advance(INITIAL);
    const [feasible] = ranking(filtered);
    expect(scoreText(filtered, feasible!)).not.toMatch(/\d/);
    expect(scoreText(advance(filtered), feasible!)).toMatch(/\d/);
  });

  it('marks a feasible dock eligible but unselected until the selection commits', () => {
    const filtered = advance(INITIAL);
    const eligible = candidates(filtered).find((evaluation) => evaluation.node.id === 'node-c')!;
    expect(filterStatus(filtered, eligible).tone).toBe('pass');
    expect(placementStatus(filtered, eligible)).toBeNull();
    const selected = advance(filtered);
    expect(placementStatus(selected, eligible)?.tone).toBe('selected');
    for (const other of candidates(selected).filter((evaluation) => evaluation.node.id !== 'node-c')) {
      expect(placementStatus(selected, other)).toBeNull();
    }
  });

  it('gives each resource its own pass or fail status for the same dock', () => {
    const filtered = advance(INITIAL);
    const nodeB = candidates(filtered).find((evaluation) => evaluation.node.id === 'node-b')!;
    expect(checkStatus(filtered, nodeB.cpu, 'm').tone).toBe('pass');
    expect(checkStatus(filtered, nodeB.memory, 'Mi').tone).toBe('fail');
  });

  it('reports the exact shortfall for each failed resource in the filter change', () => {
    const filtered = advance(INITIAL);
    const report = settledReport('filter', filtered);
    expect(report.changed).toContain('300m');
    expect(report.changed).toContain('512Mi');
    expect(report.changed).toContain('node-c');
  });
});
