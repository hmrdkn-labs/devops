## The big picture

You declare a ReplicaSet with `spec.replicas: 3`. That number is intent, stored in the API. Nothing in the API starts a container. A controller is a loop that reads the stored spec, reads what actually exists, compares the two, and makes one step toward agreement through the API. It then writes what it observed into `status`. The loop never ends: when a Pod is deleted later, the same loop runs again and makes the next step.

Three actors divide the work. You or another client write the spec. The controller reads and compares, creates or deletes Pod objects, and writes status. The node side (scheduler binding, kubelet and container runtime) runs containers and reports Ready. The controller does not run containers, and the node side does not decide how many Pods should exist.

This is an **authored fixture**, not a live cluster. Its object is a ReplicaSet-like controller counting Pods, because that is the smallest case of the loop. It is not a rollout (see [replica reconciliation](/anatomy/replica-reconciliation/)) and not the whole control plane (see [cluster responsibilities](/anatomy/cluster-responsibilities/)). No button sends a Kubernetes request.

## Who owns what

- **Client (you).** Writes `spec` through the API. In the fixture, that is the Desired replicas control, which also advances `metadata.generation`.
- **API server and stored objects.** Hold the spec and the Pod objects, and accept writes from every actor. The fixture's API drawer is these objects, not a separate database.
- **Controller.** Reads `spec.replicas` and the Pod objects it observes. It sends one create or delete request to the API for each step, and it writes `status` to report what it saw. It does not set Ready and does not start containers.
- **Node side.** The scheduler binds the Pod to a node, and the kubelet runs its containers and reports the Pod's `Ready` condition back through the API. The fixture folds binding, start and Ready into one event, `Node reports one Pod Ready`.
- **Watch notifications.** Tell the controller that something changed. A notification only wakes the loop; it is not the source of truth.

The Job controller shows the same boundary: it "does not run any Pods or containers itself" and "tells the API server to create or remove Pods". The ReplicaSet is the same pattern.

## How it works

### One pass

A controller pass has three phases, and the fixture performs one API write per pass:

1. **Observe.** Read the current `spec.replicas`, `metadata.generation`, and the Pod objects. The fixture does not replay the hints that woke the loop.
2. **Compare.** Observed Pods against desired. Below desired means create one Pod. Above desired means delete one Pod. Equal means nothing to create or delete.
3. **Act through the API.** Send that one create or delete. If the counts already match but the stored status disagrees with what was just observed, write the status instead. If nothing differs, write nothing.

Each Pod create or delete is one API request and one ChangeReport. The status write changes no Pod at all.

### Level-triggered, not event replay

The loop acts on the level of current state (how many Pods exist versus how many are wanted), not on the sequence of changes that led there. Kubernetes controllers are often called level-triggered for this reason; the docs do not use that word, but they describe the mechanism it depends on. A client lists the current objects and then watches for changes after that version. When the server can no longer serve a watch (`410 Gone`), the client must clear its local cache, list again and restart the watch.

The fixture shows the consequence. Two spec edits made before a pass (4, then back to 2) produce one decision for the current value 2. The generation moves from 1 to 3, the controller creates no Pod for the intermediate 4, and it removes the newest Pod because observed 3 is above the current desired 2. Dropping every pending hint changes nothing about where the loop ends, because the next pass reads the current spec and Pods.

### Status is a report

`status` is written by the controller and is read-only to clients. `observedGeneration` records the generation the controller last observed, `replicas` the number of Pods it counted, and `readyReplicas` the number of those Pods with a Ready condition. The API reference says that status "may be out of date by some window of time". In the fixture the stored status lags behind live Pods until the next status write, and the Status readout shows both values side by side.

The controller never reads its own status to decide. It decides from the spec and the observed Pods. That is why a stale report cannot cause a wrong create or delete.

### Drift is repaired by the next pass

