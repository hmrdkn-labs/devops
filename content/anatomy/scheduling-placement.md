## Problem: idle does not mean schedulable

A node's usage graph can look quiet while its requested capacity is already committed. The scheduler needs a place that can satisfy the incoming Pod's declared requests, not merely a node with a low instantaneous CPU reading. The bench separates **possibility**, **choice**, **assignment**, and **execution**.

This is an original, deterministic teaching fixture. No control sends a cluster command, observes a live cluster, or saves progress. The cartridge is an accounting token for a Pod object, not a container physically moving between nodes.

## Read the capacity comparators

Each dock has two rulers: CPU at the back, memory in front. A ruler's complete span represents that node's **allocatable** resource budget. Its occupied shoe represents requests already accounted to that node. The incoming request jaw measures backward from the far end: if it overlaps the occupied shoe, the request cannot fit. Equality fits; there is no requirement to leave an extra unmodeled margin.

For each resource independently:

```text
available request budget = allocatable − existing requests
feasible if incoming CPU ≤ available CPU
        AND incoming memory ≤ available memory
```

The mixed-budget fixture gives these starting values:

| Node | Allocatable CPU / memory | Existing requests | Available request budget |
| --- | --- | --- | --- |
| node-a | 2000m / 4096Mi | 1700m / 2048Mi | 300m / 2048Mi |
| node-b | 2000m / 4096Mi | 800m / 3584Mi | 1200m / 512Mi |
| node-c | 2000m / 4096Mi | 1000m / 2048Mi | 1000m / 2048Mi |

With the initial request of **600m CPU and 1024Mi memory**, node-a fails CPU, node-b fails memory, and node-c passes both. Allocatable is already the budget for Pods after node reservations; do not subtract system reservations a second time. Existing requests are not current usage and do not mean that all that memory has physically been allocated.

CPU `1000m` means one CPU unit; memory `1024Mi` means one GiB. These are different dimensions. Spare memory cannot pay for missing CPU.

## Controls and ownership

| Control | Model transition | Owning actor / meaning |
| --- | --- | --- |
| CPU request, memory request, node budgets | A fresh unassigned fixture; prior choice is discarded | Author changes inputs, not a running Pod's location |
| Filter budgets | Created → filtered, or no eligible nodes | kube-scheduler evaluates both resource constraints |
| Score eligible nodes | Filtered → selected; carriage aligns with the chosen dock | kube-scheduler chooses only among feasible nodes |
| Record assignment | Selected → assigned; cartridge enters the dock | Scheduler binding records the node through the API server |
| Simulate node execution | Assigned → running; execution latch rises | Separate kubelet/container-runtime work, assumed successful here |
| Replay current requests | Return to created with the same inputs | Replay of this fixture, not deleting or moving a real Pod |
| Reset | Restore mixed budgets and 600m / 1024Mi | Fresh initial fixture |

Controls are unavailable while a pose settles. A transition readout identifies the work in progress; the stable readout commits the resulting phase only when the mechanism arrives. Reduced-motion preference jumps directly to that stable target. There is no idle tour.

**Created is not assigned; assigned is not running.** The selected state still has an empty `nodeName`. The assigned state explicitly says containers have not started. The final execution step is intentionally separate, and even its successful `Running` fixture state does not prove application readiness or successful user transactions. Real assigned Pods may remain `Pending` while images, volumes, networking, or container setup are unresolved.

## Choice is an illustrative policy, not Kubernetes configuration

After filtering, this bench ranks each eligible node by its average normalized slack **after** accepting the request:

```text
score = 50 × (
  (available CPU − requested CPU) / allocatable CPU
  + (available memory − requested memory) / allocatable memory
)
```

The highest score wins. The computation uses full precision; the displayed score rounds to two decimals. An exact tie chooses lexicographically by node name: node-a, then node-b, then node-c. Choose **Equal budgets / tie** to inspect that deterministic decision.

This policy is authored solely to make the filter/score boundary reproducible. Real kube-scheduler scoring depends on its configured plugins and weights, and the public scheduler overview describes random selection among equal highest scores. The bench's name-order tie rule is **not** a claim about default Kubernetes behavior.

Set CPU to **1500m** in the mixed fixture and filter: every dock rejects the Pod. No scoring or forced assignment follows; the Pod remains unscheduled. Reducing the request or changing node budgets creates another fixture that can be evaluated again. A higher preference or score cannot rescue a hard resource failure.

## Assumptions and analogy limit

- One incoming Pod with one ordinary application container and explicit nonzero CPU/memory requests. No init containers, restartable sidecars, Pod overhead, or Pod-level resource budget is modeled. Those require the real effective Pod-request accounting, not blindly summing this fixture's numbers.
- Three healthy schedulable nodes, static allocatable values, and static existing requests. No competing bindings, preemption, autoscaling, node loss, or scheduler cache changes during a decision.
- All other hard constraints pass: taints, labels/affinity, topology, volume rules, extended resources, ephemeral storage, and Pod-count limits are outside this bench.
- Selecting a node is not an API binding. Binding is assumed successful in its explicit step. Node execution is also assumed successful only when its separate button is pressed.
- Rails and sockets visualize accounting and ownership. Kubernetes does not transport a live Pod along a rail or implement CPU and memory as physical ruler lengths. Changing a request here does not demonstrate in-place Pod resize or live migration.

## Misconception to remove

“node-a is only using 100m CPU, so a 600m request must fit” mixes usage with commitments. In this fixture node-a has only **300m available for requests**, regardless of its usage graph. Resource limits govern runtime enforcement; they do not replace resource-request feasibility.

A `Pending` phase alone is also not proof of a scheduler failure. Check assignment and conditions first. Once `spec.nodeName` is present, investigate node-side setup instead of assuming the scheduler still owes a placement.

## Practical read-only observation

On a cluster you are authorized to inspect, substitute a real namespace, Pod name, and node name:

```sh
kubectl get pod POD -n NAMESPACE -o wide
kubectl describe pod POD -n NAMESPACE
kubectl describe node NODE
```

These commands read state; this page does not execute them. `get pod` exposes assignment and phase. `describe pod` exposes conditions, waiting reasons, and events, including scheduling failures such as insufficient CPU or memory. `describe node` exposes allocatable resources and the allocated-resource request summary. Compare **requests** with **allocatable**, rather than using `kubectl top` as a feasibility calculation.

Limits of the evidence: these are snapshots, events can expire, and scheduler accounting can change between reads. A missing event does not prove success; a recorded assignment does not prove containers started; a request-only calculation does not rule out other placement constraints. Effective Pod requests can include accounting not modeled by the bench.

## Predict, then transfer

In the mixed fixture, change the Pod to **300m CPU / 512Mi memory**. Before filtering, predict which docks qualify and which the authored score chooses. Then change memory alone to **3072Mi**: can any high score compensate?

Reveal: all three qualify for 300m / 512Mi. node-c wins the illustrative slack score; node-a has exactly enough CPU but less normalized spare CPU. At 3072Mi, every node fails memory, so there is no selected node. Transfer the reasoning to a real Pod: write every hard constraint before ranking any surviving candidates.

Continue with [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement) and [Scheduling, resources, and health probes](/learn/scheduling-resources-health).

## Authoritative public sources

- [Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/): filtering, scoring, binding, unscheduled Pods, and actual tie behavior.
- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/): requests, limits, resource units, and scheduling accounting.
- [Reserve Compute Resources for System Daemons](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/): Node Allocatable and reservations.

Public claims reviewed against these sources on 2026-10-11. This source review is not a claim of observed cluster execution or browser verification.
