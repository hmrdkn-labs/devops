# Pod model, lifecycle, and ownership

A Pod is the unit Kubernetes schedules onto a node. It is not a tiny virtual machine and it is not usually the durable thing you manage directly.

Think of a Pod as an **execution record for one placement decision**. Its containers are co-located on one node, share the Pod network identity, and may share declared volumes. The Pod has an identity and lifecycle of its own.

## Restart is not replacement

This is one of the most useful distinctions in Kubernetes:

```text
container process exits
    │
    ├─ kubelet may restart the container inside the same Pod
    │     same Pod UID, same scheduled node
    │
    └─ Pod itself is deleted/lost
          controller may create a different Pod
          new Pod UID, possibly a different node and IP
```

The kubelet runs on the node and is responsible for keeping the containers of an assigned Pod consistent with the Pod specification. A container restart can therefore happen without creating a new Pod.

By contrast, a Deployment or ReplicaSet does not repair a dead process inside the old Pod. Its control loop cares that the desired number of matching Pods exists. If a Pod disappears, the controller can create another Pod object.

## Pod phase is a coarse summary

The Pod `status.phase` is a high-level lifecycle summary such as `Pending`, `Running`, `Succeeded`, `Failed`, or `Unknown`. It is not a complete health diagnosis.

A Pod can be `Running` while an application container is repeatedly crashing, because "Running" mainly tells you that the Pod has been bound to a node and at least one container is running, starting, or restarting. To understand the failure, inspect container states, restart counts, conditions, and events.

`CrashLoopBackOff` is a common troubleshooting label shown by kubectl for repeated container restart backoff. Treat it as a clue about a container lifecycle loop, not as a Pod phase you should memorize alongside `Pending` and `Running`.

## The node matters

Once a Pod is scheduled, that Pod is tied to its node. Kubernetes does not live-migrate the Pod object to another node. If the node becomes unusable and the workload is controller-managed, replacement means creating another Pod, which can then be scheduled elsewhere.

This explains several consequences:

- Pod IPs are normally disposable.
- Files stored only in the container writable layer are disposable with the Pod.
- A stable Service name is more appropriate for reaching replaceable application replicas.
- Persistent data needs storage semantics independent of one disposable Pod instance.

## Ownership tells you who should fix drift

When a Pod is managed by a controller, inspect `metadata.ownerReferences` or use `kubectl describe` to find the owner chain.

```text
Deployment
   owns desired rollout
      ↓
ReplicaSet
   owns desired replica count
      ↓
Pods
   execute on nodes
```

If you manually delete one Pod from a healthy three-replica Deployment, the interesting event is not the deletion. The interesting event is what notices the missing replica and what creates the replacement.

Answer: the ReplicaSet controller observes that actual matching Pods fell below its desired replica count and creates a replacement Pod. The Deployment sits one level higher, managing ReplicaSets and rollout intent.

## Observable proof

When learning Pods, inspect the same event at several layers:

1. `kubectl get pod -o wide` — identity, phase, node, IP.
2. `kubectl describe pod` — ownership, conditions, container states, events.
3. `kubectl get pod -o yaml` — detailed status and owner references.
4. `kubectl get rs` and `kubectl get deployment` — upstream desired counts and rollout ownership.

The goal is not to memorize output columns. It is to answer: **who owns this state, what should happen next, and what evidence would show that it happened?**
