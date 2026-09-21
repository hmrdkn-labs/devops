import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { mentalModelSchema } from '../src/lib/content/mental-model-schema';
import { eligibleNodeIds, evaluateNode } from '../src/lib/learning/scheduling-prototype';

const model = mentalModelSchema.parse(parse(readFileSync(new URL('../content/mental-models/pod-scheduling.yaml', import.meta.url), 'utf8')));
const prototype = model.scheduling_prototype!;

describe('portable scheduling prototype', () => {
  it('evaluates requested capacity, required labels, and taints together', () => {
    expect(eligibleNodeIds(prototype.base.pod, prototype.base.nodes)).toEqual(prototype.base.eligible_node_ids);
    expect(evaluateNode(prototype.base.pod, prototype.base.nodes[0]!).reasons).toContain('needs 600m CPU; 400m is available for requests');
    expect(evaluateNode(prototype.base.pod, prototype.base.nodes[1]!).reasons).toContain('taint dedicated=batch:NoSchedule is not tolerated');
  });

  it('makes a toleration permit a tainted node without attracting the Pod', () => {
    expect(eligibleNodeIds(prototype.change.pod, prototype.base.nodes)).toEqual(prototype.change.eligible_node_ids);
    expect(evaluateNode(prototype.change.pod, prototype.base.nodes[1]!).preferred).toBe(true);
    expect(evaluateNode(prototype.change.pod, prototype.base.nodes[2]!).eligible).toBe(false);
  });

  it('never lets a preference rescue a failed hard requirement', () => {
    const nodeX = prototype.transfer.nodes.find((node) => node.id === 'node-x')!;
    expect(evaluateNode(prototype.transfer.pod, nodeX)).toMatchObject({ eligible: false, preferred: true });
    expect(eligibleNodeIds(prototype.transfer.pod, prototype.transfer.nodes)).toEqual(prototype.transfer.eligible_node_ids);
  });

  it('changes only tolerations in the guided condition change', () => {
    const { tolerations: baseTolerations, ...basePod } = prototype.base.pod;
    const { tolerations: changedTolerations, ...changedPod } = prototype.change.pod;
    expect(changedPod).toEqual(basePod);
    expect(baseTolerations).toEqual([]);
    expect(changedTolerations).toEqual([{ key: 'dedicated', value: 'batch', effect: 'NoSchedule' }]);
  });

  it('uses a changed transfer answer and preserves honest proof limits', () => {
    expect(prototype.transfer.answer_id).not.toBe(prototype.base.answer_id);
    expect(prototype.lifecycle.proof.limitation).toContain('not a live cluster observation');
    expect(prototype.lifecycle.stages.map((stage) => stage.actor)).toEqual(['kube-scheduler', 'API server', 'Node kubelet and runtime']);
  });

  it('rejects undeclared fields in the optional prototype payload', () => {
    const changed = structuredClone(model) as typeof model & { scheduling_prototype: typeof prototype & { untracked_claim?: string } };
    changed.scheduling_prototype.untracked_claim = 'would otherwise bypass the portable contract';
    expect(mentalModelSchema.safeParse(changed).success).toBe(false);
  });
});
