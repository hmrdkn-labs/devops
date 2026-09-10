# KCNA Kubernetes Fundamentals quiz companion

Use this page as the fast layer beside the quiz. The detailed units explain the mechanisms; this page is optimized for recognition, elimination, and quick recall.

## 30-second scan

| If the question is about... | Think... |
| --- | --- |
| Why containers? | Package an application and dependencies into a portable process environment; containers share the host kernel. |
| Why orchestration? | Keep many replaceable workloads scheduled, scaled, networked, and reconciled toward desired state. |
| Kubernetes API entry point | `kube-apiserver` |
| Durable Kubernetes API state | `etcd` |
| Picking a node for an unscheduled Pod | `kube-scheduler` |
| Continuously repairing desired state | controllers, commonly in `kube-controller-manager` |
| Making assigned Pods run on a node | `kubelet` |
| Creating/stopping containers | the container runtime, reached through CRI |
| Pod network setup | a CNI implementation |
| Cluster DNS | commonly CoreDNS |

The most useful exam habit is to ask **who decides, who executes, and where the state lives**.

```text
kubectl / client
      │
      ▼
kube-apiserver ──► etcd
      │             stores API state
      ├── watched by controllers
      ├── watched by scheduler
      └── watched/reported to by kubelets
                         │
                         ▼
                  container runtime
```

## Containers: the distinctions worth remembering

An **image** is a packaged filesystem plus metadata used as input to create a container. A **container** is a runtime instance whose main process is executing in an isolated environment. Containers normally isolate processes with Linux namespaces and constrain resources with cgroups; they do not each boot a separate guest kernel like a virtual machine.

| Term | What it means | Common trap |
| --- | --- | --- |
| Image | Read-only packaged input for container creation | It is not a running process. |
| Container | Runtime environment around one or more processes | It is not a tiny VM. |
| Container runtime | Software that manages container lifecycle | Kubernetes talks to supported runtimes through CRI. |
| CRI | Kubernetes' container runtime interface | It is an API boundary, not a runtime implementation itself. |
| containerd | A common high-level container runtime | Kubernetes can use it directly through CRI. |
| runc | Low-level OCI runtime commonly used to create/run containers | It is below containerd in the usual stack. |
| Docker Engine | Developer/container platform that itself uses containerd | Removing dockershim did not mean Kubernetes stopped supporting containers built with Docker. |

The Docker/Kubernetes historical trap is simple: Kubernetes removed the built-in **dockershim** integration. Kubernetes still runs OCI-compatible container images. Modern clusters commonly use CRI-compatible runtimes such as containerd or CRI-O.

## Why Kubernetes exists

Running one container is a runtime problem. Running hundreds of replaceable workloads across machines introduces scheduling, failure recovery, service discovery, rollouts, configuration, storage, and capacity problems. Kubernetes gives you an API for desired state plus controllers that keep reconciling actual state toward it.

```text
desired state in API
       │
       ▼
controller observes drift
       │
       ▼
new/changed API objects
       │
       ▼
scheduler chooses placement
       │
       ▼
kubelet + runtime execute on node
       │
       ▼
status returns through API
```

This is why a deleted controller-managed Pod can come back: the controller notices that actual state no longer matches desired state.

## Component ownership table

| Component | Own this sentence in your head |
| --- | --- |
| `kube-apiserver` | "All normal Kubernetes API coordination goes through me." |
| `etcd` | "I persist the control plane's API state." |
| `kube-scheduler` | "I choose a node for a Pod that has no node assignment." |
| `kube-controller-manager` | "I run control loops that repair desired-state drift for built-in resources." |
| `kubelet` | "I make the Pods assigned to my node run and report their status." |
| container runtime | "I pull/create/start/stop containers when the kubelet asks." |
| CNI implementation | "I provide the Pod networking behavior required by the cluster design." |
| CoreDNS | "I commonly provide DNS-based discovery inside the cluster." |

### High-value eliminations

- The scheduler **does not start containers**. It records/chooses placement.
- The API server **does not SSH into nodes** to start workloads.
- `etcd` **does not schedule or reconcile**. It stores API state.
- The kubelet **does not decide Deployment replica count**. It executes Pods already assigned to its node.
- Controllers **do not directly run application processes**. They change desired/API objects; node-side components execute.

## What happens after `kubectl apply`?

`kubectl` sends an API request. The API server authenticates, authorizes, runs admission, validates the object, and persists accepted API state. Controllers observe that state. For a workload that needs a new Pod, a controller creates the relevant Pod object, the scheduler chooses a node, the kubelet on that node observes the assignment, and the runtime starts the containers.

If a quiz option jumps directly from `kubectl` to "the scheduler starts the container," it has collapsed several ownership layers.

## Quiz traps to rehearse

1. **Pod versus container:** Kubernetes schedules Pods. A Pod can contain one or more containers that share its network namespace and declared volumes.
2. **Desired versus observed:** `spec` commonly expresses desired state; `status` commonly reports observed state.
3. **Control plane versus worker:** scheduler/controllers make cluster-level decisions; kubelet/runtime perform node-side execution.
4. **Docker versus containerd:** Docker is not required by Kubernetes. Docker-built OCI images still work with compatible runtimes.
5. **Runtime versus CRI:** CRI is the interface Kubernetes uses to talk to runtimes; containerd and CRI-O are runtime implementations.
6. **A running workload during control-plane trouble:** already-running containers may continue even when new scheduling or reconciliation is impaired.

## Command cues

| Command | What it proves |
| --- | --- |
| `kubectl get nodes` | Nodes known through the Kubernetes API and their summary state. |
| `kubectl get pods -o wide` | Pod summary plus placement/IP information. |
| `kubectl describe pod <name>` | Pod conditions, events, ownership, container state clues. |
| `kubectl get pod <name> -o yaml` | Detailed live API object including `spec`, `status`, and metadata. |

None of these alone proves that a real user request succeeds. Keep configuration proof and end-to-end behavior separate.

## Before you answer a fundamentals MCQ

Ask three things in order:

1. Is the question asking about **stored intent/state**, **a control decision**, or **runtime execution**?
2. Which component owns that layer?
3. Does the option describe the component's real responsibility, or does it make that component perform somebody else's job?
