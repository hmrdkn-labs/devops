## The problem: allowed is not selected

A node can have spare resources yet be inappropriate for a particular workload. A **taint** places a restriction on a node. A **toleration**, stored in a Pod specification, lets that Pod tolerate a matching restriction. It does not reserve resources, attract the Pod to that node, or guarantee assignment.

The apparatus above is an original teaching fixture, not a recording of a cluster. Its two inspection lanes stand for two candidate nodes. The first lifting blade represents the taint filter; the second is an independent resource filter. The highlighted cartridge is one newly created, unassigned Pod. Changing any condition starts a fresh placement scenario, not a migration of an already assigned Pod.

## Actors and ownership

- A cluster administrator or a Kubernetes component may set taints on a Node object. Workload authors specify tolerations in their Pod specifications, often through a controller's Pod template.
- The scheduler evaluates unassigned Pods against candidate nodes. Hard filters determine eligibility; scoring influences choice among eligible nodes; binding records the assignment.
- The node's kubelet and runtime handle container setup and execution after assignment. The scheduler does not start containers. **Created, assigned, and Running are different boundaries.**

The gate order makes the two conditions easy to inspect. It is not a claim about plugin execution order, nor a physical model of Kubernetes internals.

## Control-to-state map

Node A has the optional taint `dedicated=batch:NoSchedule`. The Pod requests **600m CPU** and **256Mi memory**. Available capacity here means allocatable capacity minus already committed requests, not current utilization.

| Control | What changes | Consequence |
| --- | --- | --- |
| Toleration profile | The Pod's one toleration, or its absence | A matching toleration removes this taint's objection; a wrong key, value, or effect does not |
| Node A: NoSchedule taint | Whether that one node taint exists | Removing it removes this taint filter's rejection, but does not change capacity |
| Node A: enough CPU | Available CPU for requests: 800m or 400m | 600m fits 800m, not 400m, regardless of toleration |
| Node B: available | Whether the untainted alternate candidate participates | B fits the requests and has the higher illustrative score |
| Attempt / Replay placement | Moves the Pod cartridge through the evaluated gates | Rejected candidates do not receive an assignment; selected candidates do |
| Reset | Restores absent toleration, tainted A, enough CPU, and unavailable B | The initial Pod is created but unassigned |

Controls temporarily disable while a finite movement settles. There are no timers racing a second placement attempt, and no automatic tour. Reduced motion reaches the same final state immediately.

### What counts as a match?

With `Equal`, the key and value must match. With `Exists`, the key must match but the value is not tested; do not supply a value for this operator. The effect must match unless the toleration's effect is empty, which matches all effects for the matching key/value condition. An empty key with `Exists` matches all keys and values, still subject to the effect condition.

For this fixture, the matching `Equal` profile is:

```yaml
tolerations:
  - key: dedicated
    operator: Equal
    value: batch
    effect: NoSchedule
```

The wrong-effect profile is deliberately `NoExecute`: it does **not** match a `NoSchedule` taint. A similarly spelled key is not a match either. The fixture exposes `Equal`, `Exists`, and their empty-key/effect cases; feature-gated numeric operators are outside its scope.

If a real node has several taints, a toleration for one does not erase the others. Any remaining untolerated `NoSchedule` taint still excludes the node from ordinary scheduler placement.

## Try three causal changes

1. Start with the absent toleration and attempt placement. Node A's first blade stays down, node B is unavailable, and the Pod remains **unscheduled**.
2. Choose **Matching Equal**, keep enough CPU enabled, and attempt again. Node A becomes eligible and is assigned. This means placement only, not proof that any container is Running.
3. Disable **enough CPU** with the matching toleration still present. The first blade opens, but the capacity blade closes. Without B, the Pod remains unscheduled. Now enable B: it can be assigned there instead.

Finally make both nodes eligible. B still wins the fixture's fixed score of 20 over A's 10. The toleration gives A no bonus. These scores are intentionally illustrative, not Kubernetes defaults or a prediction of a real scheduler's scoring plugins.

## Three effects, three different consequences

