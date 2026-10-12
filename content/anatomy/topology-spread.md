## The big picture

A replica count says how many Pods a workload has, not where they land. The scheduler places one unassigned Pod at a time, and each decision sees only the Pods that already exist. Nothing in that step prevents the next replica from joining the zone that already holds most of them. A **topology spread constraint** is the rule that bounds that drift: for each domain (a zone, a node, or another node label value), how far the count of matching Pods may sit above the lowest count.

Who sets what. The **workload author** writes `topologySpreadConstraints` in the Pod template, usually inside a Deployment. The **cluster**, through its administrator or cloud provider, puts the domain labels on Node objects. The **kube-scheduler** reads both when it places a Pod. Spreading counts Pods, not CPU or memory. Whether a node has room is a separate filter, covered in [Scheduling and placement](/anatomy/scheduling-placement/).

Spreading is a placement-time rule. It decides only where the next Pod may go. It never moves a Pod that is already placed, so a constraint can be violated after a scale-down or a node failure until new Pods are placed.

The apparatus above is an original teaching fixture, not a recording of a cluster. Two zone trays hold four node bays. A stacked cartridge is an assigned web Pod, and the stack height is the node's count. A depth strip along each bay's back edge lights one dot per assigned level, so a stack of two reads at a glance. The pending Pod is a dashed wireframe on the queue pad until it is bound. A bay's gate lies flat only when the spread filter passed that node in the last run; until then it stands upright.

## Who owns what

- **Workload author** writes the constraint in the Pod template. A ReplicaSet copies it into every Pod it creates from that template. A template change reaches Pods created afterwards, not Pods already running.
- **Cluster administrator or cloud provider** labels Nodes. `topology.kubernetes.io/zone` and `kubernetes.io/hostname` are the well-known keys. A node without the key is not part of that topology.
- **ReplicaSet controller** creates and deletes Pods to match the replica count. Deleting a Pod does not trigger a placement of the others.
- **kube-scheduler** counts the matching Pods per domain, filters with `DoNotSchedule`, scores with `ScheduleAnyway`, and binds the winner. It does not evict or move Pods to rebalance.
- **kubelet** starts the containers on the bound node. Spreading does not depend on it.
- **A descheduler** is an external project. It can evict Pods to rebalance, but Kubernetes does not do this by itself.

## How it works

1. **Pod created, unassigned.** It carries a constraint: `maxSkew`, `topologyKey`, `whenUnsatisfiable`, and a `labelSelector`. The fixture's Pod also carries the label it selects, so it counts itself.
2. **Domain of each candidate.** A node's domain is its value for the `topologyKey` label. A node without that label is skipped, and Pods on it do not count.
3. **Count.** For each domain, count the assigned Pods that match the `labelSelector`. The pending Pod is not counted yet.
4. **Global minimum.** The lowest count over eligible domains. If there are fewer domains than `minDomains`, the minimum is treated as 0.
5. **Filter with `DoNotSchedule`.** A candidate passes when its domain count plus one (the pending Pod) minus the global minimum is at most `maxSkew`. If no candidate passes, the Pod stays Pending. The figure's *current skew* is different: it is max minus min over the existing Pods, a readout the filter does not use.
6. **Score with `ScheduleAnyway`.** Nothing is rejected. Domains with fewer matching Pods score higher. That score is normalized with the scheduler's other scores, so it is a preference, not a guarantee.
7. **Bind or stay Pending.** The winner is recorded by writing `spec.nodeName`. Assigned is not Running. The kubelet starts the containers afterwards, and Ready is a separate state.
8. **No rebalance.** If a matching Pod is deleted, the counts fall and the skew can exceed `maxSkew`. Nothing moves until another Pod is placed or a descheduler acts.

## YAML example

The fixture renders the Pod manifest and the Node labels from its state. The Pod block is a valid manifest for the default constraint. The Node block lists the four Node labels that the spread reads, in a compact form for this fixture. The comments are for explanation; the panel shows the same fields and values.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web-4
  labels:
    app: web                              # the Pod's own labels; it counts itself because it matches
