# KCNA Scheduling quiz companion

Scheduling is the bridge between **declared Pod intent** and **a kubelet being able to run that Pod on one specific node**. The easiest way to get lost is to memorize every placement field independently. Keep one path in your head first:

```text
Pod exists with no node assignment
        │
        ▼
kube-scheduler notices it
        │
        ▼
filter impossible nodes
        │
        ▼
score the feasible nodes
        │
        ▼
bind the Pod to one node
        │
        ▼
kubelet on that node executes the Pod
```

The scheduler chooses placement. It does **not** start containers. The kubelet and container runtime own node-side execution after placement is recorded through the API.

## How to use this companion

The resource/probe and placement units already introduce requests, limits,
affinity and taints. Use the table below as a reference, then focus here on
direct assignment, admission policy, static-Pod ownership and named schedulers.
The worked cases are authored datasets, not observations from a running cluster.
Predict each answer before reading its explanation; no cluster is required.

## Reference scan

| If the question is about... | Think... |
| --- | --- |
| Pod has no node yet | scheduler work is still needed |
| `.spec.nodeName` | direct node assignment; normal scheduler selection is bypassed |
| Labels | metadata attached to objects |
| Selector | a rule that chooses objects by labels |
| `nodeSelector` | simple hard node-label match |
| Required node affinity | richer hard node-label rule |
| Preferred node affinity | scoring preference, not a guarantee |
| Taint | node repels Pods that do not tolerate it |
| Toleration | removes a matching taint as a rejection reason; does not attract the Pod |
| CPU/memory request | scheduling reservation/feasibility input |
| CPU/memory limit | runtime consumption boundary |
| LimitRange | per-object defaults/min/max policy inside a namespace |
| ResourceQuota | aggregate namespace consumption/object-count budget |
| DaemonSet | controller wants one Pod on each eligible node |
| Static Pod | kubelet directly owns a Pod from node-local/static configuration |
| `schedulerName` | select which scheduler/profile should handle the Pod |
| `priorityClassName` | resolve a Pod priority value that affects queue order and can affect preemption |
| Scheduler profile | one kube-scheduler process can expose different scheduling behavior under different names |

## 1. The scheduling decision path

An ordinary Pod is created without `.spec.nodeName`. The default scheduler watches for Pods that still need placement.

For each candidate node, Kubernetes scheduling can be simplified into three questions:

1. **Filter:** can this Pod run here at all?
2. **Score:** among the feasible nodes, which one is preferable?
3. **Bind:** record the chosen node for the Pod.

Filtering can reject a node because of insufficient requested CPU or memory, required affinity or selector mismatch, an untolerated taint, topology constraints, or other hard policy. Scoring only matters after at least one feasible node remains.

```text
Node A: resource fit ✗     ┐
Node B: required label ✗   ├─ filter → rejected
Node C: all hard rules ✓   ┘

only feasible nodes → score → bind
```

After binding, the kubelet on the selected node observes the assigned Pod and asks the container runtime to make the containers run.

### Evidence ladder

| Question | Small proof |
| --- | --- |
| Is the Pod assigned? | `kubectl get pod <name> -o wide` |
| Why is it still Pending? | `kubectl describe pod <name>` and scheduling events |
| What placement fields are live? | `kubectl get pod <name> -o yaml` |
| What labels/taints/capacity does a node expose? | `kubectl describe node <name>` |

`Pending` alone does not prove scheduling failed: an assigned Pod can still be
waiting for image download or container setup. Check `.spec.nodeName`, the
`PodScheduled` condition and events first. API admission rejection is earlier:
the new Pod may never be stored. A controller can report `FailedCreate` while
its attempted Pod creation is rejected by namespace policy.

## 2. Direct assignment is different from scheduler policy

`nodeSelector`, node affinity, taints, resource requests, and topology constraints are **inputs to scheduler reasoning**. `.spec.nodeName` is different: it directly assigns a Pod to a named node and bypasses ordinary scheduler selection.