Drift is any change the spec does not record: a Pod deleted by a user, an eviction, or a failure. The spec still asks for 3, so the loop sees one fewer Pod than desired. It repairs the gap on its next pass by creating a new Pod object with a new name and UID. Within one run of the fixture the deleted name is not reused; Reset / replay restarts the name sequence, so the same names return after a reset. The replacement takes the freed fixture socket.

### Readiness is reported, not set

A Pod counted by the controller can still be Not Ready. The controller records that in `readyReplicas`, but it does not change the Ready condition. Only the node side can make a Pod Ready. If the node never reports Ready, the loop keeps the Pod, reports `readyReplicas` below `replicas`, and waits.

### Idempotence

A pass with the same inputs gives the same result. On converged state a pass changes no fact and sends no request, so running the loop again is safe. Convergence is the state where the loop has nothing to write. It is not a finished event: the loop keeps running.

## YAML example

This is the ReplicaSet the figure's ManifestPanel shows at the start. It is the object as the API stores it, trimmed: `uid`, `resourceVersion` and `creationTimestamp` are left out. The `generation` and `status` lines are system-populated and read-only; you do not set them when you apply a manifest.

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: web
  generation: 1
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: app
          image: registry.example.com/app:v1
status:
  observedGeneration: 1
  replicas: 3
  readyReplicas: 3