spec:
  topologySpreadConstraints:
  - maxSkew: 1                            # allowed gap: candidate count + 1 minus the global minimum
    topologyKey: topology.kubernetes.io/zone   # node label that defines the domain
    whenUnsatisfiable: DoNotSchedule      # a filter; ScheduleAnyway would only rank candidates
    labelSelector:
      matchLabels:
        app: web                          # which assigned Pods are counted
  containers:
  - name: web
    image: registry.example.com/web:1.0
```

```yaml
# fixture view: labels of the four Node objects
- name: node-a1
  labels:
    topology.kubernetes.io/zone: zone-a
    kubernetes.io/hostname: node-a1
- name: node-a2
  labels:
    topology.kubernetes.io/zone: zone-a
    kubernetes.io/hostname: node-a2
- name: node-b1
  labels:
    topology.kubernetes.io/zone: zone-b
    kubernetes.io/hostname: node-b1
- name: node-b2
  labels:
    topology.kubernetes.io/zone: zone-b
    kubernetes.io/hostname: node-b2
```

In a Deployment, the same `topologySpreadConstraints` block sits under `spec.template.spec`. The highlighted fields are the constraint fields and the selector a run reads, plus the label of every Node in the chosen key. After a run, the `#` notes show the global minimum and whether the field filters or scores.

## Try these changes

1. **Default, then Run placement.** Zone-a holds two matching Pods and zone-b holds one. Each zone-a candidate computes 3 − 1 = 2, which is above `maxSkew` 1, so both are rejected. Expected: `web-4` is assigned to node-b1, and the change report names the zone-a rejection. Zone counts become 2 and 2.
2. **Reset, set maxSkew to 2, then Run placement.** Zone-a now computes 3 − 1 = 2, which is allowed. Expected: node-a1 wins as the first passing name. The more loaded zone is permitted.
3. **Reset, choose ScheduleAnyway, then Run placement.** Nothing is rejected, so every gate lies flat. Expected: node-b1 wins because zone-b has the fewest matching Pods, and node-b2 ties with it and loses on name. The minDomains option is unavailable here.
4. **Reset, tick minDomains 3, then Run placement.** The fixture has two zones, fewer than three, so the global minimum is 0. Zone-a computes 3 − 0 = 3 and zone-b computes 2 − 0 = 2, and both exceed 1. Expected: `web-4` stays Pending.
5. **Reset, Remove newest web Pod, then Run placement.** `web-3` leaves zone-b, so the counts become 2 and 0. The current skew is 2, above `maxSkew` 1, and nothing moves. Expected: `web-4` goes to node-b1, the only zone that passes. `web-1` and `web-2` stay on node-a1.

## Misconceptions

- **Wrong:** "`maxSkew` caps Pods per zone." **Correct:** it caps how far a candidate's domain may sit above the global minimum once the new Pod is counted. A zone can hold more Pods than `maxSkew` if every zone holds at least as many.
- **Wrong:** "`ScheduleAnyway` spreads Pods evenly." **Correct:** it only ranks candidates. Other scheduler scores can outweigh it, and it rejects nothing, so the spread can stay uneven.
- **Wrong:** "Spreading rebalances the cluster after a scale-down or node failure." **Correct:** the constraint is checked when a Pod is placed. Deletions leave the skew in place until a new placement or a descheduler acts.
- **Wrong:** "A Pod counts toward its own spread automatically." **Correct:** it counts only when its own labels match its `labelSelector`. A Pod that does not match is a ghost: it is placed without counting itself, and the spread can drift.
- **Wrong:** "A node without the topology label is just an empty domain." **Correct:** it is skipped. Its Pods are not counted, and the Pod cannot be placed there under this constraint.
- **Wrong:** "Topology spread replaces pod anti-affinity." **Correct:** required anti-affinity allows at most one matching Pod per domain. Spread allows several, as long as the difference stays within `maxSkew`.

## Safe read-only observation

Run these only against a cluster you are authorized to inspect. They read state and change nothing:

