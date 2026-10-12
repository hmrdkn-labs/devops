## The big picture

Ordinary Pods must stay off **node-a**, the node reserved for batch work, even when node-a has spare CPU. An administrator puts a **taint** on the Node: `dedicated=batch:NoSchedule`. A workload author gives the batch Pod a **toleration** in its Pod spec that matches that taint. The scheduler then decides with three independent questions: does the Pod tolerate node-a's taint, does node-a have enough free CPU for the request, and is node-a the best of the eligible candidates?

A toleration only **permits** a node. It does not attract the Pod to that node, reserve capacity on it, or guarantee assignment. Assignment is still not Running. Attraction by labels is a separate mechanism, covered in [Node affinity](/anatomy/node-affinity/), and resource feasibility is a separate filter, covered in [Scheduling and placement](/anatomy/scheduling-placement/).

The apparatus above is an original teaching fixture, not a recording of a cluster. Its two inspection lanes are two candidate nodes, **node-a** (rear, batch-reserved) and **node-b** (front, alternate). The highlighted cartridge is one unassigned Pod, `report-batch-N`. A change made before any run edits that pending Pod in place. After a run, the next change creates a new unassigned Pod with the next name. A bound Pod is never migrated.

## Who owns what

- **Cluster administrator** (or a tool acting for one) sets taints on the Node object. The taint restricts every Pod that would be placed on that node.
- **Workload author** writes tolerations in the Pod spec, often through a controller's Pod template. The toleration grants permission for one taint; it does not choose a node.
- **kube-scheduler** watches for unassigned Pods, filters candidate nodes against hard requirements (taints and resource requests here), scores the survivors, and binds the winner by recording the decision with the API server. It does not start containers.
- **kubelet and container runtime** on the chosen node start the containers. Running and Ready come from that node's work, not from the scheduler.

## How it works

1. **Pod created, unassigned.** `spec.nodeName` is unset. The Pod requests 600m CPU and 256Mi memory. The scheduler reads node taints and Pod tolerations only when it filters.
2. **Taint filter on node-a.** The toleration is compared with the taint field by field. `key` must equal `dedicated`, or be empty (only with `Exists`). With `Equal`, `value` must equal `batch`; with `Exists`, the value is not compared. `effect` must equal `NoSchedule`, or be empty to match any effect. The taint is tolerated only when no field mismatches. An untainted node passes without any toleration.
3. **Capacity filter on node-a, independent of step 2.** The request is compared with free allocatable CPU: 800m when enough, 400m when not. The fixture computes this verdict even when the taint blocks, so the two outcomes are separate. Requests, not live usage, drive the decision.
4. **Node-b, if present.** It is untainted with 1000m free, so it is eligible. Among eligible nodes the fixture's fixed score picks node-b (20 against node-a's 10). No toleration adds score.
5. **Binding or no placement.** A winner is bound by writing `spec.nodeName`. If no node is eligible, the Pod stays Pending; the scheduler does not force it onto a rejected node.
6. **Not yet.** Assigned is not Running. The kubelet on node-a would start the container after binding. The fixture never shows container startup.

The cartridge stops at the first closed gate for node-a, which is a teaching shortcut. The check order is not plugin order.

## YAML example

The fixture renders these two manifests from its state. This is the matching configuration: node-a tainted, the Pod's toleration `Equal`, and 800m free. The Node block is read back from the API, not something you apply; `status` is written by the cluster. The Pod block is a valid manifest.

```yaml
apiVersion: v1
kind: Node
metadata:
  name: node-a
spec:
  taints:
  - key: dedicated       # field 1 the taint filter compares
    value: batch         # field 2; compared only for Equal tolerations
    effect: NoSchedule   # field 3; NoSchedule is the only effect modelled
status:
  allocatable:
    cpu: 2000m
  # fixture only: other Pods request 1200m of the 2000m, so 800m is free
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: report-batch-1
spec:
  tolerations:           # permission only; never a placement instruction
  - key: dedicated       # must equal the taint key, or be empty with Exists
    operator: Equal      # Equal compares value; Exists must omit value
    value: batch
    effect: NoSchedule   # must equal the taint effect, or be empty
  containers:
  - name: report
    image: registry.example.com/report:1.4
    resources:
      requests:
        cpu: 600m        # compared with free CPU by the capacity filter
        memory: 256Mi
```

The fields that drive the figure are the taint's `key`, `value` and `effect`; the toleration's `key`, `operator`, `value` and `effect`; and `requests.cpu` on the Pod, compared with the free CPU in the Node's status. The fixture's comment stands in for the sum of other Pods' requests. After a run, the Pod panel adds `#` comments with each field's verdict and highlights the fields of each failed check; when every check passes, it highlights every compared field.

## Try these changes

