## The big picture

A Deployment states what you want: a count of Pods and one Pod template. Pods are disposable, so a deleted Pod is never brought back. Instead, a ReplicaSet notices that the observed Pods no longer match its target and creates a new Pod, with a new UID, from its own template. You change intent on the Deployment; the controllers change instances to match it.

Three changes can look alike in a Pod list, but each has a different cause:

| Change | Intent that changed | Responsible ownership layer | Expected result |
| --- | --- | --- | --- |
| Delete one managed Pod | None: desired count and template stay the same | ReplicaSet controller repairs its Pod count | New Pod identity, same ReplicaSet and template |
| Scale the Deployment | `.spec.replicas` | Deployment controller sets ReplicaSet replica targets; ReplicaSet controllers reconcile Pods | Different count, same template revision |
| Change the image inside the Deployment template | `.spec.template.spec.containers[].image` | Deployment controller manages rollout and ReplicaSets | In this fresh-template fixture, a new ReplicaSet and revision, and new Pods |

The apparatus is an **authored fixture**, not a cluster recording. Its numbered identities `p1`, `p2` and so on are readable stand-ins for Pod UIDs, not real UID values. The fixture's ReplicaSets are called RS-v1 and RS-v2 for readability; real ones carry a `pod-template-hash` suffix. No button submits a Kubernetes request.

## Who owns what

- The **Deployment controller** manages ReplicaSets: it sets each ReplicaSet's replica target, creates a ReplicaSet for a new template, and paces the rollout. It does not start containers.
- A **ReplicaSet controller** creates or deletes Pod objects to match its owned population with its replica target. Each new Pod uses that ReplicaSet's template. Readiness is not its decision.
- The **Pod object** carries the UID and its conditions. `Ready` is a Pod condition, set from the kubelet's and probes' view of the containers; the ReplicaSet and Deployment only count Pods that have it.
- The **scheduler** assigns an eligible node to an unscheduled Pod. A Pod existing in the API is not proof it has a node.
- The **kubelet and container runtime** execute the containers on the node. The fixture assumes this succeeds and records only the readiness result.

Ownership is recorded, not guessed. In a normal Deployment workflow, a Pod's `metadata.ownerReferences` names its ReplicaSet, and the ReplicaSet's owner references name the Deployment. Labels and selectors decide which Pods a ReplicaSet may acquire, so do not design overlapping controller selectors. The fixture assumes unique selectors and no adoption of unrelated Pods. Do not manage ReplicaSets owned by a Deployment directly.

## How it works

### The starting point

Desired `3`, template `app:v1`, RS-v1 target `3`. The bed shows Desired 3 · Current 3 · Ready 3 · Not Ready 0 for RS-v1, and RS-v2 does not exist. Every cartridge is seated: each Pod is Ready.

### Delete a selected Pod: the count repairs, the identity does not return

Select `p2` and press **Delete selected Pod**. The cartridge leaves the bed, `p2` moves to the retired list, and RS-v1 Current falls to 2. Desired, template and revision do not change, and the selection clears because the chosen Pod no longer exists.

**Step reconciliation** lets the ReplicaSet controller create `p4` in the reused slot 2, from RS-v1's unchanged `app:v1` template. Current returns to 3, but Ready is still 2 and Not Ready is 1: the new cartridge sits raised. Another step is the fixture's readiness event, and `p4` seats. RS-v1 now reads 3 / 3 / 3 / 0, and the ledger holds `p1`, `p3`, `p4` with `p2` retired.

Kubernetes need not place the replacement on the same node. A container restart *within* a surviving Pod is a different event and can keep the same Pod UID.

### Desired replicas: change capacity, keep the recipe

Select a count from `0` through `4`. The Deployment's desired count changes, and the Deployment controller copies it to the active ReplicaSet's target. The template key does not move and no revision is created. Each later step removes one excess Pod or creates one missing Pod, and each created Pod still needs a readiness step.

Scaling to `0` leaves no Pods, but RS-v1 and the template history remain. Scaling up again creates Pods with fresh UIDs. The fixture removes the highest occupied slot first for legibility. Kubernetes ranks scale-down candidates differently (see Assumptions and limits).

### Change the template to app:v2: a separate rollout

The template change edits `.spec.template` and the Deployment controller creates RS-v2 at target `0`. RS-v1 keeps its target and `app:v1` Pods. Then each step is one owner's action:

1. The Deployment raises RS-v2's target to 1. `maxSurge: 1` allows one Pod above the desired count, so Pods across both ReplicaSets may total 4.
2. RS-v2 creates `p4` from `app:v2`. It is Created, not Ready. RS-v1 still reads 3 / 3 / 3 / 0 and RS-v2 reads 1 / 1 / 0 / 1.
3. The fixture's readiness event seats `p4`. Ready is now 4, above desired 3.
4. The Deployment lowers RS-v1's target to 2. `maxUnavailable: 0` keeps available Pods at or above desired 3, so an old Pod goes only while Ready exceeds desired.
5. RS-v1 deletes its highest-slot Pod to reach its target.

