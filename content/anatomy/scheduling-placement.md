## The big picture

A Pod declares what it needs in `resources.requests`. The scheduler's job is to pick a node where the node's **allocatable** budget, minus the requests already committed there, covers both the CPU and the memory request. Live usage graphs do not enter that check: a node can look nearly idle and still have no room. The bench separates four things that are easy to conflate: **possibility** (filter), **choice** (score), **assignment** (binding writes `spec.nodeName`), and **execution** (the kubelet starts the containers).

This is an original, deterministic teaching fixture. No control touches a cluster, reads live state, or saves progress. The accent cartridge is an accounting token for a Pod object, not a container moving between nodes.

## Who owns what

| Actor | Single responsibility | Bench control |
| --- | --- | --- |
| Pod author | Writes the CPU and memory `requests` in the Pod spec | CPU request, Memory request |
| kubelet and its reservation settings | Publish Node Allocatable: capacity minus reservations and eviction thresholds | Node budgets (fixture values stand in) |
| kube-scheduler, filter | Keeps only nodes where both requests fit | 1 · Filter budgets |
| kube-scheduler, score | Ranks only the nodes that passed the filter | 2 · Score eligible nodes |
| kube-scheduler, binding | Records the chosen node in `spec.nodeName` through the API server | 3 · Record assignment |
| kubelet and container runtime | Starts the containers of a Pod already bound to its node | 4 · Simulate node execution |
| Fixture only | Replays or resets this bench; not a Kubernetes action | Replay current requests, Reset |

Controls are disabled while a transition moves. The readout names the work in progress; the result, the ChangeReport, and the manifest commit only when the motion settles. Reduced motion jumps straight to the committed result.

## How it works

**1 · Filter.** Each dock has two rulers: CPU at the back, memory in front. A ruler's full span is that node's allocatable budget. The occupied shoe is the requests already accounted to the node. The request jaw measures backward from the far end; if it overlaps the shoe, that resource fails. Each resource is checked on its own:

```text
available request budget = allocatable − existing requests
feasible if incoming CPU ≤ available CPU
        AND incoming memory ≤ available memory
```

The bench treats equality as fitting. The public scheduler text says requests must be "less than" capacity, so do not use the exact boundary as a prediction for a real cluster without checking your version.

Mixed-budget fixture, starting values:

| Node | Allocatable CPU / memory | Existing requests | Available request budget |
| --- | --- | --- | --- |
| node-a | 2000m / 4096Mi | 1700m / 2048Mi | 300m / 2048Mi |
| node-b | 2000m / 4096Mi | 800m / 3584Mi | 1200m / 512Mi |
| node-c | 2000m / 4096Mi | 1000m / 2048Mi | 1000m / 2048Mi |

With the starting request of **600m CPU and 1024Mi memory**, node-a fails CPU, node-b fails memory, and node-c passes both. Allocatable is already the budget for Pods after reservations, so do not subtract system reservations a second time. Existing requests are commitments, not current usage. CPU `1000m` is one CPU; memory `1024Mi` is one GiB. Spare memory cannot pay for missing CPU.

**2 · Score.** Only feasible docks are scored, and no score is shown before this button commits:

```text
score = 50 × (
  (available CPU − requested CPU) / allocatable CPU
  + (available memory − requested memory) / allocatable memory
)
```

This is an authored policy. Its arithmetic matches the `LeastAllocated` strategy that kube-scheduler's `NodeResourcesFit` uses by default, averaged over CPU and memory with equal weight. The bench shows only that one term. A real node score adds weighted results from other enabled score plugins, and the configured weights are cluster-specific. The highest score wins. An exact tie chooses node-a, then node-b, then node-c, by fixture rule. kube-scheduler picks randomly among equal top scores.

**3 · Assign.** The selected dock receives the cartridge. Binding is recorded once: `spec.nodeName` is set and `PodScheduled` becomes `True`. The Pod is still `Pending`, and its containers have not started.

**4 · Execute.** The kubelet starts the containers of the bound Pod. The bench assumes this succeeds when the button is pressed. The Pod reaches `Running`, which says containers were created and at least one is running. It does not say the Pod is `Ready` to receive Service traffic.

If no dock passes the filter, the bench leaves the Pod unbound and writes `PodScheduled` `False` with reason `Unschedulable`. Confirm that reason string with `kubectl describe pod` on a real cluster.

## YAML example

This is the Pod after assignment, exactly as the ManifestPanel shows it for node-c:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: report-worker
  namespace: reports
spec:
  nodeName: node-c
  containers:
    - name: worker
      image: registry.example.com/report-worker:1.4.2
      resources:
        requests:
          cpu: 600m
          memory: 1024Mi
        limits:
          cpu: "2"
          memory: 4Gi
status:
  phase: Pending
  conditions:
    - type: PodScheduled
      status: "True"
