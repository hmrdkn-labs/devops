## The big picture

A Deployment declares what you want. It does not tell the API server to log in to a worker and start a container. Kubernetes splits the work among owners that each read one kind of state and write back through the API server: the API server accepts and stores the request, controllers create the child objects, the scheduler chooses a node, and the kubelet and container runtime on that node make containers real.

The console above follows one Deployment with one replica through eight checkpoints. The rack is the control plane and the chassis is one worker node. The ruler shoe marks the checkpoint index; it is not a packet moving between components. Each owner has its own witness latch, and a latch shifts when that owner has acted. Nothing advances on its own: each checkpoint waits for **Next checkpoint**.

This is an original, deterministic teaching fixture. It has not contacted a cluster, run `kubectl`, measured a rollout or tested an application. Exploring it does not save learning progress.

## Who owns what

| Owner | Single responsibility in this trace | What it does not do |
| --- | --- | --- |
| API server | Authenticates, authorizes and admits each write, then persists accepted objects | Does not start containers |
| etcd | Durably stores API state; components reach it through the API server | Is not the application’s database |
| Deployment controller | Creates and manages the ReplicaSet for the Deployment’s pod template | Does not create Pods or choose nodes |
| ReplicaSet controller | Creates Pods until the ReplicaSet’s replica count is met | Does not choose a node or start a container |
| kube-scheduler | Selects a feasible node for a Pod with no node and records the assignment | Does not pull images or start containers |
| kubelet on node-a | Acts on Pods bound to its node, coordinates node-side setup, requests runtime operations and reports Pod status | Does not choose the node |
| Container runtime on node-a | Creates and starts containers when the kubelet asks, through CRI | Does not decide replica counts or placement |

The Deployment and ReplicaSet controllers share a tray because both are built-in controllers that run inside kube-controller-manager. They are still separate control loops. The Deployment controller acts at the ReplicaSet checkpoint and the ReplicaSet controller acts at the Pod checkpoint, so each has its own latch.

Other components matter for real Pods: a network plugin supplies Pod networking, DNS supports discovery, and kube-proxy or its replacement implements Service forwarding. They are not drawn as checkpoints here. Managed Kubernetes may hide control-plane processes, and these drawers do not imply six servers.

## How it works

The checkpoints match the console:

0. **Draft only.** The manifest is local. No API objects exist.
1. **Request accepted.** Authentication, authorization and admission pass. Nothing is stored yet.
2. **Deployment stored.** The API server writes the Deployment to etcd. No ReplicaSet or Pod exists.
3. **ReplicaSet created.** The Deployment controller creates `demo-7c5d9f8b6d` with one replica. Its name is the Deployment name plus a hash of the pod template; the same hash is its `pod-template-hash` label.
4. **Pod created, unassigned.** The ReplicaSet controller creates one Pod from the template. Its name is the ReplicaSet name plus a generated suffix, and it has an ownerReference to the ReplicaSet. `spec.nodeName` is absent. `Pending` means the Pod is accepted, but its containers are not yet set up and ready to run; that includes waiting to be scheduled and pulling images.
5. **Pod bound to node-a.** The scheduler selects node-a and records the assignment through the API. The phase is still `Pending`: assignment is not execution.
6. **Kubelet takes the Pod.** The kubelet on node-a sees a Pod bound to its node and begins node-side setup. It asks the runtime for container operations through CRI.
7. **Container running.** The runtime starts the container, and the kubelet reports `status.phase: Running` through the API server. The Pod documentation defines `Running` as bound to a node, all containers created, and at least one still running, starting or restarting. It does not mean Ready.

Controllers and kubelets do not treat etcd as a shared database that they edit directly. Every write goes through the API server, including controller-created children and the scheduler’s assignment.

The controls map to this sequence:

- **Next checkpoint** advances exactly one checkpoint. The carriage and latches ease to their new positions, and the object list and owner counts update when the motion settles. The report is labelled “Moving” until then.
- **Reset to draft** returns the teaching model to checkpoint 0 and cancels a move in progress. It does not touch any cluster.
- **Inspect actor** and **Open inspection drawer** change only the view. The tinted drawer always names the checkpoint actor. The heavy outline and the pulled drawer name the inspected actor. Inspection never advances a checkpoint or creates an object.
- With reduced motion, each step settles immediately, and the report and counts change in the same step.

## YAML example

The first document is the manifest you apply. The other two are objects that controllers create; you do not apply them. The panel above shows this same text at the final checkpoint. Before a controller creates an object, the panel shows a comment instead, and before the scheduler binds the Pod it shows `nodeName` as absent.

```yaml
# Applied by you: the desired state
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo
  labels:
    app: demo
spec:
  replicas: 1                # desired Pod count the Deployment controller reads
  selector:
    matchLabels:
      app: demo              # must match the template labels
  template:                  # Pod blueprint copied into the ReplicaSet
    metadata:
      labels:
        app: demo
    spec:
      containers:
      - name: web
        image: nginx:1.27
        ports:
        - containerPort: 80
---
# Observed, not applied: created by the Deployment controller (uid, blockOwnerDeletion, selector and template omitted)
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  name: demo-7c5d9f8b6d
  labels:
    app: demo
    pod-template-hash: 7c5d9f8b6d
  ownerReferences:
  - apiVersion: apps/v1
    kind: Deployment
    name: demo
    controller: true
spec:
  replicas: 1
---
# Observed fragment, not applied: created by the ReplicaSet controller
# uid, blockOwnerDeletion and container details omitted
apiVersion: v1
kind: Pod
metadata:
  name: demo-7c5d9f8b6d-q8k2m
  labels:
    app: demo
    pod-template-hash: 7c5d9f8b6d
  ownerReferences:
  - apiVersion: apps/v1
    kind: ReplicaSet
    name: demo-7c5d9f8b6d
    controller: true
spec:
  nodeName: node-a
status:
  phase: Running
```

