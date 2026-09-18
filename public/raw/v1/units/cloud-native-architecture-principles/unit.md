# Cloud-native architecture principles

Running a monolith on a virtual machine in a public cloud does not automatically make the architecture cloud-native.

The CNCF cloud-native definition emphasizes systems built for dynamic environments using approaches such as containers, service meshes, microservices, immutable infrastructure, and declarative APIs. The deeper theme is **adaptability through automation and explicit contracts**.

## Properties that reinforce each other

### Declarative desired state

You describe what should exist; controllers or automation reconcile toward it. This makes replacement and recovery repeatable because the operating model does not depend on a unique hand-configured machine.

### Loose coupling

Components communicate through explicit interfaces rather than sharing hidden process or filesystem state. Loose coupling does not require hundreds of microservices. It means change and failure boundaries are understood.

### Immutable, replaceable artifacts

Instead of modifying a running server until it becomes unique, build a new versioned artifact and replace instances. Kubernetes Pods and container images fit this model well, but persistent data still needs deliberate lifecycle management.

### Automation and reconciliation

Automation turns repeatable intent into repeatable action. Reconciliation continuously compares desired and observed state, which is stronger than a one-time installation script when systems drift.

### Observability

Dynamic, distributed systems need evidence about their runtime behavior. Metrics, logs, traces, events, and user-visible probes make automated and human decisions possible.

### Resilience by design

Replicas, health checks, failure-domain spreading, retry budgets, graceful degradation, and replaceable instances can improve resilience. Redundancy only helps when replicas do not share the same hidden failure mode.

## Replication, autoscaling, and elasticity are different

**Replication** means running multiple instances. It can improve capacity and availability.

**Autoscaling** changes desired capacity based on observed signals or policy. Kubernetes HPA, for example, adjusts a workload's replica target based on configured metrics.

**Elasticity** is the broader ability to expand and contract resource use as demand changes. Autoscaling is one mechanism that can contribute to elasticity.

**Serverless** platforms abstract much of the server lifecycle from the application owner and often scale execution based on requests or events. "Serverless" does not mean no servers exist; it means the infrastructure lifecycle is more strongly delegated to the platform.

## Choose the autoscaler by the resource it changes

| Mechanism | Changes | Typical evidence and limit |
| --- | --- | --- |
| Horizontal Pod Autoscaler (HPA) | Desired replicas of a scalable workload | Workload metrics, HPA conditions, replica changes; needs usable signals and available placement capacity |
| Vertical Pod Autoscaler (VPA) | Recommendations or updates to Pod/container resource requests | Recommendations and applied resources; an installed add-on, not a built-in way to add nodes |
| Cluster Autoscaler | Capacity in supported node groups | Unschedulable Pods and node-group scaling events; constrained by provider integration, group limits, and placement rules |

The HPA controller calculates a workload replica target from configured metrics
and bounds such as `minReplicas` and `maxReplicas`. CPU utilization targets are
relative to configured CPU requests; missing requests or a missing metrics API
can prevent the expected decision. Kubernetes workload controllers create the
additional Pods, the scheduler assigns them, and kubelets execute them.

VPA addresses a different problem: an individual replica may need more memory
or a better CPU request. Update modes and supported versions determine whether
it only recommends changes or updates workloads, and whether disruption is
involved. Coordinate HPA and VPA policies instead of letting both independently
change the same CPU-utilization relationship.

Cluster Autoscaler can add suitable nodes when Pods cannot be scheduled with
existing capacity. It does not create extra application replicas, and more nodes
do not fix an impossible label constraint, an unavailable zonal volume, or an
incorrect resource request. Scale-down also requires checking whether workloads
can safely move and whether disruption constraints allow it.

### Worked scaling chain

```text
checkout CPU demand rises -> HPA requests 6 replicas instead of 3
  -> workload controller creates 3 Pods -> scheduler finds insufficient capacity
  -> node autoscaler requests suitable nodes -> nodes become usable
  -> scheduler assigns Pods -> kubelets start them -> readiness permits traffic
```

