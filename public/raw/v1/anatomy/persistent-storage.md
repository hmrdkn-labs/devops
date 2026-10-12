## The big picture

A container's writable layer disappears with the container, and a Pod can be replaced at any time. Data a workload must keep therefore lives in a volume whose lifecycle is separate from the Pod. Kubernetes models that with three objects: a **PersistentVolume** (PV) is the storage itself, a **PersistentVolumeClaim** (PVC) is the workload's request for storage, and a **StorageClass** is the administrator's recipe for creating storage on demand. The Pod only refers to the claim; it never names the disk.

The apparatus above is an original teaching fixture, not a recording of a cluster. A claim slip sits on the desk. The provisioner head for each zone lowers a strongbox into that zone's bay, which is the PV. The cart is a writer Pod. Its lane has a gate that is closed to a zone the bound volume is not in; while no volume is bound, every gate is open. Each control is either one action or starts a fresh scenario. The report beside the figure says what changed, who acted, why, and what has not happened yet.

## Who owns what

- **Workload author** writes the PVC (requested size, access mode, `storageClassName`) and the Pod's `volumes` entry that references the claim.
- **Cluster administrator** defines the StorageClass: `provisioner`, `reclaimPolicy`, and `volumeBindingMode`.
- **The provisioner** (here the fixture's `fast-zonal`; in a real cluster usually a CSI driver) creates the backing volume and the PV that represents it.
- **The PV controller** in the control plane binds a claim to one PV, one-to-one, and applies the reclaim policy when the claim goes away. Storage object-in-use protection holds a claim or volume until nothing needs it.
- **kube-scheduler** places the Pod. With a topology-constrained volume it must choose a node that can reach that volume.
- **kubelet and the node's CSI plugin** mount the volume into the Pod's container on the node where the Pod is assigned. Attaching the volume to that node is handled by control-plane attach components, not by the kubelet.
- **The application in the container** writes data to the mount path. Kubernetes does not write application rows.

These boundaries matter in a failure: the author chose the request, the administrator chose the class, the provisioner created the disk, and the scheduler only chose a node that could reach it.

## How it works

The figure runs the same sequence a real cluster follows, one step at a time.

1. **Claim.** The PVC asks for `1Gi`, `ReadWriteOnce`, and `storageClassName: fast-zonal`. Its phase is `Pending` until a PV is bound.
2. **Binding mode decides when provisioning happens.** With `Immediate`, the provisioner creates the volume as soon as the claim exists, before any Pod exists, so the zone is chosen without knowledge of where the Pod will run. With `WaitForFirstConsumer`, nothing is created until a Pod using the claim is scheduled; the volume is then created in the zone of the node the scheduler picked.
3. **Binding.** The PV controller binds the PVC to the PV one-to-one. A bound claim is exclusive: no other claim takes that PV.
4. **Pod placement.** The fixture's Pod asks for `kubernetes.io/hostname: node-a` through `nodeSelector`. The scheduler sets `nodeName` only after it finds a node that fits every constraint. If the volume sits in another zone, that node is rejected and the Pod stays unassigned.
5. **Mount.** The kubelet and CSI node plugin mount the volume where the Pod's container expects it. Mounting writes nothing. The fixture stops at *assigned and mounted*; it does not model container start or readiness.
6. **Application write.** Rows appear only when the application writes to the mount path. The fixture models that as one explicit action, **Writer appends a row**, enabled only while the Pod is assigned and mounted. The write is the application's, not Kubernetes'.
7. **Pod replacement.** Deleting a bare Pod releases its node and mount. The claim and the PV keep their own lifecycle. A new Pod with a new name mounts the same claim, and the rows already written are still there.
8. **Claim removal.** Deleting the PVC while a Pod uses it marks the claim `Terminating`. The `kubernetes.io/pvc-protection` finalizer holds it until no Pod references it. Then the reclaim policy the PV copied from its StorageClass runs: `Delete` removes the PV and the backing volume, rows included; `Retain` leaves the PV `Released`, with its rows, and not `Available` for a new claim.

## YAML example

This is the fixture's state after the claim is bound and the writer Pod is assigned. It is the same text the manifest panel beside the figure shows in that state.

```yaml
# StorageClass: cluster policy written by the administrator
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-zonal
provisioner: csi.example.com/zonal-block
reclaimPolicy: Delete
volumeBindingMode: Immediate
---
# PersistentVolumeClaim: the workload's request
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ledger
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: fast-zonal
  volumeName: pvc-4f2a
status:
  phase: Bound
---
# Pod: a bare writer, so no controller recreates it
apiVersion: v1
kind: Pod
metadata:
  name: ledger-writer-1
spec:
  nodeSelector:
    kubernetes.io/hostname: node-a
  nodeName: node-a # set by kube-scheduler on assignment
  containers:
    - name: writer
      image: registry.example.com/ledger-writer:1.4
      volumeMounts:
        - name: data
          mountPath: /var/lib/ledger
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: ledger
```

Annotations, by who writes each field:

- `reclaimPolicy` and `volumeBindingMode` are set by the administrator on the StorageClass. The PV copies `reclaimPolicy` when it is provisioned.
- `spec.accessModes` and `spec.resources.requests` are the workload's request. `ReadWriteOnce` limits read-write mounting to one node; it does not limit the number of Pods on that node.
- `spec.volumeName` names the PV the claim is bound to. You may set it to pre-bind a specific PV; the fixture shows the value the binding produced.
- `status.phase` is written by the control plane. You read it; you do not set it.
- `spec.nodeSelector` is the placement request you write. It limits the Pod to nodes with that hostname.
- `spec.nodeName` is written by the scheduler on assignment. Writing it yourself bypasses the scheduler, and with `WaitForFirstConsumer` the claim then stays pending.
- `claimName` is how the Pod refers to the claim. The Pod never names the PV or the disk.

Before the Pod is created the panel has no Pod block. A Pod that cannot be assigned shows `nodeSelector` with no `nodeName` line. Rows are application data, so they never appear in the manifest; the stage tag and the object status show the row count.

## Try these changes

Reset the fixture before each row. Each row lists the controls in the order to use them.

| Controls | What changes | Expected result |
| --- | --- | --- |
| Create claim (Immediate) | Creates PVC `ledger`, provisions and binds PV `pvc-4f2a` in zone a | The claim is `Bound` before any Pod exists; the PV holds 0 rows |
| Next Pod node = node-b, then Create writer Pod | Limits the next Pod to node-b, in zone b | The cart stops at the closed zone b gate; the Pod stays Pending because the volume's zone excludes node-b; no `nodeName` appears |
| Volume binding mode = WaitForFirstConsumer, Create claim, Next Pod node = node-b, Create writer Pod | Delays provisioning until the Pod exists | The claim is `Pending` with no PV until the Pod is created; then the Pod is assigned to node-b and the PV is created in zone b with 0 rows |
| Create claim, Create writer Pod, Writer appends a row, Delete writer Pod, Create writer Pod | The second Pod mounts the same claim | The new Pod is `ledger-writer-2`, mounts `pvc-4f2a`, and the volume still holds the row the first Pod wrote |
| Reclaim policy = Retain: Create claim, Create writer Pod, Writer appends a row, Delete writer Pod, Delete claim | The PV copies `Retain`; the claim is removed after its Pod is gone | The PV becomes `Released` and keeps its 1 row; a new claim does not bind it |
| Create claim, Create writer Pod, Delete claim, then Delete writer Pod | Claim removal waits for its Pod | The claim is `Terminating` with `pvc-protection` until the Pod is removed; then Delete reclaims the PV and its rows |

The sixth row is the access-mode control. Set the claim to `ReadWriteMany` and Create claim: it stays `Pending` with no PV, because this fixture's provisioner supports only `ReadWriteOnce`. Real support depends on the CSI driver and volume type, not on a StorageClass field. A Pod cannot repair a claim that asked for a mode the provisioner cannot create.

## Misconceptions

**Misconception:** "The Pod chooses where the data lives."

**Correction:** With `Immediate`, the volume's zone is fixed before any Pod exists. The scheduler can only choose among nodes that can reach it. With `WaitForFirstConsumer`, the scheduler chooses the node first, and provisioning follows that choice.

**Misconception:** "Mounting the volume writes data to it."

**Correction:** A mount only attaches the storage to the container's path. Rows exist when the application writes to that path. The fixture shows that write as an explicit action so the two steps cannot be confused.

**Misconception:** "`ReadWriteOnce` means only one Pod can use the volume."

**Correction:** `ReadWriteOnce` limits mounting to a single node. Several Pods on that node can still read and write it. To restrict use to one Pod, Kubernetes offers `ReadWriteOncePod`, which this fixture does not model.

**Misconception:** "A Released volume is ready for the next claim."

**Correction:** With `Retain`, the previous claimant's data remains on the volume, so the PV is not `Available`. Reuse needs a deliberate cleanup or a new PV definition that points at the same storage asset.

**Misconception:** "Deleting the Pod deletes the data."

**Correction:** Deleting a Pod releases its node and its mount. Whether data is deleted depends on the claim and reclaim policy, and on whether the claim is still in use.

## Safe read-only observation

Against a cluster you are authorized to inspect, these commands only read state:

```sh
kubectl get storageclass
kubectl get pvc -n NAMESPACE
kubectl describe pvc CLAIM_NAME -n NAMESPACE
kubectl get pv
kubectl get pod POD_NAME -n NAMESPACE -o jsonpath='{.spec.nodeName}{"\n"}'
kubectl describe pod POD_NAME -n NAMESPACE
```

Replace the names with real objects. `describe pvc` shows the claim's phase, bound volume, and provisioning events. `describe pod` shows scheduling events, such as a volume node-affinity conflict, and mount problems. `kubectl get pv` lists cluster-scoped volumes, so you may not be allowed to see volumes you do not own.

**Limit:** These are snapshots, and events expire. An empty `nodeName` does not prove the scheduler tried every node, and a Bound claim does not prove the volume is mounted on a node. Neither command reads the rows an application wrote. This page has not executed these commands against a live cluster.

## Predict and transfer

A StorageClass uses `volumeBindingMode: WaitForFirstConsumer` and `reclaimPolicy: Delete`. A claim is created, then a Pod with `nodeSelector: kubernetes.io/hostname: node-b` is created.

**Prediction:** The volume is provisioned in the zone of node-b after the Pod is scheduled, and the claim is bound to it. If the Pod is deleted and then the claim, the Delete policy removes the PV and its backing volume. The fixture gives each node its own zone, so node-b is zone b; a real cluster uses the topology labels that the driver reports.

Now change the binding mode to `Immediate` and keep the same Pod selector. A volume created before the Pod exists can be in the other zone, and the Pod can remain unschedulable. That is the failure `WaitForFirstConsumer` was designed to avoid.

Continue with [Kubernetes configuration, secrets, and storage](/learn/config-secrets-storage?mode=reference) and [Kubernetes storage lifecycle](/learn/kubernetes-storage-lifecycle?mode=reference). This explanation supports their claim-binding, topology, and reclaim objectives; exploring the object does not record mastery.

## Assumptions and limits

The fixture has one StorageClass, `fast-zonal`, one claim, `ledger`, and one bare writer Pod at a time. There are two nodes: node-a is in zone a and node-b is in zone b, so one node stands for one zone. With `Immediate`, the fixture always provisions in zone a; a real provisioner chooses a zone itself, and `allowedTopologies` can restrict that choice.

The fixture's provisioner supports only `ReadWriteOnce`. That is a simplification: real support depends on the CSI driver and volume type, and a StorageClass has no `accessModes` field.

**Writer appends a row** is a fixture simplification. A real application writes whenever it likes, and each write is application behaviour, not a Kubernetes event. The fixture allows one row per action, and only from an assigned, mounted Pod.

The names `pvc-4f2a` and `ledger-writer-1` are deterministic fixture names. Real dynamically provisioned PV names are generated. The model does not run CSI calls, attach or detach volumes, expand, snapshot, back up, or time events. Mounted means assigned and mounted, not Running or Ready. Containers, filesystem permissions, and the application's own logic are outside the model.

The figure is an authored fixture, not a live-cluster observation or a mastery claim.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) — claim and volume lifecycle, one-to-one binding, storage object-in-use protection, reclaim policies, and access modes (ReadWriteOnce limits mounting to one node).
- [Kubernetes: Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/) — provisioner, `reclaimPolicy` (default `Delete`), `volumeBindingMode` (`Immediate` versus `WaitForFirstConsumer`), and the warning that setting a Pod's `nodeName` bypasses the scheduler and leaves the PVC pending under WaitForFirstConsumer.
