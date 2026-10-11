## The problem: a count is not a collection of permanent identities

Suppose a Deployment wants three replicas. Deleting one managed Pod changes the observed set, not the desired count. The ReplicaSet controller can create another Pod to close that gap. That new Pod has a new UID; it is not the deleted Pod coming back, and it is not the old Pod migrating to another node.

Three changes that can look alike in a Pod list have different causes:

| Change | Intent that changed | Responsible ownership layer | Expected result |
| --- | --- | --- | --- |
| Delete one managed Pod | None: desired count and template stay the same | ReplicaSet controller repairs its Pod count | New Pod identity, same ReplicaSet and template |
| Scale the Deployment | `.spec.replicas` | Deployment controller sets ReplicaSet replica targets; ReplicaSet controllers reconcile Pods | Different count, same template revision |
| Change the image inside the Deployment template | `.spec.template.spec.containers[].image` | Deployment controller manages rollout and ReplicaSets | In this fresh-template fixture, a new ReplicaSet/revision and new Pods |

The apparatus is an **authored fixture**, not a cluster recording. Its numbered identities `p1`, `p2`, and so on are readable stand-ins for UIDs, not real Kubernetes names or UID values. No button submits a Kubernetes request.

## Read the object as ownership, not topology

The console is the **Deployment**: it holds the desired template and the overall desired replica count. Its template key advances from `app:v1` to `app:v2` only when the Pod template changes.

The rear cartridge bed is **RS-v1**. The front bed is initially spare hardware: **RS-v2 does not exist** until the fixture's new template is requested. Each bed has its own replica target and its own cartridges. These are independent ownership groups, not two nodes or two application containers.

A cartridge is one **Pod API object**. A partially inserted cartridge means “Created; not Ready.” Seating it represents the fixture's later readiness event. The accent stop on the ruler is the Deployment's desired count, not the number of visible cartridges. During a rollout, there can be one more observed Pod than that count.

The analogy stops at the rails. Kubernetes has no cartridge transport mechanism. The drawing does not show scheduling, node placement, image downloading, runtime execution, traffic routing, or a Pod moving between owners. Removal and insertion are visual metaphors for different API objects leaving and entering the selected set.

## Actors and their boundaries

- The **Deployment controller** manages ReplicaSets, their replica targets and template rollout history. It does not directly start containers.
- A **ReplicaSet controller** creates or deletes Pod objects to reconcile its selected, owned population with its replica target. Each new Pod uses that ReplicaSet's template.
- The **scheduler** assigns an eligible node to a newly created unscheduled Pod. A Pod existing in the API is not proof it has a node.
- The **node's kubelet and container runtime** handle execution. Readiness depends on the Pod's conditions and any configured probes, not merely on object creation.

In normal Deployment-managed workloads, inspect Pod `metadata.ownerReferences` to find its ReplicaSet, then the ReplicaSet's owner references to find the Deployment. Labels and selectors matter too; do not design overlapping controller selectors. The fixture assumes correct, non-overlapping selectors and no adoption of unrelated Pods.

## Controls → causal state

### Delete selected Pod: repair count, not identity

Start with desired `3`, RS-v1 target `3`, observed `3`, Ready `3`. Select `p2` and delete it. The cartridge exits, `p2` enters the retired list, and the observed count becomes `2`. Desired and revision remain unchanged.

**Step reconciliation** creates `p4` from RS-v1's unchanged template. The count returns to `3`, but Ready is still `2`. Another step assumes successful scheduling, execution and readiness, and seats `p4`. The identity ledger now contains `p1`, `p4`, `p3` in physical slot order. There is no resurrection of `p2`.

Kubernetes need not choose the same node for the replacement. A container restart *within* a surviving Pod is a different event: it can keep the same Pod UID.

### Desired replicas: change capacity without changing the recipe

Select a count from `0` through `4`. This control combines the accepted Deployment count edit with the Deployment controller propagating the new target to the active ReplicaSet. The stop moves while the template key stays put. Each subsequent step removes one excess Pod or creates one missing Pod; a creation requires another step for readiness.

Scale-down does not require deleting the Deployment. At desired `0`, the fixture has no Pods and retains its ReplicaSet and template history. Choosing a positive count creates fresh Pod identities. The fixture removes the highest occupied slot first for legibility; that is not a promise about Kubernetes' Pod deletion ordering.

### Change template to app:v2: a separate rollout

This one-way control combines a Pod-template edit and the Deployment controller establishing RS-v2 at target `0`. Existing RS-v1 Pods remain `app:v1`. The next steps distinguish the two controllers:

1. Deployment increases RS-v2's target by one.
2. RS-v2 creates a new Pod from `app:v2`; it is not yet Ready.
3. The fixture supplies a successful readiness event.
4. Deployment can lower RS-v1's target by one without reducing Ready capacity below the desired count.
5. RS-v1 deletes one of its old Pods.