```sh
kubectl get nodes -L topology.kubernetes.io/zone -L kubernetes.io/hostname
kubectl get pods -n NAMESPACE -l app=web -o wide
kubectl get pod web-4 -n NAMESPACE -o jsonpath='{.spec.topologySpreadConstraints}{"\n"}{.spec.nodeName}{"\n"}'
kubectl describe pod web-4 -n NAMESPACE
```

The first command adds the two domain labels as columns, so you can group nodes by domain. The `-o wide` output shows the NODE column. That column records assignment, not Running. The `jsonpath` read returns the constraint and the bound node. `describe` shows Events, where a scheduling failure is recorded; its wording varies between Kubernetes versions.

**Limit:** these are snapshots taken at different moments, and Events expire. `kubectl` does not show the skew arithmetic, and the count depends on your `-n` namespace and label selector: a mismatched selector silently undercounts.

## Predict and transfer

Zone-a holds one matching Pod on node-a1, and zone-b holds three on node-b1 and node-b2. A new Pod uses zone spreading, `maxSkew: 1`, and `DoNotSchedule`. Node-a2 is in zone-a, and node-b1 is in zone-b.

**Prediction:** zone-a passes, because 1 + 1 − 1 = 1 is at most 1. Zone-b fails, because 3 + 1 − 1 = 3 is above 1. The Pod lands in zone-a, on node-a1 by fixture name order; the other zone-a node ties with it, and a real cluster's other scores would decide between them. Changing the constraint to `ScheduleAnyway` would still prefer zone-a, because it has fewer matching Pods, but nothing would be rejected.

**Transfer:** the same rule on `kubernetes.io/hostname` with three nodes at one Pod each would accept a fourth Pod on any node, since 1 + 1 − 1 = 1 is at most 1. After the fourth Pod lands, what is the skew over the nodes, and does the rule still hold for the next Pod?

## Assumptions and limits

- **Scope.** The fixture models one constraint on web Pods in one namespace, with four Nodes in two zones. It does not model two constraints together, which must all pass for a DoNotSchedule Pod (conflicting constraints can leave a Pod Pending), cluster default constraints, `matchLabelKeys`, or eviction.
- **Node filtering inside the calculation.** `nodeAffinityPolicy` defaults to Honor, so Nodes that a Pod's `nodeSelector` or affinity excludes leave the skew calculation. The fixture has no such selectors.
- **Taints.** `nodeTaintsPolicy` defaults to Ignore, so a tainted node still counts as an eligible domain unless you set Honor. The fixture has no taints; see [Taints and tolerations](/anatomy/taints-tolerations/).
- **Counting.** The fixture counts assigned Pods, not Running or Ready ones, and it ignores Terminating Pods and other namespaces.
- **Scores.** ScheduleAnyway is modelled only as a preference for the domain with fewer matching Pods. Real scoring is normalized with other plugins. Name order is the fixture's tie-break and is not a Kubernetes rule.
- **Constraint edits.** The fixture edits an unassigned Pod in place, so a change keeps the learner's Pod identity. A real cluster applies template changes to Pods created afterwards.
- **Fixture numbers.** Four Nodes in two zones; `web-1` and `web-2` on node-a1 and `web-3` on node-b1 at the start. Node labels are the only node properties modelled.
- **Version.** The docs note that `minDomains` was once behind a feature gate. Check your Kubernetes version before relying on it.
- **Scheduler bypass.** Setting `spec.nodeName` directly skips the scheduler, so no spread constraint applies.
- The model does not run cluster commands, persist learner data, or claim live verification.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Pod Topology Spread Constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/): the fields, `maxSkew`, `minDomains`, `whenUnsatisfiable`, default constraints, known limitations, and the comparison with pod anti-affinity.
- [Kubernetes: Kubernetes Scheduler](https://kubernetes.io/docs/concepts/scheduling-eviction/kube-scheduler/): filtering, scoring and binding.
- [Kubernetes: Well-Known Labels, Annotations and Taints](https://kubernetes.io/docs/reference/labels-annotations-taints/): `topology.kubernetes.io/zone` and `kubernetes.io/hostname`.
