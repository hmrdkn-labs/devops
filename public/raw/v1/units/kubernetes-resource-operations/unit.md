# Kubernetes resource operations and defaults

This unit is the bridge between knowing **what a Kubernetes object is** and being
able to operate it under exam or troubleshooting pressure. The durable rule is:

> Identify the API responsibility first, then choose the command or field that
> changes or observes that responsibility.

Do not memorize an undifferentiated pile of `kubectl` strings. Group commands by
intent: **inspect, change capacity, change a Pod template, inspect rollout
history, undo a rollout, or change namespace scope**.

## 1. Selector structure: field path versus membership rule

A modern `apps/v1` ReplicaSet uses a structured `LabelSelector`:

```yaml
apiVersion: apps/v1
kind: ReplicaSet
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

Keep these paths distinct:

```text
.spec.replicas                    desired count
.spec.selector.matchLabels        membership rule
.spec.template.metadata.labels    labels placed on newly created Pods
```

The selector is not merely a description of Pods the ReplicaSet created. It is
the set the ReplicaSet reconciles. Matching Pods that already exist can count
toward that set and, when ownership rules allow it, can be adopted. This is why
overlapping controller selectors are dangerous.

### Legacy ReplicationController is different

`ReplicationController` is a legacy workload API worth recognizing, but normal
application delivery should prefer a Deployment. Its selector syntax is an
equality map rather than an `apps/v1` `LabelSelector` object:

```yaml
spec:
  selector:
    app: web
```

For a ReplicationController, `.spec.selector` may be omitted; the API defaults it
from `.spec.template.metadata.labels`. Do **not** transfer that rule to an
`apps/v1` Deployment, whose selector must be specified and must match the Pod
template labels.

## 2. Ownership: Deployment, ReplicaSet, Pod

Use the ownership chain to answer "what gets created?" questions:

```text
Deployment
  │ rollout intent / revision history
  ▼
ReplicaSet
  │ desired matching Pod count
  ▼
Pod
  │ execution envelope
  ▼
containers
```

Creating a Deployment causes the Deployment controller to manage a ReplicaSet,
and that ReplicaSet creates Pods as needed. A Service is a separate networking
object; it is not automatically created just because a Deployment exists.

A Deployment's value is not merely "multiple instances." It adds rollout
management: new Pod-template revisions, controlled replacement, rollout status,
history, and rollback behavior.

## 3. Scale is a desired-state change

You can change replica count imperatively:

```bash
kubectl scale rs/web --replicas=6
kubectl scale deployment/web --replicas=6
```

Or you can change `.spec.replicas` in a configuration file and apply the file:

```yaml
spec:
  replicas: 6