| Taint effect | Untolerated consequence | Existing Pods |
| --- | --- | --- |
| `NoSchedule` | Excludes the node from new ordinary scheduler placements | Does not itself evict Pods already there |
| `PreferNoSchedule` | A soft preference to avoid the node, not a hard prohibition | Does not itself evict Pods |
| `NoExecute` | Prevents new placement and also affects Pods already bound there | Untolerating Pods are evicted; matching tolerations can allow staying indefinitely or for `tolerationSeconds` |

The animation models **NoSchedule only**. It does not simulate eviction or a soft preference. For `NoExecute`, a matching toleration with no `tolerationSeconds` allows staying indefinitely with respect to that taint; a specified duration limits how long the Pod tolerates it. Removing the taint before that duration expires prevents eviction due to that taint. Other reasons for Pod termination still exist.

## Assumptions and analogy limits

Both candidate nodes are otherwise ready and schedulable. There is one optional taint on A, none on B, and no label, affinity, storage, topology, admission, priority, or preemption constraint. Memory always fits: 1024Mi available versus 256Mi requested. A's CPU availability is the independent variable; B, when enabled, has 1000m CPU available. The Pod has one simple container, without init-container accounting or Pod overhead.

B's unavailable switch is a fixture condition, not an invented Kubernetes taint. The model does not run cluster commands, persist learner data, or claim live verification. A cartridge arriving in a tray illustrates assignment; it does not show container startup or a running workload moving from one node to another. Directly setting `.spec.nodeName` bypasses the scheduler and is outside this fixture, so do not treat the NoSchedule blade as a universal execution firewall.

## Misconception and practical tip

**Misconception:** “I added the toleration, so this Pod must land on the dedicated node.”

**Correction:** The node can now survive that taint filter; it can still fail another hard condition or lose to another eligible candidate. For a dedicated-node policy, taints restrict who may enter while a selector or required node affinity can constrain where the intended workload may go. They answer different questions; neither manufactures CPU or memory capacity. Broad empty-key or empty-effect tolerations permit more than a narrowly scoped one, so use them deliberately.

## Safe read-only observation

Against a cluster you are authorized to inspect, these commands read state only:

```sh
kubectl get node NODE_NAME -o jsonpath='{.spec.taints}'
kubectl get pod POD_NAME -n NAMESPACE -o jsonpath='{.spec.tolerations}{"\n"}{.spec.nodeName}{"\n"}'
kubectl describe pod POD_NAME -n NAMESPACE
kubectl describe node NODE_NAME
```

Replace the names with real objects. Compare the complete taint and toleration fields. Pod events can report untolerated taints or insufficient resources; node description can show allocatable resources and allocated requests. A missing `.spec.nodeName` supports “not assigned”; a present value supports assignment, not Running. `Pending` alone does not distinguish unscheduled from assigned-but-waiting.

**Limit:** These are snapshots and events can expire. A toleration match alone cannot establish that every other filter passed. Node allocation summaries and separate API reads are not an atomic scheduler snapshot; they cannot prove why a candidate lost scoring. This page has not executed these commands against a live cluster.

## Predict and transfer

A has `dedicated=batch:NoSchedule` and only 400m CPU available. A new Pod requests 600m and has `key: dedicated`, `operator: Exists`, `effect: NoSchedule`. B is untainted and has 1000m available. Which nodes remain eligible, and does the toleration prefer A?

**Prediction:** A passes the taint check but fails CPU feasibility. B remains eligible. The toleration does not prefer A. If B is unavailable, the Pod remains unscheduled rather than being forced onto A. Now imagine adding the `NoSchedule` taint after an unrelated Pod is already running on A: that effect alone does not evict the existing Pod. Changing it to `NoExecute` would require a separate eviction analysis.

Continue with [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement?mode=reference) and [the Scheduling quiz companion](/learn/kcna-scheduling-review?mode=reference). This explanation supports their existing feasibility and placement-policy objectives; exploring the object does not record mastery.

## Authoritative sources

Public claim review: **2026-10-11**. This date records documentation review, not cluster observation.

- [Kubernetes: Taints and Tolerations](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) — matching rules, effects, multiple taints, and the direct-node-assignment boundary.
- [Kubernetes: Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — resource requests versus runtime usage and limits.