The rollout repeats until RS-v2 owns all desired Pods and RS-v1 has target and observed count `0`. The empty old bed is retained rollout history, not running old capacity. If desired is already zero, changing the template creates no Pod.

The fixture creates RS-v2 at target 0 in the same step as the template change, and separates the raise into its own step, for legibility. A real Deployment controller may act in one sync. The fixture also takes readiness as an explicit event and uses a zero minimum readiness duration. The rule it demonstrates, that old capacity is removed only while the remaining Pods stay at or above the desired count, is the one `maxUnavailable: 0` expresses.

### Read the counts per ReplicaSet

Each bed reports four counts. **Desired** is that ReplicaSet's replica target. **Current** is the number of its Pods observed. **Ready** counts Pods whose `Ready` condition is true. **Not Ready** is Current minus Ready. A ReplicaSet has no Ready yes-or-no: readiness belongs to each Pod, and the ReplicaSet reports how many of its Pods have it. `kubectl get rs` shows the same idea in its DESIRED, CURRENT and READY columns.

### Selection follows the object

The selected Pod gets a ◆ pin on its cartridge, a selected badge on its bed slot, and the same badge on its ledger row. Selection is an inspection state: it chooses which Pod Delete acts on and never silently moves to another Pod. If the selected Pod is removed, by you or by a controller during scale-down, the selection clears and the ChangeReport says so. A replacement takes the reused slot with a `new UID` badge; it is never the retired Pod with a new name.

### Step, reset and transition safety

Step reveals the next explanatory event. There is no autoplay or background reconciliation; real controllers operate continuously. Controls lock while the apparatus moves. Scale, template and Delete intents also wait until the current state converges, which excludes concurrent scale edits during a rollout. **Reset / replay** restores three Ready `app:v1` Pods with identities `p1` to `p3`, clears selection and removes RS-v2. It is not a Kubernetes rollback.

Every control produces a ChangeReport with what changed, who acted, why, and what has not happened yet. The Deployment YAML highlights the field the last step read or changed. The figure, bed counts, ledger and YAML all come from one deterministic state model. Reduced motion reaches the same pose immediately. Offscreen or hidden-tab motion pauses; returning resumes it. The page saves no progress and makes no network calls.

## YAML example

This is the Deployment the figure's ManifestPanel shows at the start. It is minimal but valid, and the fixture's controls edit only the fields annotated below.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  minReadySeconds: 0
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: app
          image: registry.example.com/app:v1
