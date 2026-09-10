# KCNA domain map and reasoning strategy

KCNA is a conceptual exam, but "conceptual" does not mean "memorize a glossary." The fastest durable model is to keep asking who owns an action, who executes it, and what evidence would prove the result.

As of the current post-November-2025 blueprint, the exam is organized into four domains:

| Domain | Weight | What you should be able to reason about |
| --- | ---: | --- |
| Kubernetes Fundamentals | 44% | Core concepts, administration, scheduling, and containerization |
| Container Orchestration | 28% | Networking, security, troubleshooting, and storage |
| Cloud Native Application Delivery | 16% | Delivery workflows and debugging |
| Cloud Native Architecture | 12% | Observability, ecosystem/principles, community/collaboration |

The percentages are exam weights, not a recommended order. A networking prerequisite can be worth learning early even though it belongs under a later exam domain.

## One model for most questions

Use five layers:

1. **Intent/configuration** — what object, manifest, policy, or desired state was submitted?
2. **Control/reconciliation** — what component watches that intent and decides what should change?
3. **Execution/data plane** — what process, runtime, proxy, plugin, or kernel mechanism actually performs the work?
4. **Workload/state** — what Pod, container, endpoint, volume, or release is now running?
5. **Feedback/proof** — what status, event, log, metric, trace, or request proves the outcome?

This prevents a common mistake: treating every Kubernetes object as if it directly executes behavior. A Service is an API object; it does not forward packets by itself. A Deployment expresses rollout intent; the Deployment controller and ReplicaSets reconcile that intent. A NetworkPolicy expresses allowed connectivity; a compatible network implementation enforces it.

## Translate multiple-choice wording into ownership

When a question says "Kubernetes does X," translate it into a more precise question:

> Which Kubernetes component owns the decision, which component performs the work, and at what boundary?

Examples:

- "Kubernetes schedules a Pod" → the scheduler selects a node; the API records the binding; the kubelet on that node starts the Pod through the runtime.
- "A Service routes traffic" → the Service selects endpoints; a data-plane implementation such as kube-proxy or eBPF programming performs forwarding.
- "GitOps deploys an application" → Git stores declared intent; a GitOps controller observes it and reconciles the target platform.
- "Prometheus monitors Kubernetes" → Prometheus collects time-series metrics from configured targets; it does not replace logs, traces, events, or user-visible probes.

## What to memorize and what to derive

Memorize only stable vocabulary and boundaries: Pod, Deployment, Service, PVC, scheduler, kubelet, RBAC, NetworkPolicy, metrics/logs/traces, CI/CD, GitOps, and the major CNCF roles.

Derive operational answers from the layers. If a Pod is `Pending`, ask whether intent was accepted, whether scheduling has a feasible node, whether storage is bound, and what events report. If a Service exists but the app is unreachable, inspect selectors, EndpointSlices, readiness, ports, policies, and the actual listener.

## Remember this

KCNA readiness means you can explain the path from **declared intent → controller decision → executor → running state → proof**. Commands are useful observations, but the exam is testing the model behind them.
