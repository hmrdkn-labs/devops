# Kubernetes persistent storage lifecycle

Containers and Pods are replaceable, so durable data needs a lifecycle that is not tied to one container writable layer.

## Start with Docker storage boundaries

Image layers describe the reusable artifact. A container writable layer holds
changes made by that container; deleting the container discards that layer.
Restarting the same Docker container is different from removing it and creating
a new one. Do not use its writable layer as the only durable database store.

| Mechanism | Location/lifecycle | Typical use and caution |
| --- | --- | --- |
| Docker named volume | Managed by Docker and independent of a particular container | Persistent application data; deleting the volume still deletes its data |
| Bind mount | A chosen host path exposed to the container | Local development or host files; host layout and permission coupling |
| tmpfs mount | Memory-backed, non-persistent storage | Temporary working data; contents do not survive container stop/restart |

Docker's local volume driver is one implementation. Volume-driver plugins can
integrate other storage systems, subject to plugin and backend semantics. A
driver chooses how storage is made available; it does not promise backups,
cross-host access, or availability across zones. A Docker volume plugin and a
Kubernetes CSI driver solve related integration problems but are not
interchangeable configuration APIs.

## A Pod volume is not always persistent storage

A Kubernetes `volume` is declared by the Pod and mounted into containers with
`volumeMounts`. An `emptyDir` can share scratch data between containers and
survives an individual container restart, but its lifetime is the Pod's. A
`hostPath` uses node-local storage and can expose sensitive host files; it is
not portable durable storage merely because it survives a Pod deletion on that
same node. A PVC-backed volume follows the separate claim/backing-storage
lifecycle described below.

## Separate request, policy, resource, and executor

```text
Pod references PVC
  -> PVC requests capacity/access characteristics
      -> StorageClass selects a provisioning policy
          -> CSI driver/provisioner talks to the storage system
              -> PV represents the bound storage resource
                  -> node-side CSI operations make it usable by the Pod
```

A **PersistentVolumeClaim (PVC)** is the workload-side request. A **PersistentVolume (PV)** represents storage made available to the cluster. A **StorageClass** describes a class/provisioning policy. A **CSI driver** is the integration that performs storage-system operations supported by that provider.

The API objects express intent and state; they do not themselves create a cloud disk or mount a filesystem.

## Dynamic provisioning

With dynamic provisioning, a PVC references or selects a StorageClass and the associated provisioner can create suitable backing storage. A PVC that stays `Pending` is therefore not automatically a scheduler problem. Inspect the StorageClass, provisioner/CSI driver, requested access mode and capacity, topology, events, and quotas.

Some StorageClasses use `WaitForFirstConsumer` volume binding. That intentionally delays provisioning or binding until a Pod exists so storage topology can be chosen consistently with Pod scheduling.

## Access mode is not a performance tier

Access modes describe supported mount access such as `ReadWriteOnce`, `ReadOnlyMany`, and `ReadWriteMany`. They do not tell you latency, IOPS, backup policy, replication, or whether the storage survives a zone failure.

Choose storage using application semantics: durability, sharing model, latency, backup/restore, consistency, topology, and recovery requirements.

## Replacement does not mean universal reattachment

If a Pod using a PVC is replaced, Kubernetes can schedule a new Pod that references the same claim only where the underlying storage can be attached or accessed.

A zonal block volume is a useful example: a replacement Pod may move to another node in the same zone, but the same zonal volume cannot simply appear in another availability zone. The scheduler and storage integration must respect topology.

## Reclaim policy controls what happens after the claim

PV reclaim policy affects the backing resource after the claim is released. `Delete` may remove dynamically provisioned storage; `Retain` keeps the resource for manual recovery or reuse workflow. Do not confuse reclaim behavior with backup.

## StatefulSet adds stable claim identity

StatefulSets can use `volumeClaimTemplates` so each Pod identity receives its own PVC. Replacing `db-0` can preserve the claim associated with that ordinal while the Pod object itself is recreated.

The durable mental model is: **Pod lifecycle and storage lifecycle intersect, but they are not the same lifecycle.**

## Worked case: three deletions are three different boundaries

~~~text
StorageClass/zonal: volumeBindingMode=WaitForFirstConsumer
before consumer: PVC/ledger Pending
after consumer: PVC/ledger Bound → PV/ledger-a, zone=a, Retain
delete consumer Pod only: PVC/ledger still Bound
delete claim after use ends: PV/ledger-a Released; old data remains
~~~

This is an authored lifecycle comparison, not an instruction to delete storage.
The provisioner creates backing storage; node-side operations make it usable.
A replacement using the same claim must satisfy the zone and access constraints.
`Retain` protects the reclamation boundary, but it is neither a backup nor an
automatic clean volume for the next tenant.

With delayed binding, assigning `spec.nodeName` directly bypasses the scheduler
and can leave the claim Pending. Express an appropriate node selector instead
when scheduler participation is needed; inspect events before changing placement.
