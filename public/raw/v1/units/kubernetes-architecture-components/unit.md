# Kubernetes components and the API request path

Kubernetes is easier to understand when each component has one primary responsibility in your mental model.

| Component | Responsibility |
| --- | --- |
| kube-apiserver | Front door for the Kubernetes API; authenticates/authorizes/admission-processes requests and exposes cluster state |
| etcd | Durable key-value store used by the control plane for API state |
| kube-scheduler | Chooses a feasible node for an unscheduled Pod |
| kube-controller-manager | Runs controllers that reconcile many built-in resources |
| kubelet | Node agent that makes assigned Pod containers run and reports node/Pod status |
| container runtime | Pulls images and creates/starts/stops containers through the runtime interface |
| CNI implementation | Establishes Pod networking according to the cluster network design |
| CoreDNS | Common cluster DNS implementation for Service/workload discovery |
| Service dataplane | kube-proxy or another implementation programs Service forwarding behavior |

The table is a responsibility map, not a promise that every cluster uses the same implementation. Managed Kubernetes may hide control-plane processes, and some clusters replace kube-proxy with an eBPF dataplane.

## Trace one Deployment change

Suppose you run `kubectl apply -f deployment.yaml`.

```text
kubectl
  -> kube-apiserver
      -> authentication / authorization / admission
      -> API state persisted
          -> Deployment controller observes desired state
              -> ReplicaSet is created/updated
                  -> Pods are created
                      -> scheduler selects nodes
                          -> Pod bindings appear in API state
                              -> kubelet on each chosen node observes assignment
                                  -> runtime starts containers
                                  -> networking is prepared
                                  -> status flows back through the API
```

The API server is central to coordination, but it does not SSH into a node and start the process. The scheduler selects a node but does not launch the container. The controller creates or updates API objects but does not directly run them. The kubelet is the node-side executor for assigned Pods.

## Control plane failure is not one thing

If the scheduler is temporarily unavailable, already-running Pods can continue to run. New unscheduled Pods may remain `Pending` because no component is assigning them to nodes.

If a controller is unavailable, existing workload processes can continue, but desired-state drift may stop being repaired. If the API server is unreachable, clients and components lose the shared coordination surface, even though existing containers do not instantly vanish.

This distinction is useful both for KCNA questions and incident diagnosis: ask whether the failure affects **new decisions**, **reconciliation**, or the **live data plane**.

## API state versus runtime state

Kubernetes components continuously report status through the API. That makes the API an important source of observed state, but it is still not a perfect substitute for a real user request.

Useful proof points include:

- `kubectl get` for current API-level summary state;
- `kubectl describe` for conditions and events;
- `kubectl get pod -o wide` for placement and Pod IP;
- container logs and previous termination state for process behavior;
- an actual network request for end-to-end service proof.

When a question asks "what happens next?", follow the ownership chain instead of memorizing a component list.
