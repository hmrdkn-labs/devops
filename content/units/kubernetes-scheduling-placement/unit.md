# Kubernetes scheduling and placement constraints

The scheduler does not ask "which node looks emptiest right now?" It evaluates declared constraints and available schedulable capacity, filters out infeasible nodes, scores feasible choices, and records a placement decision.

## Requests are scheduling promises

CPU and memory **requests** are important inputs to scheduling. A node can show low real-time utilization while still being unable to accept a Pod if the node's allocatable capacity is already committed by existing requests.

Limits answer a different runtime question. CPU limits can throttle execution and memory limits can contribute to OOM termination, but limits are not a substitute for requests when the scheduler decides whether a node has room.

## Several placement mechanisms answer different questions

- `nodeSelector` is a simple hard requirement for matching node labels.
- **Node affinity** expresses required or preferred relationships to node labels with richer operators.
- **Pod affinity/anti-affinity** expresses relationships to other Pods, often to co-locate or separate workloads.
- **Taints** mark nodes with effects that repel Pods; **tolerations** allow a Pod to remain eligible for a matching taint. A toleration does not force placement onto that node.
- **Topology spread constraints** express how replicas should be distributed across topology domains such as zones or nodes.

These mechanisms do not replace resource feasibility. A Pod can tolerate a taint and match an affinity rule but still remain unschedulable because its resource request cannot fit.

## DaemonSet is controller intent, not a scheduler replacement

A DaemonSet is useful when you want one Pod on all or selected eligible nodes, for example a log collector, node monitoring agent, storage/node plugin, or networking component.

The DaemonSet controller creates Pods for eligible nodes. Those Pods still participate in Kubernetes placement semantics; the controller is expressing per-node desired state rather than becoming the node-side process executor.

## Read Pending as a decision failure

If a Pod remains `Pending`, inspect events before changing random settings. Common scheduling reasons include:

- insufficient requested CPU or memory capacity;
- node selector or required affinity that matches no node;
- untolerated taints;
- volume topology constraints;
- topology spread constraints that cannot be satisfied;
- other admission or scheduling policy constraints.

`kubectl describe pod` often exposes scheduler events describing why no node was feasible. The useful question is not merely "is it Pending?" but **which constraint eliminated every candidate node?**

## Predict before touching the cluster

Given a Pod and three nodes, write down each hard constraint first. Eliminate nodes that fail one requirement. Only after a feasible set exists should preferred rules and scoring affect the final choice.

This makes scheduling questions mechanical: **hard constraints determine possibility; preferences influence choice among possible nodes.**
