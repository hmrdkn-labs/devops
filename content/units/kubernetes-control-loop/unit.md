# Kubernetes API and control loops

Kubernetes is a distributed control system built around an API. Clients send
authenticated requests to the API server. The server validates and admits
objects, then persists cluster state in etcd. Other components watch relevant
objects and act on them.

A controller repeatedly compares desired state with observed state. If a
Deployment asks for three replicas and only two matching Pods exist, its
controller creates another desired Pod record. The scheduler later chooses a
node for an unscheduled Pod. The node's kubelet asks the container runtime to
realize the Pod and reports status back through the API.

~~~text
declaration → API server → durable state
                  ▲              │ watch
                  │ status       ▼
              kubelet ← scheduler + controllers
~~~

No single successful command “finishes” the system. Reconciliation continues
after node loss, manual deletion, or new configuration. This is why changing a
controller-owned child directly is usually temporary: its owner will restore
the declared relationship.

`kubectl` is a client of the Kubernetes API. On EKS it uses the same
Kubernetes request semantics as on another conformant cluster; the difference
is how kubeconfig obtains a short-lived authentication token and which API
server endpoint and authorization integrations are used.

Managed Kubernetes changes ownership, not the API model. EKS operates the
control-plane infrastructure across availability zones, while you still own
workloads, identities, add-ons, network design, capacity, and application
reliability.