1. **No toleration, then Run placement.** The taint row fails with "no toleration", the CPU check still passes, and node-a is not chosen. Expected: the Pod remains unassigned (Pending). Expected change report: taint rejects, capacity fits.
2. **Equal, then Run placement.** Every field row matches and the Pod is bound to node-a. Expected: `spec.nodeName` is node-a, and the badge says assigned but not Running.
3. **Wrong effect: NoExecute, then Run placement.** The key and value match but the effect differs. Expected change report: "effect: Pod tolerates NoExecute, node-a taint is NoSchedule", and the Pod stays unscheduled.
4. **Equal, then uncheck "enough free CPU", then Run placement.** The taint check passes, and the capacity check fails separately. Expected: the Pod stays unscheduled, and the change report says the taint permits and CPU is short.
5. **Equal, then check "node-b present", then Run placement.** Both nodes are eligible and node-b wins the fixed score. Expected: `report-batch-N` is bound to node-b, and node-a's taint check still shows as passing. The toleration gave node-a no bonus.

## Misconceptions

- **Wrong:** "I added the toleration, so this Pod lands on the dedicated node." **Correct:** the toleration removes only that taint's objection. The capacity filter, other candidates and scoring still decide, so a tolerated node can still lose.
- **Wrong:** "A toleration attracts the Pod or reserves the node." **Correct:** a toleration permits. Attraction is a separate concern, expressed with node labels and affinity.
- **Wrong:** "`NoSchedule` evicts Pods already running on the node." **Correct:** NoSchedule affects new placements only. Eviction is the `NoExecute` effect, which this fixture does not model.
- **Wrong:** "An empty key or effect is harmless shorthand." **Correct:** an empty effect matches any effect for that key, and an empty key with `Exists` matches every key. These are advanced, broad permissions and should be used deliberately.
- **Wrong:** "Assigned means Running." **Correct:** binding sets `spec.nodeName`. The kubelet must still start the containers, and the Pod must become Ready.

## Safe read-only observation

Run these only against a cluster you are authorized to inspect. They read state and change nothing:

```sh
kubectl get node node-a -o jsonpath='{.spec.taints}{"\n"}'
kubectl get pod report-batch-1 -n NAMESPACE -o jsonpath='{.spec.tolerations}{"\n"}{.spec.nodeName}{"\n"}'
kubectl describe pod report-batch-1 -n NAMESPACE
kubectl describe node node-a
```

Compare the taint's and the toleration's `key`, `value` and `effect` field by field. The Pod's events can report an untolerated taint or insufficient CPU. The node description shows allocatable resources and requests already allocated. An empty `.spec.nodeName` supports "not assigned". A set value supports "assigned", not Running. `Pending` alone does not say which filter failed.

**Limit:** these are snapshots, and events expire. A matching toleration does not prove the other filters passed. Node summaries and separate API reads are not one atomic scheduler snapshot, and they cannot explain why a candidate lost the score.

## Predict and transfer

Node-a has `dedicated=batch:NoSchedule` and only 400m CPU free. The new Pod requests 600m and has `key: dedicated`, `operator: Exists`, `effect: NoSchedule`. Node-b is untainted with 1000m free.

**Prediction:** node-a passes the taint filter, because `Exists` does not test the value and the key and effect match. Node-a fails the CPU filter, which is independent of the toleration. Node-b remains eligible. The toleration does not prefer node-a. If node-b were absent, the Pod would remain unscheduled rather than being forced onto node-a.

Continue with [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement?mode=reference) and [the Scheduling quiz companion](/learn/kcna-scheduling-review?mode=reference). This explanation supports their existing feasibility and placement-policy objectives; exploring the object does not record mastery.

## Assumptions and limits

- **Scope is NoSchedule only.** The fixture does not model `NoExecute` (which evicts Pods already bound to a node: untolerated Pods are evicted, tolerated Pods stay, and `tolerationSeconds` bounds how long a tolerated Pod stays). It does not model `PreferNoSchedule`, which is a soft preference the scheduler tries to honour rather than a hard filter. It does not model the numeric `Gt` and `Lt` operators, which sit behind a feature gate.
- **One taint on node-a.** Real nodes can carry several taints, and any untolerated `NoSchedule` taint still excludes the node.
- **Fixture numbers.** Node-a has 2000m allocatable; other Pods request 1200m (800m free) or 1600m (400m free). Node-b is untainted with 1000m free. Memory fits on both nodes (1024Mi free, 256Mi requested). The Pod has one container and no overhead or init containers. There are no labels, affinity, topology, priority or preemption constraints.
- **Node names are shared across the scheduling section** (node-a, node-b), but the numbers here belong only to this fixture. [Scheduling and placement](/anatomy/scheduling-placement/) uses its own.
- **Score is illustrative.** The fixed score (20 against 10) is not a Kubernetes default or a prediction of real scoring plugins. Real plugin scores and tie handling are not modelled; the scheduler documentation describes choosing the highest-scoring feasible node.
- **Pod identity.** A change before any run edits the pending Pod and keeps its name. After a run, each change creates a new unassigned Pod with the next name. The fixture does not model editing or moving a bound Pod.
- **Scheduler bypass is out of scope.** Setting `.spec.nodeName` directly bypasses the scheduler, so NoSchedule is not a universal execution firewall.
- The model does not run cluster commands, persist learner data, or claim live verification.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) — matching rules, empty key and effect, NoSchedule, NoExecute, PreferNoSchedule, multiple taints, and the direct `nodeName` boundary.
- [Kubernetes: Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/) — filtering, scoring and binding.
- [Kubernetes: Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests drive scheduling, while limits are enforced later by the kubelet.