This is a conceptual sequence, not a guarantee of instant scaling. Check HPA
conditions, Pending Pod events, node readiness, rollout readiness, and request
latency. Six requested replicas do not prove six ready replicas or twice the
throughput; a saturated shared database may remain the bottleneck.

## Serverless is delegated infrastructure, not absent infrastructure

A request-driven function or container service can provision execution capacity
when events arrive and release idle capacity afterward. That fits bursty webhook
processing where each invocation can finish independently. The platform still
owns servers, networking, scheduling, and isolation.

Tradeoffs include cold-start latency, execution limits, external state management,
provider integration, and pricing. A continuously busy, latency-sensitive service
or specialized long-running process may fit managed containers better. Serverless
does not require Kubernetes; Kubernetes-based platforms such as Knative are one
possible implementation.

## Service mesh adds a communication operating model

Microservices can duplicate transport concerns: service identity, encrypted
connections, traffic policy, retries, and telemetry. A service mesh moves some
of that behavior into a managed communication layer. A **sidecar** is a companion
container in a Pod; a proxy sidecar is one mesh deployment pattern, not the
definition of every sidecar or every mesh.

In Istio's sidecar model, **Envoy** proxies handle intercepted workload traffic.
**Istiod** distributes configuration and workload-identity certificates. Istiod
is not a proxy hop for every request. Istio also supports an ambient model with
different proxy placement, so do not memorize “one sidecar per Pod” as universal.

```text
policy/route intent -> mesh control plane -> proxy configuration
request: app A -> local proxy -> network -> destination proxy -> app B
telemetry: proxies -> monitoring backend
```

Mesh mutual TLS authenticates and encrypts the configured proxy-to-proxy
connection; it does not automatically prove application authorization, safe
database access, or correct business behavior. A mesh adds resource overhead,
configuration, and another failure surface. Adopt it for an explicit cross-service
need, not merely because an application has several Pods.

### Understand an Istio installation and first-app walkthrough

The KCNA-level goal is to identify what was installed and what changed on the
request path, not to memorize a version-specific installation command.

1. Choose a version-compatible learning installation/profile and a dataplane
   mode. A demo profile is not a production sizing or security recommendation.
2. Locate the control-plane components and confirm they are ready. This proves
   installation health, not that every workload is participating in the mesh.
3. Enroll an isolated learning namespace/workload according to the chosen mode.
   In sidecar mode, inspect the new Pod's containers for the companion proxy;
   existing Pods may need replacement to receive injection.
4. Send one catalog-to-inventory request, then inspect proxy traffic/telemetry.
   Change one authorized routing or security policy and repeat the same request.
   Compare the expected effect with the observed response and counters.

Installing Istio without enrolling a workload or exercising a request does not
prove a service-mesh path. Sidecar injection modifies Pod creation; it does not
turn the API server into a traffic proxy. Consult the current installation guide
for commands and cleanup in an isolated cluster; the learning platform does not
provision a mesh on your behalf.

## Portability is a spectrum

Containers and Kubernetes can reduce coupling to individual hosts, but applications can still depend on provider-specific databases, identity systems, storage semantics, or load balancers. Cloud native aims for explicit interfaces and automation, not a guarantee that every workload can move unchanged between providers.

## The useful exam question

When comparing two designs, ask which one has clearer desired state, replaceable artifacts, automated reconciliation, explicit service boundaries, observable behavior, and failure handling. Those properties matter more than whether the diagram contains a cloud logo.

## Worked case: failure-domain and demand tests answer different questions

~~~text
intent: checkout artifact v6; replicas=3
instance failure: controller restores count to 3; checkout request succeeds
database outage: all three checkout requests fail
night demand: falls 90%; desired replicas remains 3
~~~

These authored observations support repeatable instance replacement, expose a
shared failure boundary, and show fixed capacity. The controller changes desired
workload objects; runtime instances handle transactions. A capacity policy would
need suitable signals and safe scaling bounds before demand adaptation could be
claimed.

Replicas need not be microservices, and a modular monolith can use declarative
recovery and observability. Conversely, dividing checkout into many services
would not remove a shared database outage by itself. Identify the dependency's
recovery or degradation contract rather than counting architectural labels.
