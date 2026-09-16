# Configuration, secrets, and persistent storage

A ConfigMap stores non-confidential configuration. A Secret uses a distinct API
type and delivery semantics for sensitive data, but its values are only
base64-encoded in ordinary manifests. Protect Secrets with API authorization,
encryption at rest, careful mounts, audit policy, and preferably an external
secret source or short-lived workload identity.

Environment variables are captured at process start. Mounted projected files
can update after the source object changes, but the application must reread
them. A configuration rollout should therefore be an explicit lifecycle choice,
not an assumption that every process observes updates automatically.

Persistent storage separates data lifecycle from Pod lifecycle:

- A PersistentVolumeClaim states a workload's storage request.
- A StorageClass describes a provisioning policy.
- A CSI driver provisions, attaches, mounts, snapshots, or expands storage
  according to supported operations.
- A PersistentVolume represents the bound storage resource.

A fresh EKS cluster does not necessarily provision an EBS-backed claim by
itself. The EBS CSI driver, permissions, and a suitable StorageClass must exist.
An EBS volume is bound to one availability zone. A Pod using it can move to
another node in that zone, but it cannot simply reattach the same volume in a
different zone after a complete AZ failure.

~~~text
PVC → StorageClass → CSI provisioning → zonal PV
Pod scheduling must respect the PV topology
~~~

Choose storage from durability, access mode, latency, backup, and failure-domain
requirements rather than from the fact that it can be mounted.

## Worked case: change configuration without confusing it with data

These are authored fixture observations, not a live-cluster transcript:

~~~text
ConfigMap/report-settings: MODE changed fast → safe
old Pod UID=a1: process mode=fast
PVC/report-exports: Bound to PV/export-disk
new Pod UID=b2: process mode=safe; /exports/2026-09.csv readable
~~~

The mode diagnostic proves what each process actually loaded. The claim and PV
records identify storage intent; reading the existing export proves reuse at the
application filesystem boundary. The kubelet and storage integration realize
the mount, while the application loads configuration and reads data.

A normal ConfigMap volume projection can update eventually, but the application
must reread its files. A mount using `subPath` does not receive ConfigMap updates.
None of these delivery choices makes the same zonal disk available in every zone.
