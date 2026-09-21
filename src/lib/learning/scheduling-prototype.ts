import type { SchedulingNode, SchedulingPod } from '@/lib/content/mental-model-schema';

export interface SchedulingEvaluation {
  eligible: boolean;
  preferred: boolean;
  reasons: string[];
}

function tolerates(pod: SchedulingPod, taint: SchedulingNode['taints'][number]) {
  return pod.tolerations.some((item) => item.key === taint.key && item.value === taint.value && item.effect === taint.effect);
}

/** A deliberately small teaching filter, not a scheduler implementation. */
export function evaluateNode(pod: SchedulingPod, node: SchedulingNode): SchedulingEvaluation {
  const reasons: string[] = [];
  if (node.cpu_available_m < pod.cpu_m) reasons.push(`needs ${pod.cpu_m}m CPU; ${node.cpu_available_m}m is available for requests`);
  if (node.memory_available_mi < pod.memory_mi) reasons.push(`needs ${pod.memory_mi}Mi memory; ${node.memory_available_mi}Mi is available for requests`);
  for (const [key, value] of Object.entries(pod.required_labels)) {
    if (node.labels[key] !== value) reasons.push(`required label ${key}=${value} does not match`);
  }
  for (const taint of node.taints) {
    if (!tolerates(pod, taint)) reasons.push(`taint ${taint.key}=${taint.value}:${taint.effect} is not tolerated`);
  }
  const preferredEntries = Object.entries(pod.preferred_labels);
  const preferred = preferredEntries.length > 0 && preferredEntries.every(([key, value]) => node.labels[key] === value);
  return { eligible: reasons.length === 0, preferred, reasons };
}

export function eligibleNodeIds(pod: SchedulingPod, nodes: SchedulingNode[]) {
  return nodes.filter((node) => evaluateNode(pod, node).eligible).map((node) => node.id);
}