Repeat until RS-v2 owns all desired Pods and RS-v1 has target and observed count `0`. The empty old bed represents retained rollout history, not running old capacity. If desired is already zero, changing the template needs no Pod replacement.

The fixture uses **RollingUpdate, `maxSurge: 1`, `maxUnavailable: 0`** and no readiness delay beyond the explicit readiness step. This is an illustrative serial ordering of asynchronous events, not a trace of real controller timing. A real Deployment can reuse a ReplicaSet whose template already matches; this fixture's `app:v2` template is new. Replica-count changes alone do not trigger a new Deployment revision.

### Step, reset and transition safety

Step reveals the next explanatory event. There is no autoplay or background reconciliation in this apparatus; real controllers operate continuously. Inputs lock during a visible pose transition. New count/template/deletion intents also lock until the current intent converges, deliberately excluding concurrent scale edits during rollout. **Reset / replay** restores three Ready v1 Pods and restarts the fixture's identity numbering; it is not a Kubernetes rollback.

The readout, identity ledger and cartridge targets come from one deterministic state model. Reduced motion reaches the same stable pose immediately. Offscreen or hidden-tab motion pauses; returning resumes it. The figure does not save progress or make network calls.

## Assumptions and observations this cannot prove

Admission succeeds, resources are available, controllers function, no autoscaler changes the replica target, and every new Pod eventually becomes Ready. Termination is immediate in the model. Real graceful termination can leave terminating Pods visible while replacements appear; those extra objects are not represented in this count. Readiness and availability are not identical in every configuration, especially with `minReadySeconds`; the fixture assumes zero minimum readiness duration.

The model's Ready count does not prove Service selection, healthy endpoints, external routing or correct application responses. A bad image or failing readiness probe can stall a real rollout. The controller does not change the template to fix that application failure.

## Misconception: “delete” is just another spelling of “scale down”

Deleting a managed Pod changes an instance. Scaling changes persistent desired capacity. Updating a template changes the recipe for new instances. Ask which field or object changed before predicting the controller's response. In a normal Deployment workflow, change the Deployment rather than manually managing its child ReplicaSets.

**Practical tip:** compare the Deployment's desired count, each ReplicaSet's desired/current/Ready counts, and Pod owner references together. A flat Pod list hides the rollout boundary. Do not infer success from an accepted edit or from the mere presence of a new ReplicaSet.

## A safe read-only observation

In a cluster you are authorized to inspect, replace `demo`, `web`, and `app=web` with your actual namespace, Deployment and label selector:

```sh
kubectl get deployment web -n demo -o yaml
kubectl get replicasets -n demo -l app=web -o yaml
kubectl get pods -n demo -l app=web -o yaml
```

Read `.spec.replicas`, `.spec.template`, each ReplicaSet's `metadata.ownerReferences`, and each Pod's `metadata.uid`, `metadata.ownerReferences` and `status.conditions`. Comparing successive observations can show new identities, old/new ReplicaSet ownership and readiness changes.

**Limit:** these are independent, read-only snapshots, not an atomic history. A selector can include unrelated resources; verify owner references. A Ready condition is not an end-to-end application test. This page neither runs these commands nor claims their output was observed.

## Predict, then transfer

Start with desired `3` and template v1. Delete `p2`, restore the count, then scale to `4` before changing the template to v2.

Before each step, predict:

- Which actor acts next: Deployment controller, ReplicaSet controller, or the assumed readiness event?
- Does the next event change a target, an observed count, or a Ready count?
- Can the observed count reach `5` while desired remains `4`? Which policy permits that overlap?
- Which identities survive deletion and scaling? Which survive completion of the rollout?

Now transfer: suppose the first v2 Pod is created but never becomes Ready. With `maxUnavailable: 0`, why is retiring an old Ready Pod unsafe? What Pod conditions and events would you inspect before concluding that the Deployment controller is broken?

## Canonical objectives and public sources

This exploration supports [ReplicaSet reconciliation](/learn/kubernetes-labels-replicasets?mode=reference), objective `fpp:kubernetes-labels-replicasets/reconciliation`, and [Deployment ownership and revisions](/learn/kubernetes-deployments-rollouts?mode=reference), objectives `fpp:kubernetes-deployments-rollouts/ownership-chain` and `fpp:kubernetes-deployments-rollouts/revision`. Exploring this fixture does not record evidence for those objectives.

Public claim review: 2026-10-11. Original explanation and apparatus; no course assets or copied proprietary questions.

- [Kubernetes ReplicaSet: selector, template, count and ownership](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
- [Kubernetes Deployments: template-triggered rollout, scaling and RollingUpdate](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [Kubernetes Pod lifecycle: UID, replacement, scheduling and readiness](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