```

```bash
kubectl apply -f deployment.yaml
```

Both change desired workload capacity. Deleting a managed Pod does not do that;
the controller still wants the old replica count and replaces the missing Pod.

Be careful when mixing management styles. If a declarative manifest contains a
replica count, a later apply can overwrite a direct `kubectl scale` change.

## 4. A command map worth remembering

Think in command families:

| Intent | Command |
| --- | --- |
| List Pods in current namespace | `kubectl get pods` |
| List Pods across namespaces | `kubectl get pods -A` |
| List common resource categories | `kubectl get all` |
| Discover resource kinds supported by the API | `kubectl api-resources` |
| Scale a ReplicaSet | `kubectl scale rs/web --replicas=6` |
| Change a Deployment container image | `kubectl set image deployment/web app=repo/app:v2` |
| Follow rollout progress | `kubectl rollout status deployment/web` |
| View rollout revisions | `kubectl rollout history deployment/web` |
| Undo the latest Deployment rollout | `kubectl rollout undo deployment/web` |

`kubectl get all` is a convenience view, not evidence that you enumerated every
API kind in the cluster. Use `kubectl api-resources` when you need the resource
inventory, then query the relevant kinds explicitly.

### Imperative versus declarative

This vocabulary is about **how intent is expressed**:

```text
imperative  → "perform this action"
declarative → "make reality match this configuration"
```

`kubectl set image`, `kubectl scale`, and `kubectl delete` are imperative
operations. `kubectl apply -f ...` is a declarative configuration workflow.
Neither word means "automatic" or "manual" by itself.

## 5. Rollout commands are a small state machine

An image update changes the Deployment Pod template:

```bash
kubectl set image deployment/web app=repo/app:v2
```

That produces a new Deployment revision / ReplicaSet. Then use the rollout
family according to the question:

```text
What is happening now?      kubectl rollout status deployment/web
What revisions existed?     kubectl rollout history deployment/web
Go back one revision.       kubectl rollout undo deployment/web
Inspect one revision.       kubectl rollout history deployment/web --revision=2
```

`describe rollout` and `kubectl rollback` are tempting because they sound
English-like, but they are not the normal command forms for these operations.

## 6. Namespaces: scope plus four initial namespaces

Kubernetes starts with four namespaces:

| Namespace | Purpose |
| --- | --- |
| `default` | Default location for namespaced objects when another namespace is not chosen |
| `kube-system` | Objects created by the Kubernetes system |
| `kube-public` | Cluster namespace intended to hold information readable by all clients |
| `kube-node-lease` | Per-node Lease objects used for node heartbeat/liveness signaling |

Use explicit scope while learning:

```bash
kubectl get pods -n payments
kubectl get pods --all-namespaces
kubectl get pods -A
```

`-A` and `--all-namespaces` mean the same thing for `kubectl get`. There is no
`--namespace=all` special namespace.

`kube-public` being readable is an API-access convention for resources placed
there; it does not mean arbitrary workloads become publicly reachable on the
internet.

## 7. Client-side apply: why last-applied exists

For classic **client-side** `kubectl apply`, keep three inputs separate:

```text
local file
   +
last-applied configuration annotation
   +
live object
   ↓
client calculates a patch
```

Client-side apply stores the previous applied configuration in the
`kubectl.kubernetes.io/last-applied-configuration` annotation. That previous
intent is important because it lets apply distinguish a field that disappeared
from your file from a field that another actor added to the live object.

Useful inspection commands:

```bash
kubectl apply view-last-applied deployment/web
kubectl get deployment/web -o yaml
```

The last-applied value is stored as a JSON representation in an annotation even
when the local file was YAML.

### Server-Side Apply is a different ownership mechanism

Do not turn the last-applied annotation into a timeless rule for every apply
workflow. Server-Side Apply uses API-server field management and
`metadata.managedFields`:

```bash
kubectl apply --server-side -f deployment.yaml
```

Durable distinction:

```text
client-side apply → last-applied annotation participates in merge calculation
server-side apply → API server tracks field managers / managed fields
```

## 8. Workload scaling is not cluster capacity

These are two different control problems:

```text
more workload replicas
  Deployment / ReplicaSet / HPA
  → more Pods requested

more physical cluster capacity
  node provisioning / node autoscaling
  → more Node CPU and memory available
```

Creating more Pods does not manufacture CPU or RAM. If Pods are unschedulable
because existing Nodes lack capacity, the cluster needs more suitable node
capacity (manually or through a node autoscaler).

## 9. Pod IPs are cluster-network addresses, not public exposure

The Kubernetes network model expects each Pod to have a cluster-wide IP and,
absent intentional network segmentation, Pods on different Nodes can communicate
directly without NAT between them.

That means "a Pod is only reachable from the Node it runs on" is not a good
general Kubernetes model.

At the same time, a Pod IP is not a stable public application endpoint. Pods are
replaceable and their IPs can change. Use a Service for stable service identity,
then Ingress/Gateway/LoadBalancer-style mechanisms when external exposure is
required.

```text
Pod IP      → execution endpoint inside cluster networking
Service     → stable discovery / traffic selection
Ingress or Gateway / LB → external routing when configured
```

## Before answering a resource-operation question

Run this mental checklist:

1. Is the question about **object responsibility**, **scope**, **capacity**, or
   **history**?
2. Am I being asked to **observe** or **mutate** state?
3. Is the command scoped to one namespace or all namespaces?
4. Is this a Deployment rollout operation, a ReplicaSet count operation, or a
   cluster-capacity operation?
5. Is an apply question specifically about client-side apply, or about field
   ownership more generally?
6. Does the answer depend on a legacy API such as ReplicationController?

If you can classify the layer first, the exact command becomes much easier to
retrieve.