That distinction matters because a direct assignment can skip normal `NoSchedule` filtering. It does not make the chosen node healthy or magically create capacity. `NoExecute` taints can still cause the Pod to be evicted if it lacks the required toleration.

The Binding API represents the act of assigning a Pod to a node. It is normally used by scheduling machinery; manually constructing bindings is an exceptional path, not a replacement for normal workload policy.

## 3. Labels, selectors, `nodeSelector`, and affinity

Labels describe objects. Selectors choose objects by those labels.

For placement:

- `nodeSelector` is a simple exact-match hard requirement against node labels.
- `requiredDuringSchedulingIgnoredDuringExecution` node affinity is also hard, but supports richer expressions such as `In`, `NotIn`, `Exists`, and `DoesNotExist`.
- `preferredDuringSchedulingIgnoredDuringExecution` is a weighted preference. A nonmatching node can still be chosen if it remains feasible and wins after scoring.

The `IgnoredDuringExecution` part is important: if a node label later changes so that a running Pod no longer matches its scheduling-time node affinity, Kubernetes does not automatically evict that Pod just because of this rule.

## 4. Taints and tolerations: repel versus allow

Taints live on nodes. Tolerations live on Pods.

```text
node taint = dedicated=gpu:NoSchedule

Pod without toleration → node rejected
Pod with toleration    → node may be considered
```

The three common taint effects are:

- `NoSchedule`: do not place new non-tolerating Pods there.
- `PreferNoSchedule`: try to avoid placing non-tolerating Pods there.
- `NoExecute`: also evict already-bound Pods that do not tolerate the taint, subject to toleration behavior.

A toleration is **permission**, not attraction. If you want a Pod both to tolerate a dedicated GPU node **and** to require that class of node, combine the taint/toleration with node labels plus node affinity or a selector.

Taints and tolerations are scheduling policy, not a security boundary.

A matching `NoExecute` toleration with `tolerationSeconds: 60` delays eviction
for 60 seconds after the taint is added; it does not promise indefinite residence.
Removing the taint before expiry prevents eviction because of that taint.

## 5. Requests, limits, LimitRange, and ResourceQuota

Keep four different responsibilities separate.

| Mechanism | Scope | Main question |
| --- | --- | --- |
| Request | container/Pod scheduling calculation | How much capacity must the node reserve for placement? |
| Limit | container runtime enforcement | How much of this resource may the container consume? |
| LimitRange | namespace admission policy for individual objects | What defaults/min/max ratios are acceptable per object? |
| ResourceQuota | namespace aggregate policy | How much total resource/object budget may this namespace consume? |

For CPU, reaching a configured limit normally means throttling. For memory, exceeding the cgroup memory limit can lead to OOM termination.

The scheduler reasons primarily from requests and node allocatable capacity, not from a dashboard's instantaneous utilization graph. This is why a node can look idle but still reject a Pod whose request would exceed the remaining schedulable capacity.

If a resource limit is set without a request, and admission has not supplied a
default request, Kubernetes copies that limit into the request. Inspect the
stored Pod, not only the submitted YAML. Runtime requests are accounting inputs;
they are not a promise that observed usage stays below the requested amount.

### Worked case: classify the failed boundary

This authored dataset assumes ordinary single-container CPU requests and no
other hard constraints. A Pod requests `600m`, requires `zone=east`, tolerates
no taints, and prefers `zone=west`. Existing request totals include node agents.

| Node | Labels | Allocatable CPU | Existing requests | Taint |
| --- | --- | --- | --- | --- |
| A | zone=east | 2000m | 1500m | none |
| B | zone=west | 2000m | 500m | none |
| C | zone=east | 2000m | 1100m | dedicated=gpu:NoSchedule |

Write which nodes survive before reading on. A has `2000−1500=500m`, less than
`600m`. B has `1500m` spare but fails the required label. C has `900m` spare but
fails the taint rule. No feasible node remains; scoring cannot rescue B.

