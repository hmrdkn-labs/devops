# Kubernetes object lexicon

Use this as a **responsibility map**, not a YAML memorization sheet. Start with the
problem you need Kubernetes to solve, then choose the object that owns that
problem. Only after that should you care about fields.

The exact fields accepted by an API server can change with Kubernetes version,
enabled APIs, admission policy, and defaulting. When precision matters, ask the
cluster with `kubectl api-resources` and `kubectl explain` instead of trusting a
memorized minimal manifest.

## The whole map in one view

| Kind | Scope | API group/version | Primary job | Do not confuse it with |
| --- | --- | --- | --- | --- |
| Pod | namespace | `v1` | Schedulable execution envelope for one or more co-located containers | a replica/rollout controller |
| ReplicationController | namespace | `v1` | Legacy replica-count controller | ReplicaSet; learn mainly for legacy/exam recognition |
| ReplicaSet | namespace | `apps/v1` | Keep a selected Pod population at a desired count | Deployment rollout management |
| Deployment | namespace | `apps/v1` | Manage ReplicaSets and stateless rollout revisions | directly running containers |
| StatefulSet | namespace | `apps/v1` | Manage Pods that need stable identity and commonly persistent storage | a normal interchangeable Deployment |
| DaemonSet | namespace | `apps/v1` | Run a Pod on every eligible node or node subset | setting `replicas` manually |
| Job | namespace | `batch/v1` | Run work to successful completion | a continuously running service |
| CronJob | namespace | `batch/v1` | Create Jobs on a schedule | a long-running scheduler daemon |
| Service | namespace | `v1` | Stable service identity and traffic selection for changing backends | a workload controller |
| Ingress | namespace | `networking.k8s.io/v1` | Declare HTTP/HTTPS routing to Services | the ingress controller that implements it |
| NetworkPolicy | namespace | `networking.k8s.io/v1` | Declare allowed L3/L4 Pod traffic when the network plugin enforces it | a firewall process by itself |
| EndpointSlice | namespace | `discovery.k8s.io/v1` | Represent current network backends associated with a Service | the legacy Endpoints API |
| ConfigMap | namespace | `v1` | Store non-confidential configuration data | a Secret or controller |
| Secret | namespace | `v1` | Store sensitive configuration data | encryption by default |
| PersistentVolume | cluster | `v1` | Represent storage capacity available to the cluster | a namespaced request for storage |
| PersistentVolumeClaim | namespace | `v1` | Request storage for a workload | the backing storage implementation itself |
| StorageClass | cluster | `storage.k8s.io/v1` | Describe a class/provisioning policy for storage | a particular PVC or PV |
| Namespace | cluster | `v1` | Scope names and many policy/access operations | a complete security boundary |
| Node | cluster | `v1` | Represent a machine registered with the cluster | a Pod or workload controller |
| ServiceAccount | namespace | `v1` | Give a workload an API identity | a permission grant by itself |
| Role | namespace | `rbac.authorization.k8s.io/v1` | Define permissions within one namespace | the binding that gives them to a subject |
| RoleBinding | namespace | `rbac.authorization.k8s.io/v1` | Grant a Role or ClusterRole inside one namespace | a ClusterRoleBinding |
| ClusterRole | cluster | `rbac.authorization.k8s.io/v1` | Define reusable or cluster-scoped permissions | automatically granting those permissions |
| ClusterRoleBinding | cluster | `rbac.authorization.k8s.io/v1` | Grant a ClusterRole cluster-wide | a namespaced RoleBinding |
| ResourceQuota | namespace | `v1` | Cap aggregate resource/object consumption in a namespace | per-container defaults/bounds |
| LimitRange | namespace | `v1` | Set per-object resource defaults, minimums, maximums, or ratios | the namespace-wide aggregate budget |

## Pick the object from the requirement

