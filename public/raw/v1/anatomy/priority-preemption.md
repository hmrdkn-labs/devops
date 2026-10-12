## The big picture

`api-pod` needs 600m of CPU, and neither node has that much free. Its **PriorityClass** says it is more important than the batch work already running. Priority does two separate things. It moves the Pod ahead of lower-priority pending Pods in the scheduling queue. And, if the Pod still cannot be placed, it lets the scheduler look for a node where evicting lower-priority Pods would make room. Neither effect places the Pod. Placement still needs a node that passes every hard requirement once the victims are gone.

The scheduler records the chosen node in `status.nominatedNodeName`. That is a reservation and a hint. The Pod is bound only after the victims have finished their graceful termination, and only if nothing better takes the room first. A higher-priority Pod can take it, and the scheduler then clears the nomination.

The apparatus above is an original teaching fixture, not a recording of a cluster. Two rack columns are the nodes. Each Pod is a block whose height is its CPU request, so the empty space under a rack's rim is its free CPU. Pending Pods wait on the queue tray at the front, in priority order. A nominated Pod hovers over its node's cradle. A removed Pod stands in the bin.

## Who owns what

- **Cluster administrator** creates the `PriorityClass` objects. Each has a name, an integer `value`, and a `preemptionPolicy`. The administrator decides which values mean what.
- **Workload author** writes `priorityClassName` and `schedulerName` in the Pod template. The Pod itself does not choose its node.
- **Application owner** creates a `PodDisruptionBudget` (PDB) for a set of Pods. Preemption reads the budget. It does not own it.
- **Admission** resolves `priorityClassName` to a numeric `spec.priority` on the Pod. A Pod that names a missing class is rejected.
- **kube-scheduler** orders pending Pods by priority, filters nodes, chooses victims and nominates a node when preemption is needed, and binds the Pod by writing `spec.nodeName`.
- **Victim Pods** receive the `DisruptionTarget` condition with reason `PreemptionByScheduler` and enter graceful termination. The kubelet stops them. The scheduler does not start containers.

## How it works

1. **Queue order.** Pending Pods are ordered by priority. api-pod (100000) is considered before batch-3 (0), even though batch-3 was created first. Equal priority falls back to creation order.
2. **Ordinary placement.** Each candidate node is checked for free CPU against the request. If a node has room, the Pod is bound there. The fixture tries the nominated node first, which matches the documentation.
3. **Preemption check.** If no node has room, preemption is tried. It is allowed only when the policy is `PreemptLowerPriority`, and only for victims with strictly lower priority than the Pod. Equal priority never evicts equal priority.
4. **Victim choice on each node.** The scheduler asks whether removing all lower-priority Pods from the node would make the Pod schedulable there. If not, the node is not a candidate. If yes, it tries to keep as many of those Pods as still fit. The kube-scheduler source (`pkg/scheduler/framework/plugins/defaultpreemption`, not the public documentation) reprieves PodDisruptionBudget-violating victims first, then the rest, each group from the highest priority down. The fixture reprieves in creation order instead. The victims that remain are the ones that must go.
5. **Node choice.** Among candidate nodes, the fixture prefers the one with the fewest PodDisruptionBudget violations, then the one whose highest-priority victim is lowest. The documentation states both preferences. The tie-breaks are simplified.
6. **Nomination and grace.** The victims are marked for deletion with a `DisruptionTarget` condition. `status.nominatedNodeName` is set on api-pod. The victims then get graceful termination (30 seconds by default). The fixture counts their requests as used until the grace period ends.
7. **Next pass.** When the grace period ends, the kubelet finishes stopping the victims, and they leave the API. Only then does kube-scheduler's next pass run. A higher-priority rival, if any, is queued ahead of api-pod. The scheduler tries the nominated node first. If it now has room, api-pod is bound there. The binding sets `spec.nodeName`. Once `spec.nodeName` is set, the nomination no longer matters, and the fixture leaves the field as it was. `status.phase` stays Pending until the kubelet starts the containers.

## YAML example

These two objects match the figure's manifest panels for the default configuration. The PriorityClass names the class the Pod uses. The Pod is queued and has no binding yet.

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: platform-critical
value: 100000
preemptionPolicy: PreemptLowerPriority
globalDefault: false
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: api-pod
spec:
  priorityClassName: platform-critical
  schedulerName: default-scheduler
  containers:
  - name: api
    image: registry.example.com/api:1.0
    resources:
      requests:
        cpu: 600m
  # nodeName unset: only binding sets it
status:
  phase: Pending   # Assigned is not Running; the kubelet starts containers
  # nominatedNodeName unset