```

- `spec.replicas` is the desired count. Scale changes it; deleting a Pod does not. The ReplicaSet repairs toward this count.
- The pod template is the only part of this Deployment that starts a rollout: here, `spec.template.spec.containers[].image`. Changing `app:v1` to `app:v2` creates RS-v2; changing `spec.replicas` never does.
- `spec.strategy.rollingUpdate.maxSurge: 1` permits one Pod above desired while a rollout runs.
- `spec.strategy.rollingUpdate.maxUnavailable: 0` means available Pods may not drop below desired during a rollout. The fixture uses this to decide when an old Pod may go.
- `spec.minReadySeconds: 0` makes a Pod available as soon as it is Ready. The fixture assumes this, as the Deployment defaults to.
- `spec.selector.matchLabels` and `spec.template.metadata.labels` must agree, so the Deployment's ReplicaSets select their own Pods.

## Try these changes

1. **Delete, then step.** Select `p2` and delete it. Expect the ChangeReport to say p2 left RS-v1's observed set, desired stayed 3, and the selection cleared. Step once: RS-v1 creates `p4` in slot 2 with a `new UID` badge and Not Ready. Step again: `p4` becomes Ready and RS-v1 reads 3 / 3 / 3 / 0. `p2` stays retired.
2. **Scale, then watch the count.** Set Desired to 4 and step. Expect the ChangeReport to name `spec.replicas` as the field read, the YAML to highlight `replicas`, and `image` to stay `app:v1`. The new Pod takes slot 4, the only free slot. Then set Desired to 0 and step: Pods leave one per step, the highest occupied slot first, and RS-v1 remains with target 0.
3. **Template change: watch surge, then availability.** Change the template and step once. Expect `maxSurge` to be highlighted and RS-v2's target to become 1 with no Pod yet. Step: RS-v2 creates `p4`; RS-v1 shows 3 / 3 / 3 / 0 and RS-v2 shows 1 / 1 / 0 / 1. Step: `p4` is Ready and Ready is 4. Step again: the Deployment lowers RS-v1's target to 2, and `maxUnavailable` is highlighted before any old Pod is removed.
4. **Change the template with desired 0.** Set Desired to 0, let the Pods leave, then change the template. Expect RS-v2 to appear at 0 / 0 / 0 / 0, no Pod to be created, and the state to read Converged.

## Misconceptions

- **“Deleting a Pod is the same as scaling down.”** No. Deleting leaves `spec.replicas` unchanged, so the ReplicaSet creates a replacement. Scaling changes `spec.replicas`, and the ReplicaSet removes Pods to match the lower count.
- **“The replacement is `p2` coming back.”** No. A replacement is a new object with a new UID. Kubernetes allows it to carry the same name, but its identity is new. In this figure it is `p4`, and `p2` stays retired.
- **“The ReplicaSet is Ready.”** There is no ReplicaSet Ready boolean. Readiness is a Pod condition, and the ReplicaSet reports counts of Pods that have it.
- **“Created means Ready, and Ready means the application works.”** Created, scheduled, Running and Ready are separate states. Ready means the Pod's Ready condition is true. It does not prove Service routing or correct responses.
- **“Scaling starts a rollout.”** Only a change to `.spec.template` triggers a rollout. Scaling changes the count, and the revision stays the same.
- **“`maxSurge` gives me extra Pods permanently.”** `maxSurge` is a ceiling used during a rollout. The desired count remains the target.

## Safe read-only observation

In a cluster you are authorized to inspect, replace `demo`, `web` and `app=web` with your namespace, Deployment name and label selector:

```sh
kubectl get deployment web -n demo -o yaml
kubectl get rs -n demo -l app=web
kubectl get pods -n demo -l app=web -o yaml
kubectl rollout history deployment/web -n demo
```

Read `.spec.replicas`, `.spec.template`, each ReplicaSet's `metadata.ownerReferences`, and each Pod's `metadata.uid`, `metadata.ownerReferences` and `status.conditions`. Comparing successive reads can show new UIDs, old and new ReplicaSet ownership, and readiness changes. `kubectl get rs` shows DESIRED, CURRENT and READY per ReplicaSet, which corresponds to the bed counts here.

**Limit:** these are independent, read-only snapshots, not an atomic history. A selector can include unrelated resources, so verify owner references. A Ready condition is not an end-to-end application test. This page neither runs these commands nor claims their output was observed.

## Predict and transfer

Start with desired `3` and template `app:v1`. Delete `p2`, restore the count, then scale to `4` before changing the template to `v2`.

Before each step, predict:

- Which actor acts next: the Deployment controller, a ReplicaSet controller, or the assumed readiness event?
- Does that event change a target, an observed count, or a Ready count?
- Can the observed total reach `5` while desired is `4`? Which policy permits that overlap, and only during which phase?
- Which identities survive deletion and scaling? Which survive completion of the rollout?

Now transfer: suppose the first v2 Pod is created but never becomes Ready. With `maxUnavailable: 0`, why is retiring an old Ready Pod unsafe? Removing it would leave fewer Ready Pods than the desired count. What would you inspect before concluding the Deployment controller is broken? Look at the new Pod's `Ready` condition and its events, the Deployment's `Progressing` condition, and `kubectl rollout status`. A stalled Deployment is reported with `ProgressDeadlineExceeded` after `progressDeadlineSeconds`; Kubernetes reports the stall and does not repair the application.

## Assumptions and limits

The fixture assumes admission succeeds, resources are available, controllers function, no autoscaler changes the target, and every new Pod eventually becomes Ready. It also assumes a zero minimum readiness duration. Termination is immediate in the model. Real graceful termination can leave terminating Pods visible while replacements appear. The total can then temporarily exceed `spec.replicas`, and the ReplicaSet reports those Pods in `status.terminatingReplicas`. Those objects are not represented here.

Scale-down order is simplified. The fixture removes the highest occupied slot. Kubernetes ranks candidates in this order: Pending and unschedulable Pods first, then Pods with a lower `controller.kubernetes.io/pod-deletion-cost`, then Pods on nodes with more replicas, then the more recently created Pod (creation times are bucketed on a log scale). A remaining tie is random. Pod deletion cost is an annotation applications may set to express a preference.

The rollout rule is illustrative. The fixture uses a Ready-count check to decide when an old Pod can go; a real Deployment computes scaling from its availability rules and `maxSurge`/`maxUnavailable` together. The fixture also separates steps that a real controller may combine.

The model's Ready count does not prove Service selection, healthy endpoints, external routing or correct application responses. A bad image or failing readiness probe can stall a real rollout, and the controller does not change the template to fix that application failure. Pod UIDs are stand-ins `p1` and onward; reset restarts the numbering.

## Authoritative sources

This page supports the course objectives [ReplicaSet reconciliation](/learn/kubernetes-labels-replicasets?mode=reference) (`fpp:kubernetes-labels-replicasets/reconciliation`) and [Deployment ownership and revisions](/learn/kubernetes-deployments-rollouts?mode=reference) (`fpp:kubernetes-deployments-rollouts/ownership-chain` and `fpp:kubernetes-deployments-rollouts/revision`). Exploring this fixture does not record evidence for those objectives.

Public documentation review, 2026-10-12. This is a documentation review, not a live-cluster observation. Original explanation and apparatus; no course assets or copied proprietary questions.

- [Kubernetes ReplicaSet: selector, template, count, ownership and scale-down order](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
- [Kubernetes Deployments: template-triggered rollout, scaling, RollingUpdate, revisions and progress](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes Pod lifecycle: UID, replacement, scheduling and readiness](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