- `spec.replicas: 1` is the desired count the Deployment controller reads when it creates the ReplicaSet (checkpoint 3).
- `spec.selector.matchLabels` must match `spec.template.metadata.labels`. The ReplicaSet and Pod carry the same `app` label.
- `pod-template-hash` is added by the Deployment controller to each ReplicaSet it creates, so ReplicaSets from one Deployment do not overlap. Do not set it yourself.
- `ownerReferences` with `controller: true` ties the ReplicaSet to the Deployment and the Pod to the ReplicaSet.
- `spec.nodeName` is set by the scheduler’s binding (checkpoint 5). It is the field the kubelet on node-a acts on.
- `status.phase: Running` is reported by the kubelet (checkpoint 7). It is not a readiness claim.

## Try these changes

1. **Next checkpoint** until checkpoint 3. Expected: the Deployment controller is the checkpoint actor and its latch shifts; the ReplicaSet controller’s latch is still unshifted; the ReplicaSet row reads created; the Pod row reads not created.
2. Advance to checkpoint 5. Expected: the `spec.nodeName` row reads node-a and the panel highlights `nodeName: node-a`; `status.phase` is still `Pending`; the runtime count is 0.
3. At checkpoint 5, choose **etcd** in Inspect actor and open its drawer. Expected: the checkpoint actor still names kube-scheduler; etcd is the inspected actor; the report says View only; no object row or owner count changes.
4. Advance to checkpoint 7. Expected: `status.phase` reads Running with the note “not Ready”; the runtime count is 1; the panel highlights `phase: Running`.
5. **Reset to draft**, then press **Next checkpoint** once. Expected: checkpoint 1 names the API server; nothing is stored yet.

## Misconceptions

**“The control plane stopped, so every Pod disappeared.”** A stopped control-plane component does not remove running containers. If the scheduler is down, Pods already running can continue while new unassigned Pods wait. If a controller is down, reconciliation stops but existing processes keep running. If the API server is unreachable, components lose coordination and status updates, but existing containers are not removed merely because the API is unavailable. Correction: identify which responsibility is missing: accepting writes, creating child objects, assigning new Pods, or executing on the node.

**“`nodeName` is set, so the application runs.”** At checkpoint 5 the node is set, the phase is `Pending` and no container exists. Assignment is a scheduling result. Correction: check the next owner. Did the kubelet take the Pod, and did the runtime start a container?

## Safe read-only observation

Run these only against a cluster you are authorized to read, using the right kubeconfig context:

```sh
kubectl get deployment,replicaset,pods -n YOUR_NAMESPACE -o wide
kubectl get pod YOUR_POD -n YOUR_NAMESPACE -o jsonpath='{.spec.nodeName}{"\n"}{.status.phase}{"\n"}'
kubectl describe pod YOUR_POD -n YOUR_NAMESPACE
```

The first command lists the API objects, the NODE column (which reflects `spec.nodeName`) and the READY counts. Its STATUS column is a kubectl display field and can differ from the phase, for example `CrashLoopBackOff`, so use the `jsonpath` command to read `status.phase` directly. That command proves only the two recorded fields. It does not show whether the application answers requests. `describe` adds conditions and events. They can be delayed, and a missing event is not proof that nothing happened. This page does not run any of these commands.

## Predict and transfer

Pause at **Pod created, unassigned** (checkpoint 4). Suppose the scheduler is unavailable while the kubelet and runtime on node-a stay healthy.

- Which owner normally supplies the missing node assignment?
- Why does a healthy runtime not start this Pod?
- Would a container already running on node-a necessarily stop?

Answer before checking: the scheduler normally supplies the node assignment. This Pod has no `spec.nodeName`, so the kubelet on node-a has nothing to act on, and runtime health alone does not place it. A running container need not stop just because the scheduler is down. Transfer the reasoning to a Pod with `nodeName: node-a` whose image pull fails: assignment has succeeded, and the failure sits in node-side setup and status, a different checkpoint and responsibility boundary.

## Assumptions and limits

The fixture assumes an authorized, admissible request; one replica; an eligible, healthy node-a; and successful image, network and storage setup. Names and the hash are illustrative. The checkpoints pause work that real components perform asynchronously. Kubernetes uses watches, retries and concurrent loops, not a fixed conveyor. Conditions such as `PodScheduled` and `Ready` are separate status fields that this fixture does not model. Network plugins, DNS and Service dataplanes are not simulated.

The rack is a responsibility map, not a network topology. The storage cartridges represent API records, not container filesystems. The controller boards represent control loops, not processors that call the runtime. The seating mechanism illustrates assignment versus execution; it does not show Pods migrating between machines.

Study the canonical unit [Kubernetes components and the API request path](/learn/kubernetes-architecture-components?mode=reference). This figure supports the objectives **assign component responsibilities** (`fpp:kubernetes-architecture-components/roles`) and **trace intent to execution and returned status** (`fpp:kubernetes-architecture-components/request-path`).

## Authoritative sources

- [Kubernetes Components](https://kubernetes.io/docs/concepts/overview/components/) — control-plane and node responsibilities.
- [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) — control loops, API-mediated changes and built-in controllers in kube-controller-manager.
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — ReplicaSet naming and the pod-template-hash label.
- [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/) — replica maintenance and ownerReferences.
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) — phases, container states and the difference between phase and readiness.
- [Controlling Access to the Kubernetes API](https://kubernetes.io/docs/concepts/security/controlling-access/) — authentication, authorization and admission.
- [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/) — the CRI requirement.

Reviewed 2026-10-12 against these public references. That records a documentation review, not a live-cluster verification.
