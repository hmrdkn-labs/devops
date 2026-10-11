## The problem: a preference cannot make a node possible

A Pod can ask for SSD-labelled nodes and prefer a particular zone. Those requests answer different questions: **may this node accept the Pod?** and **which acceptable node is more attractive?** Mixing them up turns a useful preference into an imaginary override.

The sorter is an authored fixture, not a live cluster observation. Label cards represent node metadata; paired feelers represent hard checks; a score plunger represents the raw contribution of one preferred rule. The accent cartridge represents one Pod assignment. It is not a Pod travelling between real machines. Kubernetes has no physical sorter, and animation duration says nothing about scheduling latency.

## Actors and ownership

- A workload author puts `nodeSelector` and `affinity.nodeAffinity` in the Pod specification (often through a controller's Pod template).
- Node administrators and infrastructure components maintain node labels. A label is metadata, not proof that the named hardware or security property is trustworthy.
- The scheduler evaluates unscheduled Pods against node information, filters infeasible candidates, scores feasible candidates, and records an assignment through the API.
- The assigned node's kubelet and container runtime handle execution. **Selecting or assigning a node does not start containers.** The final start button simulates that separate actor; it does not invoke a real kubelet.

## Read the rules in the right order

`nodeSelector` is a map of exact key/value matches. If it contains several entries, a node must match all of them. Here it contains either `disk: ssd`, `disk: hdd`, or no selector.

`requiredDuringSchedulingIgnoredDuringExecution` is another hard constraint. Within a `nodeSelectorTerm`, the illustrated `matchExpressions` are **AND** conditions. Across terms, they are **OR** alternatives. The richer language also supports operators such as `NotIn`, `Exists`, `DoesNotExist`, `Gt` and `Lt`; this fixture deliberately uses only `In`.

The combined hard predicate is:

```text
request capacity passes
AND nodeSelector passes
AND at least one required-affinity term passes
```

An absent required affinity imposes no affinity filter. The control labelled **None** means the required section is omitted, not a required section containing an empty term. The page does not model malformed specifications.

For the default `(east AND ssd) OR west` rule, the original required section is:

```yaml
# Fragment of a Pod spec; illustrative, not submitted by this page.
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: zone
              operator: In
              values: [east]
            - key: disk
              operator: In
              values: [ssd]
        - matchExpressions:
            - key: zone
              operator: In
              values: [west]
```

The second term does not cancel the Pod's separate `nodeSelector`. If the selector needs SSD, a west-labelled HDD node still fails that selector.

`preferredDuringSchedulingIgnoredDuringExecution` adds preference, not permission. For each matching preferred rule, the scheduler's node-affinity scoring process accumulates its weight (1–100). Actual scheduling also involves score normalization, configured plugin weights, other scoring plugins, and other constraints. The sorter shows **only a raw preferred-rule contribution**. It assumes all other score contributions are equal and picks the alphabetically first node on a tie. Neither its score values nor tie rule are a prediction of a real cluster's final decision.

## Controls and causal transitions

The initial Pod is created but unassigned. Candidate cards preview the current hard predicates and preferred contributions; the mechanism has not performed its stepped pass yet.

| Control | What changes |
| --- | --- |
| nodeSelector: disk | Exact-match hard constraint, combined with required affinity |
| Required affinity | No required rule, one AND term, or two OR alternatives |
| Preferred zone and weight | Raw score contribution for eligible nodes only |
| C has request capacity | A separate feasibility condition; affinity cannot override it |
| Step placement | Filter, then score, then assign; zero eligible nodes remain unscheduled |
| Simulate kubelet start | Advances an assigned Pod to the fixture's running state |
| Change running-node labels | Changes its node to `disk=archive`, `zone=retired`; preserves the running assignment |
| Replay same rules / Reset | Returns the fixture to an unassigned Pod with the current rules / default rules |

During apparatus travel, actions are disabled to avoid overlapping transitions. The cartridge lifts clear of the label cards, crosses the rail, then settles over its chosen bed. Hard-check feelers lift for matching constraints with capacity; preference plungers rise only after the scoring step. The live readout reports a transition until the physical parts settle. Reduced motion moves directly to the stable target. Replay represents a fresh scheduling exercise, **not rescheduling the same running Pod**.

## Three useful experiments

1. **Default rules:** A has `disk=ssd, zone=east`; B has `disk=ssd, zone=west`; C has `disk=hdd, zone=east`. A and B pass. B gets the west preference and is assigned. The next step simulates node-side start.
2. **Contradictory hard rules:** Select `hdd`, require `east AND ssd`, and keep any preference at any weight. C passes the selector but fails required affinity; A passes affinity but fails the selector; B fails both. No candidate remains, so no score or assignment can rescue the Pod.
3. **Preference without a match:** Select `hdd`, choose no required affinity, and prefer west. With capacity available, C is eligible with zero preferred contribution and can still be assigned. Switch off C's request capacity: C is rejected too. Preferences do not override resource feasibility.

## The execution boundary: labels change, assignment stays

After the default Pod is running on B, press **Change running-node labels**. B no longer matches the selector or required terms. Its current candidate card reports rejection for a hypothetical new scheduling attempt, but the cartridge and running readout stay on B.

`IgnoredDuringExecution` means node-label changes do not themselves evict an already scheduled Pod under these affinity rules. It does not promise eternal availability, prevent deletion, or disable other eviction mechanisms. The scheduler does not continuously migrate running Pods to the currently best-labelled node. A future replacement Pod must satisfy the current hard constraints in its own scheduling attempt.

## Practical observation, without changing a cluster

If you have authorized read access, inspect node labels and an existing Pod:

```sh
kubectl get nodes -L disk,zone
kubectl get pod POD_NAME -n NAMESPACE -o yaml
kubectl describe pod POD_NAME -n NAMESPACE
```

Compare the Pod's `spec.nodeSelector`, `spec.affinity.nodeAffinity`, `spec.nodeName`, `PodScheduled` condition, and scheduling events. An empty `nodeName` with scheduling failures points to an assignment problem; an assigned Pod can still be Pending for node-side reasons. Labels are current snapshots, not a record of the labels used at an earlier assignment. Events may expire and do not expose every plugin score. A Running phase alone is not proof of application readiness. These commands are suggestions only; the page never executes them.

**Tip:** Write every hard predicate before considering any preference. For production label keys, establish an administrator-owned naming convention and the trust boundary for who can alter labels; do not treat an arbitrary `disk=ssd` label as verified hardware or a security guarantee.

## Predict and transfer

A fourth node D has `disk=hdd, zone=west` and sufficient request capacity. Keep `nodeSelector: disk=ssd`, required `(east AND ssd) OR west`, and preferred west weight 100. Is D eligible? Would increasing its preference make it eligible?

<details>
<summary>Reveal the reasoning</summary>

No. D matches the west required term and the preferred zone, but fails the separate SSD selector. It is excluded before scoring. Raising a preference cannot fix a failed hard condition. If you remove the selector, D becomes feasible under the stated capacity and rule assumptions; it then competes with other feasible nodes rather than gaining guaranteed placement.

</details>

## Canonical learning links and public references

This page supports [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement/): objectives `fpp:kubernetes-scheduling-placement/feasibility` and `fpp:kubernetes-scheduling-placement/policy`. It records no completion, mastery, or retention evidence.

Public semantic review: 2026-10-11. This date records documentation review, not a live cluster test.

- [Kubernetes — Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/): selector/affinity combination, AND/OR semantics, preference weights, and IgnoredDuringExecution.
- [Kubernetes — Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/): label metadata and matching semantics.
- [Kubernetes — Scheduling Framework](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/): filtering, scoring, normalization, and binding boundaries.