On a real cluster, `kubectl get pod <name> -o yaml` exposes stored requests,
selectors, tolerations and assignment. `kubectl describe node <name>` exposes
allocatable, allocated requests, labels and taints. `kubectl describe pod <name>`
can show `FailedScheduling`. These fields test the explanation; a low CPU graph
alone does not. Event wording and aggregation can vary.

Variant: lower the request to `400m`. A becomes feasible; B and C still fail.
Variant: keep `600m` and add C's matching toleration. C becomes feasible. Neither
change guarantees containers start: binding and node-side setup still follow.

### Worked case: policy acts before placement

Assume a namespace has no LimitRange, and admission supplies no default request.
Its ResourceQuota hard limit for `requests.cpu` is `2000m`, with `1500m` used.
A new Pod specifies only a CPU limit of `700m`. Predict the stored request and
whether there will be a new Pod for the scheduler to place.

The effective request is `700m` because the omitted request is copied from the
limit. Namespace usage would become `1500+700=2200m`, exceeding `2000m`.
Admission rejects this create request; it does not create an unscheduled Pod.
The create error and `kubectl get resourcequota -o yaml` test quota admission;
querying the new Pod name tests whether creation succeeded. A scheduler event
cannot explain an object that was never stored.

Variant: set an explicit request of `400m` with the same `700m` limit. Quota
accounting becomes `1900m`, so this quota permits creation, assuming all other
admission checks pass. The scheduler must still find capacity using `400m`.
If instead a LimitRange defaults the missing request to `300m`, inspect that
admitted value: the limit-copy fallback does not override an admission default.

## 6. DaemonSet and Static Pod are different ownership models

They can both produce node-local Pods, but the control path is completely different.

### DaemonSet

```text
DaemonSet object
    │
    ▼
DaemonSet controller decides eligible nodes
    │
    ▼
Pod objects are created
    │
    ▼
default scheduler normally binds each Pod
    │
    ▼
kubelet executes on target node
```

Use DaemonSets for node agents such as log collectors, monitoring agents, CNI/node plugins, or storage/node components that should run on all or selected eligible nodes.

### Static Pod

```text
node-local static Pod manifest/config
    │
    ▼
kubelet watches it directly
    │
    ▼
kubelet starts/restarts the Pod
    │
    └──► mirror Pod may appear in the API for visibility
```

A static Pod is bound to one kubelet and does not depend on a workload controller or normal scheduler. Deleting its mirror Pod through the API does not delete the underlying static Pod; the kubelet recreates the mirror record. kubeadm commonly runs control-plane components as static Pods.

Static Pods are useful for bootstrap/control-plane cases. They are not a general substitute for DaemonSets and have important limitations, including inability to refer to normal API objects such as ConfigMaps, Secrets, or ServiceAccounts in the same way ordinary Pods do.

For API-side ownership evidence, inspect `metadata.ownerReferences` and the
controller owner's UID for a DaemonSet Pod. A static Pod's API mirror carries
`metadata.annotations["kubernetes.io/config.mirror"]`. `crictl ps` can show a
running container but does not alone prove who owns its Pod. These observations
identify different boundaries; do not delete control-plane Pods to test them.

## 7. Multiple schedulers and scheduler profiles

Most Pods use the default scheduler. Kubernetes can also run additional scheduler implementations or expose multiple scheduler profiles.

The Pod chooses a scheduler through:

```yaml
spec:
  schedulerName: my-scheduler
```

If no running scheduler handles that name, the Pod can remain unscheduled.

Running another scheduler is an operational responsibility, not just a Pod field.
The scheduler process needs API access to watch Pods and Nodes and to write the
placement it owns. In a highly available deployment, replicas of the same
scheduler commonly use leader election so only one active leader makes a given
scheduling decision at a time. At KCNA depth, remember the boundary: `schedulerName`
selects responsibility, while RBAC and leader election make that responsibility
safe to run as a control-plane service.

A `KubeSchedulerConfiguration` can define profiles. Profiles let one scheduler binary expose different behavior under different `schedulerName` values by enabling, disabling, or configuring scheduling plugins.

