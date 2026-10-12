## The big picture

A Pod that needs SSD disks, or a particular zone, must land on a node whose labels satisfy those rules, and the scheduler has to choose among the nodes that do. The rules split into two kinds. **Hard rules** (`nodeSelector`, `requiredDuringSchedulingIgnoredDuringExecution`, and enough free request capacity) decide which nodes are possible at all. **Preferred rules** (`preferredDuringSchedulingIgnoredDuringExecution`) only rank the nodes that already passed the hard rules. A preference cannot make an impossible node possible.

The Pod author writes the rules in the Pod spec. Node administrators write the node labels. The scheduler matches the two, records an assignment, and then the kubelet on that node starts containers. Assignment and running are separate steps, and this sorter keeps them separate.

The sorter is an authored fixture, not a live cluster observation. Node cards show labels, feelers show each hard check, the score plunger shows a raw preferred-rule contribution, and the accent cartridge is the one Pod. The cartridge is not travelling between real machines, and animation time says nothing about scheduling latency. Resource requests are covered in [Scheduling placement](/anatomy/scheduling-placement/), and taints work the other way round, repelling Pods, so [Taints and tolerations](/anatomy/taints-tolerations/) explains how they combine with the affinity rules here.

## Who owns what

- **Workload author:** writes `spec.nodeSelector` and `spec.affinity.nodeAffinity` in the Pod spec, often through a controller's Pod template.
- **Node administrator or infrastructure tooling:** sets node labels. A label is metadata. It is not proof that the named hardware or security property exists. For node-isolation labels, choose keys the kubelet cannot change; the `NodeRestriction` admission plugin blocks kubelet changes to `node-restriction.kubernetes.io/` labels.
- **kube-scheduler, filter stage:** the NodeAffinity plugin checks `nodeSelector` and `nodeAffinity`; the NodeResourcesFit plugin checks the Pod's resource requests against each node.
- **kube-scheduler, score stage:** adds the weights of matching preferred rules to the node's score, alongside other score plugins.
- **kube-scheduler, binding:** records the assignment by setting `spec.nodeName` through the API. Choosing a node is not starting it.
- **kubelet and container runtime on the chosen node:** start the containers. The final button simulates this separate actor; it does not invoke a real kubelet.

## How it works

1. **Created, unassigned.** The Pod has no `spec.nodeName`. Nothing has been filtered, so no feeler is lifted and no score exists.
2. **Evaluate node requirements (filter).** For each node, three independent hard checks run:
   - `nodeSelector`: every key in the map must match exactly.
   - Required affinity: its `nodeSelectorTerms` are **ORed**. Inside one term, the `matchExpressions` are **ANDed**. A term passes only if all its expressions pass.
   - Request capacity: the node has enough free allocatable resources. This check is separate from every label check.

   A node that fails any check is excluded and keeps its reason. If no node survives, the Pod is unscheduled and no score is ever computed.
3. **Score eligible nodes.** Each satisfied preferred rule adds its `weight` (1 to 100) to the node's sum. An eligible node with no preference match scores zero. That means eligible, not rejected.
4. **Record assignment.** The highest eligible score wins in this fixture, with alphabetical order breaking ties. The binding writes `spec.nodeName`. The Pod is **Assigned**, not Running.
5. **Simulate container startup.** The fixture moves the Pod to Running on the chosen node. A real Running Pod is still not proof of readiness.
6. **Change running-node labels.** The running Pod stays where it is. `IgnoredDuringExecution` means a later label change does not evict it. A new Pod is checked against the current rules, so the bound node's card shows what a new placement would face.

The combined hard predicate for a candidate node is:

```text
nodeSelector passes
AND required affinity passes (at least one term, all of whose expressions pass)
AND request capacity passes
```

Preferences run only after this predicate is true for the node.

## YAML example

This is the default Pod spec the figure generates. It is an illustrative fragment, not something this page submits. The comments mark the fields that drive the behaviour above.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: sorter-1
spec:
  nodeSelector:
    disk: ssd
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:   # term 1: its expressions are ANDed
              - key: zone
                operator: In
                values: [east]
              - key: disk
                operator: In
                values: [ssd]
          - matchExpressions:   # term 2: ORed with term 1
              - key: zone
                operator: In
                values: [west]
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 60   # 1-100, added when a node matches
          preference:
            matchExpressions:
              - key: zone
                operator: In
                values: [west]
  containers:
    - name: sorter
      image: registry.example.com/sorter:1.0
      resources:
        requests:
          cpu: 500m   # the node must have this much free CPU