```text
Need to run application containers?
  ├─ one disposable execution unit → Pod
  ├─ interchangeable replicas + rollout → Deployment
  ├─ stable identity / persistent member identity → StatefulSet
  ├─ one per eligible node → DaemonSet
  ├─ finite work → Job
  └─ finite work on a schedule → CronJob

Need to reach or constrain workloads?
  ├─ stable discovery / traffic selection → Service
  ├─ HTTP(S) host/path routing → Ingress (or Gateway in newer designs)
  ├─ allowed Pod traffic → NetworkPolicy
  └─ concrete Service backends → EndpointSlice

Need data or policy?
  ├─ non-secret config → ConfigMap
  ├─ sensitive config → Secret
  ├─ storage request → PVC
  ├─ storage capacity → PV
  ├─ storage provisioning policy → StorageClass
  ├─ namespace aggregate budget → ResourceQuota
  └─ per-object resource defaults/bounds → LimitRange

Need API identity or authorization?
  ├─ workload identity → ServiceAccount
  ├─ namespaced permission definition → Role
  ├─ reusable / cluster-scoped permission definition → ClusterRole
  ├─ grant inside one namespace → RoleBinding
  └─ grant cluster-wide → ClusterRoleBinding
```

## Workload controllers: who creates the Pod?

The most useful ownership chain is still:

```text
Deployment → ReplicaSet → Pod → containers
```

A Deployment owns rollout-level intent and ReplicaSet revisions. A ReplicaSet
directly reconciles the number of matching Pods. The scheduler later chooses a
node for a newly created Pod; kubelet and the runtime execute it on that node.

Other controllers change the ownership rule:

- **StatefulSet**: members have stable ordinal identity; storage is commonly tied
  to that identity through per-Pod claims.
- **DaemonSet**: desired membership follows eligible nodes instead of a numeric
  replica target.
- **Job**: desired state is successful completion, not “keep this process alive
  forever.”
- **CronJob**: creates Jobs according to a schedule; the Job then owns Pods.

## Networking objects: identity, routing, policy, backend state

Keep four layers separate:

```text
client
  ↓
Ingress / Gateway-style routing
  ↓
Service stable identity
  ↓
EndpointSlice backend set
  ↓
Pod IP:port

NetworkPolicy constrains allowed Pod traffic alongside that path.
```

A Service is not a workload controller. It does not create or replace Pods. A
selector-based Service is associated with EndpointSlices that track matching
backends. The older Endpoints API is deprecated; prefer EndpointSlice when
reasoning about current Kubernetes backend state.

Ingress remains a stable API for HTTP/HTTPS routing, but the Kubernetes project
has frozen the Ingress API and recommends Gateway for newer feature development.
An Ingress object also needs an implementing controller; creating the object
alone does not make traffic flow.

NetworkPolicy is similarly declarative: enforcement depends on the cluster's
network implementation supporting NetworkPolicy.

## Configuration and storage: data versus claims versus capacity

`ConfigMap` and `Secret` are data objects. They do not reconcile a workload by
themselves.

- ConfigMap: non-confidential configuration.
- Secret: confidential data. Base64-encoded Secret data is **not encryption**;
  access control and encryption-at-rest configuration matter.

Persistent storage uses a request/capacity/policy split:

```text
StorageClass (provisioning policy)
        ↓ may dynamically provision
PersistentVolume (cluster storage capacity)
        ↕ bind
PersistentVolumeClaim (namespaced request)
        ↓ referenced by
Pod
```

This is a strong example of Kubernetes scope: the PV is cluster-scoped, while
the PVC that a workload uses is namespaced.

## Access: definition versus grant

RBAC has two separate questions:

1. **What actions are allowed?** `Role` or `ClusterRole`.
2. **Who receives those actions, and at what scope?** `RoleBinding` or
   `ClusterRoleBinding`.

```text
Role ───────────────┐
                    ├─ RoleBinding → permissions inside one namespace
ClusterRole ────────┘

ClusterRole → ClusterRoleBinding → cluster-wide grant
```

