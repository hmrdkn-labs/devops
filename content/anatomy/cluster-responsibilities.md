## The problem: an accepted declaration is not a running process

A Deployment describes the workload you want. It does not contain an instruction for the API server to log in to a worker and launch a container. Kubernetes distributes that work among actors with different responsibilities, coordinated through the API.

The console above follows one new Deployment with one replica. The four-drawer rack represents control-plane responsibilities; the smaller chassis represents one worker node. The travelling ruler shoe is a **checkpoint index**, not a packet travelling through components. Pulling a drawer out exposes the actor’s board without changing the workload.

This is an original deterministic teaching fixture. It has not contacted a cluster, executed `kubectl`, measured a rollout or verified an application. Exploring it does not save learning progress.

## Read the console by ownership

| Actor | What it owns in this trace | What it does not do |
| --- | --- | --- |
| API server | Processes API requests and exposes shared state; persists API objects through its storage layer | Does not start application containers |
| etcd | Durable Kubernetes API state, including desired specifications and reported status | Is not automatically the application’s database |
| Deployment controller | Reconciles the Deployment by managing its ReplicaSet | Does not schedule or run the Pod |
| ReplicaSet controller | Reconciles replica count by creating the managed Pod object | Does not create a running process directly |
| Scheduler | Selects a suitable node for a Pod that has no assignment and records its binding through the API | Does not pull an image or start a container |
| Kubelet | Observes Pods assigned to its node, coordinates their setup, requests runtime operations and reports status | Does not choose the node for this unscheduled Pod |
| Container runtime | Creates and starts containers on the node through the runtime interface used by the kubelet | Does not decide the Deployment’s replica count |

The twin controller boards share a drawer because both built-in controllers run under the controller-manager responsibility. They remain distinct control loops with distinct ownership. The runtime cartridge seats in the node chassis only at the execution checkpoint; a scheduler decision alone cannot seat it.

Other components matter too. A network implementation supplies Pod networking, DNS supports discovery, and a Service dataplane implements Service forwarding. They are not drawn as extra checkpoints here. Managed Kubernetes may hide control-plane processes, and these drawers do not imply six separate physical servers.

## Map controls to state

**Next checkpoint** advances one finite illustrated transition. The shoe and witness latches ease toward their new positions. During motion the readout retains the last completed checkpoint, marked “Moving”; it does not prematurely claim a container is running. The new counts become visible when the pose settles. Ordinary stepping and inspection are disabled during a transition. **Reset** remains available and cancels the pending sequence safely.

**Replay apply → execution** returns the apparatus to its draft state and advances through all checkpoints once. It does not loop or auto-play on arrival. With reduced motion, replay resolves immediately to the final stable checkpoint; individual stepping still exposes each intermediate state.

**Inspect actor** selects the one highlighted assembly and explains its responsibility. **Open inspection drawer** pulls that assembly along its retained rails. Closing it restores the assembly. Inspection never creates an API object, changes placement or starts a process.

The progression separates these checkpoints:

1. **Draft only:** intent is still local; no Deployment, ReplicaSet or Pod exists in this fixture.
2. **Request processed:** authentication, authorization and admission have succeeded. Persistence is the next explanatory checkpoint. This is not an early success response from `kubectl`.
3. **Deployment persisted:** API state is durable in etcd. The application is not yet running, and no Pod exists here.
4. **ReplicaSet created:** the Deployment controller creates a ReplicaSet through the API.
5. **Pod created, unassigned:** the ReplicaSet controller creates a Pod through the API. The Pod has no `spec.nodeName` yet.
6. **Pod assigned, not running:** the scheduler records placement on `node-a`. Assignment is not execution.
7. **Kubelet observes assignment:** the node agent coordinates setup and asks the runtime to act.
8. **Container running, status reported:** setup and container start succeed; the kubelet reports status back through the API. Running does not prove readiness or successful user traffic.

All API writes in this trace go through the API server, including controller-created children and scheduler bindings. Controllers and kubelets do not treat etcd as a shared application database that they edit directly.

## Assumptions and the analogy’s limit

The fixture assumes an authorized, admissible request; one new replica; an eligible, healthy `node-a`; and successful image, network and storage setup. Names are invented. The checkpoints intentionally pause a process that real components perform asynchronously. Kubernetes has watches, retries, concurrent loops and repeated status updates, not a single mechanical conveyor or a universally fixed set of timing intervals.

The rack is a responsibility map, not a network topology. The storage cartridges represent API records, not container filesystems. The controller boards represent software loops, not processors that call the runtime. The seating mechanism illustrates the distinction between assignment and execution; it is not a claim that Pods physically migrate between machines.

## Misconception: “the control plane stopped, so every Pod disappeared”

Failure of one control-plane responsibility does not instantly remove existing containers. If the scheduler is unavailable, already-running Pods can continue while new unassigned Pods wait. If a controller stops, existing processes can continue while reconciliation is impaired. If the API server becomes unreachable, clients and components lose shared coordination and status reporting, but existing containers do not immediately vanish solely because of that loss.

Continued running is not a reliability guarantee. Node failures, application dependencies, networking, storage and recovery requirements still matter. Diagnose which capability is missing: accepting changes, reconciling intent, assigning new Pods, or executing on a node.

## Practical observation: distinguish an API record from execution

On a cluster you are authorized to inspect, this read-only command lists API-level Pod status and placement in a chosen namespace:

```sh
kubectl get pods -n YOUR_NAMESPACE -o wide
```

A populated `NODE` column identifies assignment; it does not by itself prove that a container started. `STATUS` and `READY` offer different evidence: phase is a high-level lifecycle summary, while readiness counts describe container readiness reporting. An unassigned Pod may be `Pending`, but `Pending` can also include an assigned Pod waiting on setup or an image.

If you need more context, inspect one existing Pod without mutating it:

```sh
kubectl describe pod YOUR_POD -n YOUR_NAMESPACE
```

Conditions and events can help separate scheduling trouble from node-side setup failures. These are API observations, potentially delayed, not direct proof of an end-to-end application request. Neither command is executed by this page. Check the active kubeconfig context and your authorization before using even read-only commands; their output can expose workload details.

## Prediction and transfer exercise

Pause at **Pod created · unassigned**. Suppose the scheduler becomes unavailable while the kubelet and runtime on `node-a` remain healthy.

- Which actor normally supplies the missing node assignment?
- Why is a healthy runtime insufficient to run this new Pod?
- Would an unrelated container that was already running necessarily stop?

Explain the chain before revealing the answer: the scheduler normally selects and binds a node. This new Pod has no assignment for a node’s kubelet to realize, so runtime health alone does not supply placement. Existing containers need not stop just because the scheduler is unavailable. Transfer the reasoning to a Pod with a populated node assignment but an image pull failure: that is a different checkpoint and responsibility boundary.

## Continue with the canonical unit

[Study Kubernetes components and the API request path](/learn/kubernetes-architecture-components?mode=reference). This figure supports the canonical objectives **assign component responsibilities** (`fpp:kubernetes-architecture-components/roles`) and **trace intent to execution and returned status** (`fpp:kubernetes-architecture-components/request-path`).

## Authoritative public references

- [Kubernetes Components](https://kubernetes.io/docs/concepts/overview/components/) — control-plane and node responsibilities.
- [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) — reconciliation and API-mediated control.
- [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/) — runtime installation and the CRI boundary.

Public claims reviewed against these references on 2026-10-11. That date records source review, not live-cluster verification.
