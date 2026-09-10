# KCNA Kubernetes Resources quiz companion

This is the compact companion for the Kubernetes Resources module: Pods, YAML, ReplicaSets, Deployments, rollout/rollback, imperative versus declarative management, `kubectl explain`, `kubectl apply`, and namespaces.

## 30-second scan

| Resource/concept | Remember this first |
| --- | --- |
| Pod | Smallest Kubernetes scheduling unit; one or more co-located containers sharing Pod networking and declared volumes. |
| ReplicaSet | Maintains a desired number of Pods matching a selector. |
| Deployment | Manages ReplicaSets and rollout history for replaceable application Pods. |
| Label | Key/value metadata. |
| Selector | Membership rule that selects objects by labels. |
| `spec` | Desired state you request. |
| `status` | Observed state reported by Kubernetes components. |
| `kubectl apply` | Declaratively merges/applies intended fields into the live API object. |
| `kubectl explain` | Reads API schema/help for resource fields. |
| Namespace | API naming/scope boundary for namespaced resources; not automatic network/security isolation. |

Keep the ownership chain visible:

```text
Deployment
  │ manages rollout / ReplicaSets
  ▼
ReplicaSet
  │ maintains desired matching Pod count
  ▼
Pod
  │ scheduled to one node
  ▼
containers
```

## Pods

A Pod is the unit the scheduler places on a node. Containers inside the same Pod are co-located, share the Pod's network namespace, and can share declared volumes. The Pod is replaceable; do not treat it as a durable machine.

High-value distinctions:

- **Container restart:** the kubelet may restart a failed container inside the same Pod.
- **Pod replacement:** a controller creates a new Pod object with a new UID, potentially a new node and IP.
- **Pod phase:** `Pending`, `Running`, `Succeeded`, `Failed`, `Unknown` are coarse phases.
- **`CrashLoopBackOff`:** a kubectl-visible restart/backoff condition, not a Pod phase.

If a node dies, Kubernetes does not live-migrate that Pod object. A controller can create a replacement Pod that gets scheduled elsewhere.

## YAML / object anatomy

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

| Field | Meaning |
| --- | --- |
| `apiVersion` | API group/version used for this object. |
| `kind` | Resource type. |
| `metadata` | Identity/organization: name, namespace, labels, annotations, UID, etc. |
| `spec` | Desired state for resources that expose a spec. |
| `status` | Current observed state written by Kubernetes components. |

Kubernetes does not "run YAML." YAML is a serialization of an API request. API acceptance proves that the object was accepted, not that the workload became healthy.

## ReplicaSets, labels, and selectors

A ReplicaSet's selector decides which Pods count toward its desired replica number. Its Pod template says what newly created Pods should look like.

```text
desired replicas = 3
selector = app=web

2 matching Pods → controller creates 1
3 matching Pods → converged
4 matching Pods → controller removes 1
```

The selector and the Pod template labels must agree. Deleting a selected Pod does not change the ReplicaSet's desired count, so the controller normally creates another one.

Quiz trap: labels provide metadata and selection. A namespace provides namespaced API scope. Neither concept should be substituted for the other.

## Deployments and rollouts

A Deployment manages ReplicaSets. Changing the Pod template, such as the image, causes a new ReplicaSet/revision to represent the new template. During a rolling update, replicas move from the old ReplicaSet to the new one.

```text
Deployment
   ├── RS old ── old Pods ↓
   └── RS new ── new Pods ↑
```

For `RollingUpdate`:

- `maxSurge` limits temporary replicas above the desired count.
- `maxUnavailable` limits how many desired replicas may be unavailable during the update.

Changing `.spec.replicas` changes capacity. Changing `.spec.template` creates a rollout because the desired Pod template changed.

A rollback restores an earlier Deployment Pod-template revision. It does not roll back database contents, migrations, external state, or application side effects.

## Imperative versus declarative

| Style | Mental model | Example use |
| --- | --- | --- |
| Imperative | "Perform this action." | Quick create/scale/delete/debug action. |
| Declarative | "This is the configuration I want." | Versioned, reproducible desired state with `kubectl apply`. |

The useful KCNA point is not that one style is always correct. Declarative configuration is especially useful when the file/repository is intended to remain the durable source of desired state.

## `kubectl explain`

`kubectl explain` uses the Kubernetes API schema information to describe resources and fields. It is useful when you cannot remember whether a field belongs at one path or another.

```text
kubectl explain pod
kubectl explain pod.spec
kubectl explain deployment.spec.strategy
```

Quiz cue: use `explain` for **resource/field schema help**, not for live object events or runtime diagnosis.

## `kubectl apply`

Keep three states separate:

```text
file on disk  ──apply──► live API object ──reconciliation──► runtime reality
```

`kubectl apply` updates the live API object according to apply semantics and field ownership. A successful `configured` message says the API operation succeeded. It does not prove that Pods scheduled, images pulled, readiness passed, or users can reach the app.

For troubleshooting, walk downstream:

```text
apply accepted
  → live Deployment spec
  → ReplicaSet state
  → Pod scheduling/readiness/events
  → Service/endpoints/networking
  → real request
```

## Namespaces

Namespaces scope the names of many Kubernetes resources. `Deployment/web` in `team-a` and `Deployment/web` in `team-b` are different namespaced objects.

Common namespaced resources include Pods, Deployments, Services, ConfigMaps, and Secrets. Nodes and Namespaces are cluster-scoped.

Creating a namespace alone does not automatically provide network isolation, RBAC isolation, or resource quotas. Those come from mechanisms such as NetworkPolicy, RBAC, ResourceQuota, LimitRange, and security controls.

## Fast command table

| Goal | Command cue |
| --- | --- |
| List Pods with node/IP | `kubectl get pods -o wide` |
| Read events/conditions/owner | `kubectl describe pod <pod>` |
| Inspect full live object | `kubectl get <kind> <name> -o yaml` |
| See ReplicaSets behind Deployment | `kubectl get rs` |
| Follow rollout | `kubectl rollout status deployment/<name>` |
| View rollout history | `kubectl rollout history deployment/<name>` |
| Roll back Deployment revision | `kubectl rollout undo deployment/<name>` |
| API field help | `kubectl explain <resource>[.<field>]` |
| Work in explicit namespace | `kubectl get pods -n <namespace>` |

## Quiz traps to rehearse

1. A Deployment manages ReplicaSets; the ReplicaSet directly maintains matching Pod count.
2. Deleting a Pod does not reduce desired replicas when a controller still wants the old count.
3. A new Deployment Pod template produces a new ReplicaSet; Kubernetes replaces Pods instead of editing existing Pod containers in place.
4. `status` is observed state. You normally express intent in `spec`.
5. A successful apply proves API acceptance/update, not application health.
6. Namespace is scope/organization, not automatic traffic or access isolation.
7. Labels and selectors define membership; labels alone do not create ownership or security.
8. `CrashLoopBackOff` is not one of the Pod phases.

## Before you answer a resources MCQ

Trace the object ownership first. Then ask whether the question changed **desired state** or only **observed state**. Finally, distinguish an API-level success from runtime proof. Those three checks eliminate a large fraction of plausible wrong answers.