At KCNA depth, remember this hierarchy:

```text
Pod.spec.schedulerName
        │
        ▼
scheduler / scheduler profile
        │
        ▼
plugins participate in queueing, filtering, scoring, binding, and related extension points
```

You do not need to memorize every plugin. You should recognize examples such as
`PrioritySort` for queue ordering, `NodeAffinity`, `TaintToleration`,
`NodeResourcesFit`, `NodeUnschedulable`, `ImageLocality`, and `DefaultBinder`.
The point is that the scheduler framework composes a decision from plugins at
different extension points instead of applying one monolithic "best node" rule.

For orientation, the full framework is richer than the usual `filter → score → bind`
teaching shorthand. Useful extension points include `QueueSort`, `PreFilter`,
`Filter`, `PostFilter`, `PreScore`, `Score`, `Reserve`, `Permit`, `PreBind`,
`Bind`, and `PostBind`. The shorthand is still useful for first-pass reasoning;
the extension-point view explains where custom behavior can be inserted.

## 8. PriorityClass changes which Pending Pod gets attention first

`PriorityClass` is a cluster-scoped object that maps a name to an integer priority.
A Pod selects it with `spec.priorityClassName`. Admission resolves that name to a
numeric priority on the Pod, and kube-scheduler uses Pod priority when ordering
pending work in its scheduling queue.

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: platform-critical
value: 100000
globalDefault: false
description: "Higher scheduling priority for selected platform workloads"
---
apiVersion: v1
kind: Pod
metadata:
  name: api
spec:
  priorityClassName: platform-critical
  containers:
    - name: api
      image: example.invalid/api:1
```

Higher priority does **not** make an impossible node feasible. A high-priority Pod
still has to pass hard filters such as requests, required affinity, and taints.
Priority mainly changes which pending Pod is considered first. When preemption is
enabled and a higher-priority Pod cannot fit, the scheduler can also consider
evicting lower-priority Pods to make a suitable node feasible. Treat queue ordering
and preemption as separate ideas: priority influences both, but successful placement
still depends on the rest of the scheduling constraints.

```text
pending Pods
   │
   ├─ high priority ─┐
   ├─ normal         ├─ QueueSort / PrioritySort → next scheduling attempt
   └─ low priority ──┘
                           │
                           ▼
                     filter → score → bind
```

Evidence is simple: inspect the Pod's `priorityClassName` and resolved `.spec.priority`,
inspect the `PriorityClass` object, then use Pod events to see whether the remaining
problem is queue order, failed feasibility, or a preemption attempt.

## 9. Failure patterns worth recognizing

| Symptom | First model to test |
| --- | --- |
| `Pending` + `Insufficient cpu` | requests cannot fit any candidate node |
| `Pending` + node affinity mismatch | required placement rule removed candidates |
| `Pending` + untolerated taint | matching toleration is missing |
| `Pending` + custom `schedulerName` | is a scheduler/profile with that name actually running? |
| high-priority Pod still `Pending` | priority changes queue/preemption behavior; inspect the hard filters that still make nodes infeasible |
| Pod forced with `nodeName` but fails on node | direct assignment bypassed normal selection; inspect node/runtime constraints |
| DaemonSet missing from one node | inspect eligibility, node affinity, taints, resources, and DaemonSet status |
| Static control-plane Pod returns after API deletion | kubelet still owns the node-local static Pod manifest |

## Before you answer a scheduling MCQ

Ask in this order:

1. Is this field a **hard filter**, a **preference**, or a **direct assignment**?
2. Does it live on the **Pod**, the **Node**, a **controller**, or scheduler configuration?
3. Who makes the decision: API server, controller, scheduler, or kubelet?
4. Is the question about **queue order**, **node feasibility**, **node preference**, or **binding**?
5. What would prove the answer: live Pod assignment, priority, scheduler event, node metadata, or kubelet-owned static configuration?

If you can answer those five questions, most scheduling options stop looking interchangeable.