A RoleBinding can reference a Role in its namespace or a ClusterRole. A
ClusterRoleBinding grants a ClusterRole across the cluster. Kubernetes RBAC is
additive; there is no RBAC “deny” rule that cancels an allow rule.

A ServiceAccount supplies workload identity but no useful permission merely by
existing. Bind RBAC permissions to it when that workload needs API access.

## Namespace policy: ResourceQuota versus LimitRange

These solve different resource-control problems:

| Question | Use |
| --- | --- |
| “How much can this namespace consume in total?” | `ResourceQuota` |
| “What defaults/min/max apply to each container, Pod, or PVC?” | `LimitRange` |

A `ResourceQuota` can cap aggregate CPU, memory, storage, or object counts in a
namespace. A `LimitRange` can default or constrain individual resource requests
and limits. They are often paired because quota may require resource requests or
limits while a LimitRange can supply defaults.

## API groups you should derive, not memorize blindly

| Group/version | Common kinds |
| --- | --- |
| `v1` | Pod, Service, ConfigMap, Secret, Namespace, Node, ServiceAccount, PV, PVC, ResourceQuota, LimitRange, legacy ReplicationController |
| `apps/v1` | Deployment, ReplicaSet, StatefulSet, DaemonSet |
| `batch/v1` | Job, CronJob |
| `networking.k8s.io/v1` | Ingress, NetworkPolicy |
| `discovery.k8s.io/v1` | EndpointSlice |
| `rbac.authorization.k8s.io/v1` | Role, RoleBinding, ClusterRole, ClusterRoleBinding |
| `storage.k8s.io/v1` | StorageClass |

For RBAC rules, resources in the core `v1` group use `apiGroups: [""]`.

## `spec` is common, not universal

Do not assume every object stores its user payload under `spec`.

| Kind | Important top-level payload |
| --- | --- |
| ConfigMap | `data`, `binaryData` |
| Secret | `data`, `stringData`, `type` |
| Role / ClusterRole | `rules` |
| RoleBinding / ClusterRoleBinding | `subjects`, `roleRef` |
| StorageClass | `provisioner`, `parameters`, `reclaimPolicy`, `volumeBindingMode` |
| EndpointSlice | `addressType`, `ports`, `endpoints` |
| ServiceAccount / Namespace | often metadata is enough for the basic object |

This is why “every Kubernetes object is apiVersion + kind + metadata + spec” is
a useful beginner approximation but not a schema rule.

## Five small skeletons worth being able to read

### Deployment: rollout intent

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
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
        - name: web
          image: nginx:1.27
```

### Service: stable traffic identity

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
```

### PVC: storage request

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi
```

### RoleBinding: grant existing permissions

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-view
  namespace: team-a
subjects:
  - kind: ServiceAccount
    name: app
    namespace: team-a
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: view
```

### ResourceQuota: namespace aggregate budget

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-budget
  namespace: team-a
spec:
  hard:
    pods: "20"
    requests.cpu: "4"
    requests.memory: 8Gi
```

Treat these as reading practice, not “the one true minimal YAML.”

## Ask the cluster when memory is uncertain

```text
kubectl api-resources
kubectl api-resources --namespaced=false
kubectl api-resources --api-group=rbac.authorization.k8s.io
kubectl explain statefulset.spec
kubectl explain statefulset.spec --recursive
```

`kubectl api-resources` tells you what the server supports, including names,
short names, API groups, and scope. `kubectl explain` reads schema information
from the server. Those two commands are more durable than memorizing a static
field list.

## Retrieval checklist

Before leaving this page, answer these without looking up the table:

1. Which object owns rollout revisions? Which object owns matching Pod count?
2. Which workload object follows nodes rather than a numeric replica target?
3. What is the difference between Service, EndpointSlice, and NetworkPolicy?
4. Why are PV and StorageClass cluster-scoped while PVC is namespaced?
5. What is the difference between Role and RoleBinding?
6. What is the difference between ResourceQuota and LimitRange?
7. Which commands let you derive API group, scope, and fields from the server?