```

- `spec.replicas: 3` is the desired count. The Desired replicas control changes it, and each change advances `metadata.generation`.
- `metadata.generation` is "a sequence number representing a specific generation of the desired state". The fixture increments it on every spec edit.
- `spec.template` is what the controller uses to create a Pod when it has to. The fixture never changes the image here.
- `status.observedGeneration` is the generation the controller last recorded. When it is below `metadata.generation`, the controller has not yet written its report for the latest spec.
- `status.replicas` and `status.readyReplicas` are the counts the controller last wrote. They can disagree with the live Pods between passes.

## Try these changes

1. **Scale up and watch the report lag.** Set Desired replicas to 4. Expect the ChangeReport to name `spec.replicas` and `metadata.generation` (1 → 2) and say that no Pod changed. Run a pass: a new Pod object appears as Created and not Ready, and `status.replicas` still reads 3. Node reports one Pod Ready: the fourth socket seats. The next pass writes status (`observedGeneration` 2, `replicas` 4, `readyReplicas` 4) and reports converged.
2. **Two edits, one pass.** Set Desired replicas to 4, then back to 2, before running any pass. Expect the generation to read 3 and no Pod to be created. The next pass removes the newest Pod, because observed 3 is above the current desired 2. The ChangeReport explains that two unobserved edits were read as one value.
3. **Delete a Pod, then repair.** Choose a Pod in the selector and press Delete Pod object. Expect the spec and generation to stay put, the observed count to fall to 2, and the stored status to still read 3. Run a pass: a replacement with a new name is created in the freed socket, Not Ready. Node reports it Ready, and the following pass writes nothing: the stored status already reads 3 and 3 again.
4. **Drop the hints.** Set Desired replicas to 4, press Drop pending hints, then run a pass. Expect the same creation and the same final state as without dropping. The pass says it had no hint to drain, because it reads the current spec and Pods.
5. **Repeat a converged pass.** On converged state, run passes several times. Expect "Pass wrote nothing" every time and no change to any Pod or status field.

## Misconceptions

- **“The controller starts the containers.”** It sends a create request for a Pod object. The node side runs the containers and reports Ready.
- **“The loop replays every edit in order.”** It reads the current state each pass. Intermediate spec values can be skipped, as in the two-edits experiment.
- **“Status is what the controller decides from.”** It decides from the spec and observed Pods, then records what it saw. A stale status cannot cause a wrong decision by itself.
- **“The controller sets Ready.”** It counts Pods that report Ready. If the node never reports Ready, it does not force the condition.
- **“A deleted Pod comes back under the same name.”** A replacement is a new object with a new name and UID. In this fixture the old name stays retired until Reset / replay, which restarts the authored sequence.
- **“Once converged, the cluster is finished.”** Control loops run continuously, and the cluster may change again at any time. Convergence only means the loop has nothing to write right now.

## Safe read-only observation

In a namespace you are authorized to inspect, replace `demo`, `web` and `app=web` with your namespace, ReplicaSet name and label:

```sh
kubectl get rs web -n demo -o yaml
kubectl get pods -n demo -l app=web -o yaml
kubectl describe rs web -n demo
```

Compare `metadata.generation` with `status.observedGeneration`; a gap means the controller has not yet written its report for the latest spec. Compare `status.replicas` and `status.readyReplicas` with the live Pods and their `status.conditions`. The `describe` output lists recent controller events, such as the creations and deletions above.

**Limit:** each command is an independent snapshot, and `status` is documented as possibly out of date. Read successive snapshots rather than one. The output may expose workload details, so check the active kubeconfig context first. This page neither runs these commands nor claims their output was observed.

## Predict and transfer

Start with Desired replicas at 3. Set it to 4 and run one pass, then predict before each action:

- After the first pass, which counts change, and which stored field stays the same?
- Node reports Ready for the new Pod. Does the controller change any Pod field? What does the next status write do with `status.readyReplicas`?
- If the node never reports Ready, what is the controller's next pass likely to do, and why?

Transfer: a Pod exists, is Not Ready, and is still in phase Running while its containers restart. Should you expect the ReplicaSet to delete and recreate it? It counts Pods that exist and are not finished, so a Running Pod satisfies the count. Look at the Pod's conditions, its events, its container logs and the workload's probes instead. Deleting the Pod object is a separate, explicit action.

## Assumptions and limits

The fixture assumes admission succeeds, the selector matches only its Pods, and no other controller interferes. It performs one create or delete, or one status write, per pass. Real controllers can create several Pods in one sync and may update status in that same sync, so the one-write-per-pass lag shown here is a teaching simplification.

Node-side work is folded into one event. The scheduler's binding, the kubelet's start and the Ready condition are not separate steps here; the cluster responsibilities and Pod lifecycle pages separate them. Deletion is immediate in this fixture, so terminating Pods are not represented. Victim choice is simplified: it prefers a not-Ready Pod, then the newest, and does not implement Kubernetes' full ranking of scale-down candidates ([replica reconciliation](/anatomy/replica-reconciliation/) covers that ordering).

Pod names are fixture stand-ins. The API generates real names from a prefix and a random suffix, and the figure's names do not come from that generator.

Counts of ready Pods do not prove Service routing, endpoints or a correct application response. The model is a counter over objects, not a measurement of traffic.

Continue with the canonical unit: [Study the Kubernetes API and control loops](/learn/kubernetes-control-loop?mode=reference). This figure supports the objectives **trace desired, observed and reconciled state** (`fpp:kubernetes-control-loop/reconciliation`) and **explain the API server and durable cluster state** (`fpp:kubernetes-control-loop/api-state`). Exploring it does not record evidence for either objective.

## Authoritative sources

Documentation review, 2026-10-12. This is a review of public Kubernetes documentation, not a live-cluster observation. The original explanation and apparatus contain no course assets or copied proprietary material.

- [Kubernetes controllers: the control loop, the controller pattern and built-in controllers acting through the API](https://kubernetes.io/docs/concepts/architecture/controller/)
- [Kubernetes objects: record of intent, spec and status](https://kubernetes.io/docs/concepts/overview/working-with-objects/kubernetes-objects/)
- [Kubernetes API concepts: list, watch, resourceVersion and 410 Gone](https://kubernetes.io/docs/reference/using-api/api-concepts/)
- [ReplicaSet API reference: spec.replicas, status fields and observedGeneration](https://kubernetes.io/docs/reference/kubernetes-api/apps/replica-set-v1/)
- [ObjectMeta reference: generation, generateName and ownerReferences](https://kubernetes.io/docs/reference/kubernetes-api/definitions/object-meta-v1-meta/)
- [Kubernetes cluster architecture: kubelet and kube-controller-manager](https://kubernetes.io/docs/concepts/architecture/)
