## The big picture

A manifest is a file on your machine. It becomes cluster state only when `kubectl apply` sends it to the API server, and the API server accepts it only if the object is valid. Accepted state is not the same as running state. The stored object records your desired state in `spec`; a controller later writes `status` to say what it has observed; the Pods that carry the workload become Ready on yet another schedule. Each of those steps can succeed or fail independently, so the fixture separates them on purpose.

The apparatus above is an original filing press, not a recording of a cluster. The card in the feeder tray is your manifest. Apply slides it under the press head, which strikes only as a stamp: the API server validates the request before anything is persisted. The left drawer holds the stored spec, with its generation. The right drawer holds the status the controller last wrote. The four sockets hold Pods: Pending cartridges are partly seated, Ready cartridges are fully seated. The fixture starts converged, so every control moves you from a known state.

## Who owns what

- **You** write the manifest and choose the command. The file is intent only; editing it changes nothing in the cluster until a request is sent.
- **`kubectl`** reads the file, converts it to the JSON the API expects, and sends the request. For `kubectl diff` it asks the server for a dry-run apply and prints the result without persisting it.
- **The API server** validates the object, runs admission, and persists it. It assigns the `metadata.uid` on create and advances `metadata.generation` when the desired state changes. It does not start Pods.
- **The Deployment controller** watches stored Deployments, creates the ReplicaSet that makes Pods, and writes `status`: `observedGeneration`, `replicas`, and `readyReplicas`. This page collapses the ReplicaSet step into the controller's sync.
- **The scheduler, kubelet, and probes** assign Pods to nodes, run their containers, and report readiness. The fixture stands in for them with one "Pods become Ready" event; none of them runs here.
- **Garbage collection** removes dependents after their owner is deleted.

## How it works

1. **Send.** `kubectl apply -f` sends the manifest. A name that does not exist yet is created. An existing object is updated from the fields in the request.
2. **Validate before persist.** The API server checks field types and cross-field rules. A Deployment whose `spec.selector` does not match `spec.template.metadata.labels` is rejected. A rejected request stores nothing, bumps no generation, and leaves the Pods alone.
3. **Persist.** A created object gets a new `uid` and generation 1, with an empty status. A changed spec gets generation + 1. The stored `resourceVersion` changes on every write, but clients must treat it as opaque. An apply that changes no spec field does not advance the generation.
4. **Observe and reconcile.** The controller compares `metadata.generation` with `status.observedGeneration`. When they differ, it makes the Pod count match `spec.replicas`, then writes `observedGeneration` to the generation it acted on. Pods that already exist are reused; scale-down removes Pods, and scale-up creates new ones with new names.
5. **Run and report readiness.** A new Pod is `Pending` while it waits for scheduling, image pulls, and container start. It becomes Ready when its Ready condition is true. That condition is reported by the node, not written by apply.
6. **Report again.** `status.readyReplicas` counts Ready Pods as the controller last saw them. A Pod that becomes Ready after the sync does not change status until the next sync.

Two boundaries follow from this. First, the stored `generation` tells you what was asked; `status.observedGeneration` tells you what the controller has acted on. If they differ, status describes an older spec. Second, a successful apply proves acceptance and storage, not Pod readiness. This fixture makes the reconcile step visible by doing it only on a sync. Real controllers react to watch events, so the lag is usually short, but it is not zero.

## YAML example

This manifest matches the card in the figure with `replicas: 2` and `selector.matchLabels.app: web`. The template label `app: web` stays fixed in this fixture, so changing the selector to `api` is an invalid combination.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
      - name: web
        image: shop-web:1.0
