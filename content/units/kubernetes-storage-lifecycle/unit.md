# Kubernetes persistent storage lifecycle

Containers and Pods are replaceable, so durable data needs a lifecycle that is not tied to one container writable layer.

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