```

- `nodeSelector` is an exact-match filter, and it must hold alongside the affinity rule. Removing it is a different Pod.
- The two `nodeSelectorTerms` entries are alternatives. The first is an AND of `zone=east` and `disk=ssd`. The second is `zone=west` alone.
- `weight` is a preference, not a permission. It only ranks nodes that passed every filter.
- `cpu` is what the capacity check reads. Only node-c's capacity is switchable in the fixture; the other nodes always have it.
- `zone` and `disk` are fixture keys. Real zone labels use the well-known key `topology.kubernetes.io/zone`.

## Try these changes

1. **Default rules.** Press Evaluate node requirements. node-a and node-b become eligible, and node-c is rejected because its selector and both affinity terms fail. Scores are still hidden until you press Score eligible nodes.
2. **Contradictory hard rules.** Set nodeSelector to `hdd` and required affinity to `east AND ssd`, then evaluate. No node passes, so the Pod is unscheduled at the filter step. Raise the weight to 100 and evaluate again: the result does not change.
3. **Eligible with no preference.** Set nodeSelector to `hdd`, required affinity to none, and preferred zone to west. node-c is eligible with score 0 (eligible, no preference match). Turn off node-c's request capacity: node-c is rejected by capacity alone. Its selector feeler stays lifted because the label check passes. Its middle capacity feeler stays down because capacity fails, and its required-affinity feeler stays down because that check does not apply.
4. **Running, then labels change.** Assign and simulate start. Press Change running-node labels: node-b reports that the existing Pod is still Running there, and the new placement under current rules is rejected. The cartridge stays on node-b.
5. **Weight slider.** Drag the slider or press arrow keys. The number shows your draft; the rule commits on release or after each key press, not on every pixel. The slider stays usable while the carriage settles, and each committed value restarts evaluation for the same Pod.

## Misconceptions

- **"A preference can make an ineligible node win."** Filters run first. Preferences only rank nodes that passed every hard check, so raising the weight to 100 cannot rescue a failed selector or affinity.
- **"nodeSelector and required affinity are alternatives."** Both must hold. A Pod with `disk: ssd` and a west-only affinity term still cannot land on a west HDD node.
- **"Two required terms are ANDed."** Terms are ORed; expressions inside one term are ANDed. An east HDD node fails the `east AND ssd` term on `disk` alone.
- **"A score of 0 means rejected."** A zero score means the node is eligible with no preference match. Eligibility is decided by the filter, not by the score.
- **"Assigned means Running."** Assignment writes `spec.nodeName`. The Pod can stay Pending until its containers start, and Running is still not Ready.
- **"Changing a node's label moves the Pod."** `IgnoredDuringExecution` means the Pod keeps running. Only future scheduling attempts use the new labels.
- **"disk=ssd proves the hardware."** A label is metadata. Trust depends on who can set it, which is an operations decision.

## Safe read-only observation

If you have read access to a cluster, these commands only read:

```sh
kubectl get nodes -L disk,zone
kubectl get pod POD_NAME -n NAMESPACE -o yaml
kubectl describe pod POD_NAME -n NAMESPACE
```

- `kubectl get nodes -L disk,zone` shows the current label values. It does not show the labels that were in place when the Pod was assigned.
- `kubectl get pod ... -o yaml` shows `spec.nodeSelector`, `spec.affinity.nodeAffinity`, `spec.nodeName`, and `status.phase`. It does not show which plugin rejected a node.
- `kubectl describe pod ...` shows conditions and scheduling events. Events expire, and they do not expose every plugin score.

An empty `nodeName` with scheduling failures points to a placement problem. An assigned Pod that is still Pending points to a node-side problem, such as image pulls. A Running phase is not proof of application readiness.

## Predict and transfer

A fourth node D has `disk=hdd`, `zone=west`, and enough capacity. Keep `nodeSelector: disk=ssd`, required `(east AND ssd) OR west`, and preferred west with weight 100. Is D eligible? If you remove the nodeSelector, does D become eligible?

<details>
<summary>Reveal the reasoning</summary>

No, D is not eligible while the selector stays. It matches the west term and the preferred zone, but it fails the separate `disk=ssd` selector, so it is excluded before scoring. Raising the preference cannot fix that. If you remove the selector, D passes the west term and capacity, so it becomes eligible and competes with node-b, which has the same west preference. The fixture then breaks the tie alphabetically, which is a fixture rule, not a cluster guarantee.

</details>

## Assumptions and limits

- The fixture has three nodes and one Pod at a time. Node labels use the keys `disk` and `zone`; production zone labels use `topology.kubernetes.io/zone`.
- Request capacity is switchable only on node-c. A real NodeResourcesFit check compares each requested resource.
- Scores are raw preferred-rule weights. A real scheduler normalizes scores and adds other score plugins, so the fixture's winner is not a prediction of a real cluster's decision.
- Replay and Reset restore the fixture's node labels. A real cluster keeps a label change until someone reverts it.
- Taints, topology spread, inter-pod affinity and other scheduling plugins are not modelled.
- Running is simulated. Readiness probes, Service endpoints and traffic are not modelled.
- This page was reviewed against kubernetes.io documentation on 2026-10-12. That is a documentation review, not a live cluster test.

## Authoritative sources

- [Kubernetes: Assigning Pods to Nodes](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/): nodeSelector and nodeAffinity together, ORed terms, ANDed expressions, weights from 1 to 100, and IgnoredDuringExecution.
- [Kubernetes: Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/): label metadata and matching semantics.
- [Kubernetes: Scheduling Framework](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/): filter, score and binding stages.
- [Kubernetes: Scheduler Configuration](https://kubernetes.io/docs/reference/scheduling/config/): the NodeAffinity and NodeResourcesFit plugins.

This page supports [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement/), objectives `fpp:kubernetes-scheduling-placement/feasibility` and `fpp:kubernetes-scheduling-placement/policy`. It records no completion, mastery, or retention evidence.