```

- `apiVersion` and `kind` select the schema and object type. Together with `metadata.namespace` they determine the object's identity in the API.
- `metadata.name` and `namespace` name the object. Re-applying the same pair updates the object; deleting it and applying again creates a new `uid`.
- `spec.replicas` is the desired Pod count. Changing it is a spec change, so the stored generation advances.
- `spec.selector.matchLabels` tells the controller which Pods it owns. It must match the template labels below it.
- `spec.template` describes the Pods the controller creates. Editing it changes Pods, not only the stored object.
- `status` is absent from the manifest. The server stores it, and the controller writes it.

## Try these changes

Start each experiment with **Reset fixture**.

1. **Edit only the card.** Set Card replicas to 3. The ChangeReport says no request was sent and the stored object is unchanged. Then press **Apply card**: generation moves from 1 to 2, `observedGeneration` stays 1, and the two Pods are untouched.
2. **Sync after apply.** From step 1, press **Run controller sync**. A third Pod appears as Pending, status moves to observed generation 2 with 3 replicas, and `readyReplicas` stays at 2 because the new Pod is not Ready.
3. **Ready is a separate event.** From step 2, press **Fixture: Pods become Ready**. Three Pods are Ready, but `readyReplicas` still reads 2. Press **Run controller sync** and it reads 3.
4. **A rejected apply stores nothing.** Reset, set Card selector app to `api`, and press **Apply card**. Validation rejects the request: the API server gate readout reads rejected with the selector reason, the stored generation and Pods are unchanged, and no controller work follows.
5. **Delete and recreate.** Reset, press **Delete Deployment**, then **Apply card**. The object comes back with a new UID and generation 1, and its status is empty. Its Pods are absent until a sync creates them, and they carry new names.

## Misconceptions

**Misconception:** "`kubectl apply` said configured, so the app is running."

**Correction:** It means the request was accepted and the stored object changed. Pods may not exist yet, may be Pending, or may not be Ready. Check status and Pods.

**Misconception:** "`status` is the live truth."

**Correction:** `status` is what the controller last wrote. Compare `metadata.generation` with `status.observedGeneration` before reading the counts as current.

**Misconception:** "A replacement with the same name is the same object."

**Correction:** The name can repeat, but a new object has a new UID. Its Pods are new objects with new UIDs, even when a name looks familiar.

**Misconception:** "I can compare `resourceVersion` values to find the newer object."

**Correction:** Clients must treat `resourceVersion` as opaque. Counters in this fixture are stand-ins for change detection, not an ordering contract.

**Misconception:** "Editing the file on my laptop changed the cluster."

**Correction:** Only a request sent to the API server changes stored state. The card is a copy of intent until it is applied.

## Safe read-only observation

These commands read state only:

```sh
kubectl get deployment web -n shop -o yaml
kubectl get deployment web -n shop -o jsonpath='{.metadata.generation}{" "}{.status.observedGeneration}{"\n"}'
kubectl rollout status deployment/web -n shop
kubectl get pods -n shop -l app=web -o wide
```

- The YAML output is a snapshot. It includes server-populated fields such as `uid` and `resourceVersion`, which you must not interpret as ordering.
- The jsonpath pair shows whether the controller has observed the current generation. It does not show whether the application serves traffic.
- `rollout status` reports the Deployment's progress conditions. It is not an application health check; that needs probes and your own tests.
- `-l app=web` finds Pods by label. Labels can match Pods that another controller owns, so check owner references when ownership matters.
- `kubectl diff -f web.yaml` previews a server-side dry-run apply. Nothing is persisted, but it sends a server-side dry-run request that needs write-type permissions, so it is not purely read-only in RBAC terms.

## Predict and transfer

1. A manifest has `spec.selector.matchLabels.app: api` and template label `app: web`. No object named `web` exists. **Predict:** the API server rejects the request. No UID is created and no Pods exist.
2. The stored object shows generation 4 and `observedGeneration` 3. **Predict:** the controller has not yet acted on generation 4, so status describes generation 3. A zero exit from `kubectl apply` proves acceptance of generation 4 only.
3. You delete the Deployment and apply the same file again. **Predict:** the object has a new UID and generation 1. Old Pods are gone, and new Pods have names that were never used for this Deployment.

## Assumptions and limits

The fixture is an authored model, not a live cluster, and it makes these simplifications:

- The Deployment controller and its ReplicaSet are one step. The ReplicaSet `web-6d4cf56db6` and its Pods `web-6d4cf56db6-<suffix>` stand in for real names, which follow `<deployment>-<pod-template-hash>-<suffix>`. The 10-character hash and the fixed suffixes are fixture values.
- Pods are created in one step, and becoming Ready is one fixture event. Scheduling, image pulls, container start, and probe results are not modelled.
- Deleting the Deployment removes its Pods at once. Real garbage collection of dependents runs in the background after the owner is removed.
- "Available" is not modelled. The fixture treats all desired Pods being Ready as the only availability state; real Deployments use the strategy's minimum availability.
- `uid` values (`u1`, `u2`) and `resourceVersion` numbers are counters, not real opaque values.
- Only `app: web` is a valid selector, so the selector immutability rule of `apps/v1` is not exercised separately.
- Status updates happen only at a fixture sync. Real controllers update status from watch events.
- The page does not run `kubectl` or prove anything about a cluster. Its claims were checked against the documentation listed below on 2026-10-12.

## Authoritative sources

Documentation reviewed 2026-10-12. This date records a review of the public docs, not a cluster observation.

- [Objects In Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/kubernetes-objects/): required fields, `spec` as desired state and `status` as observed state.
- [Kubernetes Object Management](https://kubernetes.io/docs/concepts/overview/working-with-objects/object-management/): imperative and declarative management; declarative apply creates or patches.
- [Declarative Management Using Configuration Files](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/): `kubectl diff` uses server-side dry-run before `kubectl apply`.
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/): selector and template labels, the ReplicaSet and Pod naming pattern, and `kubectl rollout status`.
- [Deployment API reference](https://kubernetes.io/docs/reference/kubernetes-api/apps/deployment-v1/): `spec.selector` must match the template labels; `status.observedGeneration`, `replicas`, and `readyReplicas`.
- [ObjectMeta reference](https://kubernetes.io/docs/reference/kubernetes-api/definitions/object-meta-v1-meta/): `generation`, `uid`, and opaque `resourceVersion`.
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/): Pending, Running, and the Pod's status fields.
- [API Concepts](https://kubernetes.io/docs/reference/using-api/api-concepts/): dry-run stages that run validation and admission before storage.
- [Garbage Collection](https://kubernetes.io/docs/concepts/architecture/garbage-collection/): background cascading deletion as the default.

## Continue with

- [Kubernetes manifests and API objects](/learn/kubernetes-manifests?mode=reference)
- [kubectl apply and live state](/learn/kubernetes-apply-live-state?mode=reference)
- [Kubernetes object lexicon](/learn/kubernetes-object-lexicon?mode=reference)