```

| Field | Written by | What it means here |
| --- | --- | --- |
| `spec.containers[].resources.requests` | Pod author | The only values the scheduler uses for fit. The CPU and memory controls edit these. |
| `spec.nodeName` | kube-scheduler, binding | Shows `""` before assignment, `node-c` after. |
| `status.phase: Pending` | kubelet | Bound, but containers are not created yet. Not `Running`. |
| `status.conditions` `PodScheduled: "True"` | kube-scheduler | Placement recorded. Says nothing about container start or readiness. |
| `resources.limits` | Pod author | Enforced at runtime by kubelet and kernel. Not used for fit. |

Fixture simplifications: the bench prints `nodeName: ""` before assignment, where a real object omits the empty field. Real condition entries also carry timestamps and `observedGeneration`, and real status has more fields. `limits` is fixed at 2 CPU and 4Gi, which is at least every request the bench allows, so the spec stays valid. The image is a placeholder.

## Try these changes

1. **Filter the default fixture.** Keep Mixed bottlenecks, CPU request 600m, memory request 1024Mi. Press **1 · Filter budgets**. Expect node-a CPU short by 300m, node-b memory short by 512Mi, and node-c eligible · awaiting scoring with no number on any card. Press **2 · Score eligible nodes**. Expect node-c Score 22.50, then selected. Cause: each resource is checked against its own available budget.
2. **Break the tie.** Set Node budgets to Equal budgets / tie with the same request. Filter, then score. Expect all three docks at 22.50. The bench selects node-a by fixture rule; a real scheduler picks randomly among equal top scores.
3. **Exceed CPU everywhere.** Set Mixed bottlenecks and CPU request 1500m. Press **1 · Filter budgets**. Expect every dock rejected, **2 · Score eligible nodes** disabled, `PodScheduled` `False` in the manifest, and `spec.nodeName` still empty. A higher score cannot rescue a failed filter.
4. **Score beats a tight fit.** Set CPU 300m and memory 512Mi. Filter, then score. Expect all three docks eligible. node-c wins at 36.25, node-b scores 22.50, node-a scores 18.75. node-a has exactly enough CPU but the least spare capacity.
5. **Assign, then execute.** From the scored state press **3 · Record assignment**: `spec.nodeName` becomes node-c and `PodScheduled` is `True`, but the phase stays `Pending`. Press **4 · Simulate node execution**: the phase becomes `Running`, while the ChangeReport still says the Pod is not proven Ready.

## Misconceptions

- **"node-a is only using 100m CPU, so 600m must fit."** Usage and commitments are different numbers. node-a has 1700m of CPU requested out of 2000m, so only 300m is available for requests whatever its usage graph shows. The scheduler refuses placement on requests even when real usage is very low.
- **"Limits decide placement."** The scheduler uses requests to choose a node. Limits are enforced later by the kubelet and kernel.
- **"A high score can override a failed filter."** Filtering runs first. A dock that fails either resource is never scored.
- **"The name-order tie rule is how Kubernetes breaks ties."** It is a fixture rule. kube-scheduler picks randomly among equal top scores.
- **"Pending means the scheduler failed."** Pending also covers image pulls and container setup. Check `spec.nodeName` and conditions first.
- **"Running means the application serves traffic."** Running means bound with containers created. `Ready` is a separate condition that governs Service endpoints.

## Safe read-only observation

On a cluster you are authorized to inspect, substitute a real namespace, Pod name, and node name. These commands only read state:

```sh
kubectl get pod POD -n NAMESPACE -o wide
kubectl get pod POD -n NAMESPACE -o yaml
kubectl describe pod POD -n NAMESPACE
kubectl describe node NODE
```

- `get -o wide` shows the NODE column and phase. It shows where a Pod is, not why.
- `get -o yaml` shows the stored `spec.nodeName`, `status.phase`, and conditions. It does not show the scheduler's reasoning.
- `describe pod` shows conditions, container states, and events. Events such as scheduling failures expire, so a missing event proves nothing.
- `describe node` shows Allocatable and the summary of requests already on the node. Compare requests with Allocatable. It does not check taints, affinity, or other constraints for a specific Pod.
- `kubectl top` reports usage, which needs metrics-server. It is not a feasibility calculation.

Limits of this evidence: these are snapshots taken at different moments, and scheduler state can change between reads. A recorded assignment does not prove containers started. A request-only calculation does not rule out other placement constraints.

## Predict and transfer

In the mixed fixture, set the Pod to **300m CPU / 512Mi memory**. Before filtering, predict which docks qualify and which the score selects. Then change memory alone to **3072Mi**: can any high score compensate?

Reveal: all three docks qualify at 300m / 512Mi, and node-c wins the fixture score at 36.25. At 3072Mi every node fails memory, so nothing is selected. Transfer the reasoning to a real Pod: list every hard constraint and eliminate infeasible nodes before comparing any survivors.

Continue with [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement) and [Scheduling, resources, and health probes](/learn/scheduling-resources-health).

## Assumptions and limits

- One Pod with one ordinary application container and explicit nonzero CPU and memory requests. Not modeled: init containers, restartable sidecars, Pod overhead, Pod-level `spec.resources` (beta and enabled by default in the resource-management docs), and the effective request accounting they change.
- Three schedulable nodes with static Allocatable and existing requests. No competing bindings, preemption, autoscaling, node loss, or scheduler cache timing.
- All other filters pass here: taints, affinity, topology spread, volumes, ephemeral storage, extended resources, and Pod-count limits.
- The score is one authored term, not the default plugin set or weights.
- Binding and node execution are fixture steps, not API calls, and both are assumed to succeed when pressed.
- In-place resize (stable since v1.35 in the lifecycle docs) is not modeled. The bench treats any edited request as a fresh unassigned Pod. No Pod is moved, deleted, or checked for readiness.

## Authoritative sources

- [Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/): filtering, scoring, the highest-score choice, random choice among equal top scores, and binding.
- [Scheduler Configuration](https://kubernetes.io/docs/reference/scheduling/config/): `NodeResourcesFit` scoring strategies, with `LeastAllocated` as the default.
- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/): requests drive scheduling, units, and limits enforced by the kubelet.
- [Reserve Compute Resources for System Daemons](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/): Node Allocatable and the scheduler treating it as capacity for Pods.
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/): `Pending`, `Running`, binding, and containers.
- [Pod Conditions](https://kubernetes.io/docs/concepts/workloads/pods/pod-condition/): `PodScheduled` and `Ready`.

Documentation reviewed against these pages on 2026-10-12. This is a documentation review, not observed cluster execution or browser verification.
