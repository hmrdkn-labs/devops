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

## Portability is a spectrum

Containers and Kubernetes can reduce coupling to individual hosts, but applications can still depend on provider-specific databases, identity systems, storage semantics, or load balancers. Cloud native aims for explicit interfaces and automation, not a guarantee that every workload can move unchanged between providers.

## The useful exam question

When comparing two designs, ask which one has clearer desired state, replaceable artifacts, automated reconciliation, explicit service boundaries, observable behavior, and failure handling. Those properties matter more than whether the diagram contains a cloud logo.