```

After a run that nominates node-a, the figure adds `status.nominatedNodeName: node-a`. After the grace period, binding adds `spec.nodeName: node-a`, and `status.phase` stays Pending.

## Try these changes

1. **Default, then Run, then End grace period.** api-pod is nominated to node-a, and batch-2 is marked with `DisruptionTarget`. Expected: batch-2 is removed, then api-pod is assigned to node-a, and the report says it is not Running.
2. **Add the batch-2 PodDisruptionBudget, then Run.** The scheduler prefers node-b, which has no budget violation, and evicts reports-1 (priority 100), a higher-priority victim than batch-2. Expected: api-pod is nominated to node-b, and the report says why.
3. **Add both PodDisruptionBudgets, then Run.** Every candidate violates a budget, so preemption still happens: node-a evicts batch-2. Expected: the budget is violated, and the report says budgets are best-effort.
4. **Choose platform-critical-nonpreempting, then Run.** Priority still puts api-pod first, but `preemptionPolicy: Never` forbids eviction. Expected: no victim is marked, and api-pod stays Pending with no nomination.
5. **Choose reporting (100), then Run.** Only batch-2 (0) is below 100, so reports-1 is untouched. Choose no priority class, then Run: nothing is lower than 0, and api-pod waits.
6. **Tick the incident-high rival, Run, then End grace period.** incident-high (1000000) is bound to node-a. api-pod loses node-a's nomination, and the next pass nominates node-b and marks reports-1. End grace period again binds api-pod to node-b.

## Misconceptions

- **Wrong:** "A higher priority means the Pod runs on that node." **Correct:** priority orders the queue and enables eviction. The node must still pass every hard requirement, and a nomination is only a reservation.
- **Wrong:** "`nominatedNodeName` is where the Pod is running." **Correct:** the nominated node is a hint. `spec.nodeName` is set only by binding, and the Pod can end up on another node or lose its nomination.
- **Wrong:** "Preemption removes victims instantly, so the Pod lands right away." **Correct:** victims receive graceful termination. Their requests still count until they are gone, and a higher-priority Pod can take the room first.
- **Wrong:** "A PodDisruptionBudget blocks preemption." **Correct:** preemption respects budgets on a best-effort basis. It prefers candidates without violations, but still preempts when every candidate violates one.
- **Wrong:** "`preemptionPolicy: Never` makes a Pod untouchable." **Correct:** a non-preempting Pod does not evict others, but a higher-priority Pod may still evict it.
- **Wrong:** "`schedulerName` sets priority." **Correct:** `schedulerName` chooses which scheduler, or profile, handles the Pod. Priority comes from `priorityClassName`. The two are independent.

## Safe read-only observation

Run these only against a cluster you are authorized to inspect. They read state and change nothing:

```sh
kubectl get priorityclass
kubectl get pod api-pod -n NAMESPACE -o jsonpath='{.spec.priorityClassName}{"\n"}{.spec.priority}{"\n"}{.spec.schedulerName}{"\n"}{.spec.nodeName}{"\n"}{.status.nominatedNodeName}{"\n"}'
kubectl get pod batch-2 -n NAMESPACE -o jsonpath='{.status.conditions}{"\n"}'
kubectl get events -n NAMESPACE --field-selector involvedObject.name=api-pod
kubectl get poddisruptionbudget -n NAMESPACE
```

**Limit:** each command is a snapshot. `nominatedNodeName` can change on the next scheduling pass. Events are short-lived, so an empty result does not mean nothing happened. A budget listing does not show whether preemption would violate it at that moment. A `Pending` phase alone does not say whether the cause is queue order, missing capacity, a non-preempting policy, or another scheduler.

## Predict and transfer

Node-a has batch-1 (400m) and batch-2 (400m, protected by a PodDisruptionBudget). Node-b has reports-1 (800m, priority 100). A new Pod requests 600m with priority 100 (`reporting`) and `preemptionPolicy: PreemptLowerPriority`.

**Prediction:** neither node has room, and preemption is allowed. On node-b, reports-1 has equal priority, so it is not a victim, and node-b is not a candidate. On node-a, removing both batch Pods makes room, and batch-1 can be kept, so batch-2 is the single victim. That violates its budget. Since node-a is the only candidate, the scheduler still preempts batch-2 and nominates node-a. The Pod is not yet bound.

Continue with [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement?mode=reference) and [the Scheduling quiz companion](/learn/kcna-scheduling-review?mode=reference). This explanation supports their scheduler-extension objective; exploring the object does not record mastery.

## Assumptions and limits

- **Two nodes, one resource.** Each node has 1000m allocatable CPU. Memory, storage, affinity, taints, topology spread and inter-Pod rules are not modelled.
- **PDB is a flag.** A Pod either has a budget that allows no disruption (`pdb`) or it does not. The YAML names a selector, but the fixture does not evaluate label matching.
- **Victim and node ordering is simplified.** The fixture reprieves victims in creation order, where the kube-scheduler source reprieves PDB-violating victims first and then by priority. It picks nodes by PDB violations, then highest victim priority. The real scheduler has further tie-breaks; the documentation describes only these two preferences.
- **Grace period is a button.** End grace period stands for the 30-second default. The fixture does not time it.
- **Terminating Pods still count, and Run waits.** A victim keeps its request until it is gone. Run is disabled while any victim is terminating. Real re-preemption rules during a grace period are not modelled.
- **Reservation rule is simplified.** A nomination reserves room against Pods with equal or higher priority. The documentation says the nomination helps track reserved resources; the exact accounting is not modelled.
- **Not modelled:** cross-node preemption, inter-Pod affinity on victims, in-place resize preemption, PodGroups, scheduling gates, backoff timing, and kube-scheduler plugin internals.
- **schedulerName is a gate.** The fixture runs only default-scheduler. A batch-scheduler Pod is left alone, and no profile configuration is modelled.
- **Numbers are fixture values.** 100000, 100, 1000000, the request sizes and the budgets are chosen for the teaching case, not defaults.
- The model does not run cluster commands, persist learner data, or claim live verification.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/) — PriorityClass fields, queue ordering, victims with graceful termination, `nominatedNodeName`, `preemptionPolicy: Never`, and best-effort PDB handling.
- [Kubernetes: Disruptions](https://kubernetes.io/docs/concepts/workloads/pods/disruptions/) — the `DisruptionTarget` condition and its `PreemptionByScheduler` reason, and how PodDisruptionBudgets apply to voluntary disruption.
- [Kubernetes: Configure Multiple Schedulers](https://kubernetes.io/docs/tasks/extend-kubernetes/configure-multiple-schedulers/) — `spec.schedulerName` matching a scheduler profile's `schedulerName`, and unique scheduler names.
