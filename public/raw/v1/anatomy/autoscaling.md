## The big picture

A Deployment runs as many Pods as its `spec.replicas` says. Load changes, so something has to change that number. The HorizontalPodAutoscaler (HPA) does that job: periodically it reads a metric, computes how many replicas it wants, and writes `spec.replicas` on the Deployment. It does not create Pods, choose nodes, or add machines. Each of those belongs to a different controller, and the HPA's write is only the first step of a chain.

The apparatus above is an original teaching fixture, not a recording of a cluster. The dial is the HPA's measurement, the carriage on the rail is the number it wrote, and the racks and tray are where Pods wait or run. After one interaction, ask four questions: what changed, which controller changed it, why, and what has **not** happened yet.

## Who owns what

- **You or your pipeline** set the HPA object (`minReplicas`, `maxReplicas`, the metric target, the scale-down window) and the Pod template's CPU request. The request is the denominator of every utilization figure.
- **metrics-server** is an add-on that serves per-Pod resource usage through the `metrics.k8s.io` API. The HPA does not measure CPU itself.
- **The HPA controller**, running in the control plane, computes the desired count and writes the Deployment's scale subresource.
- **The Deployment and ReplicaSet controllers** create and delete Pods to match `spec.replicas`. A new Pod has no node yet.
- **kube-scheduler** assigns each unassigned Pod to a node that can take it.
- **The kubelet** starts containers and reports readiness. Ready is a later fact than assigned.
- **A node autoscaler** such as Cluster Autoscaler (or Karpenter) provisions a node when a Pending Pod cannot be placed. It works from Pod requests, not live usage, and it is separate from the HPA.
- **The Vertical Pod Autoscaler**, an optional add-on, changes resource requests and limits. It does not change the replica count.

## How it works

The fixture follows the documented HPA loop, one sync per 15 seconds:

1. **Measure.** For each targeted Pod, the HPA reads usage and divides it by the container's CPU request to get utilization, then averages across Pods. A container with no CPU request makes CPU utilization undefined, and the HPA takes no CPU action.
2. **Set aside.** Pods that are not yet Ready, and Pods with missing metrics, are set aside before the ratio is final. The documented rule for missing metrics: a scale-up counts those Pods as 0%, and a scale-down counts them as 100% of the target. Not-yet-Ready Pods count as 0% on a scale-up. The fixture applies the same treatment to every set-aside Pod, which extends the documented rule to not-yet-Ready Pods on a scale-down. If the adjusted ratio reverses direction or falls inside the tolerance, the HPA does nothing.
3. **Compute.** `desired = ceil(current × ratio)`. The default tolerance is ±10%.
4. **Clamp.** The result is bounded by `minReplicas` and `maxReplicas`. The unclamped value is still shown in the report, so a clamp is visible.
5. **Stabilize scale-down.** The HPA records each recommendation and, when scaling down, acts on the highest one inside the window. The default downscale window is 300 seconds. Scale-up has no window by default.
6. **Write.** The HPA writes `spec.replicas` on the Deployment and stops there. The status it records keeps the original utilization, not the adjusted ratio.
7. **Create, place, ready.** The ReplicaSet creates Pods. Each one is unassigned, then assigned to a node by the scheduler, then Ready after the kubelet's readiness check passes.
8. **Add capacity if needed.** A Pod that no node can take stays Pending. Cluster Autoscaler may provision a node for it. This does not change `spec.replicas`.

When the ReplicaSet must remove Pods, it picks victims in a documented order: Pending first, then lower `pod-deletion-cost`, then Pods on nodes with more replicas, then the newest. The fixture applies Pending first, then the busier node, then the newest, and omits `pod-deletion-cost`.

## YAML example

This is the state at the page's start: 250m request, `maxReplicas: 6`, a 45-second window fixture, two replicas. The Deployment omits `spec.replicas` on purpose, because the HPA owns that field. The panel above renders these same lines from the model and marks the ones the last interaction read or changed.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  # live, written by the HPA (not in this file): spec.replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: example.com/web:1.0
          resources:
            requests:
              cpu: 250m          # utilization = usage ÷ this request
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 6
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50   # target percent of the request
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 45   # fixture value; the default is 300
```

If a manifest that still sets `spec.replicas` is re-applied, that value overwrites the HPA's choice. Leave the field out of the Deployment that the HPA manages.

## Try these changes

Press **Reset** before each experiment, then change one thing at a time. The results are what the fixture computes.

1. **Load, then one sync.** Set load to 400m and press **Run one HPA sync**. Utilization is 80%, so the ratio is 1.6 and `ceil(2 × 1.6) = 4`. `spec.replicas` becomes 4, yet no new Pod exists. Press **Run controllers to quiet**: the ReplicaSet creates two Pods, the scheduler places them, and both become Ready.
2. **Capacity is not the HPA's job.** Set the request to 500m and load to 1000m, then run one sync. Utilization is 100%, so the HPA asks for 4. Nodes 1 and 2 each carry 500m of other load plus one 500m Pod, so they have no CPU left; Pods 3 and 4 wait as Pending. Turn **Cluster Autoscaler** off and run to quiet: both Pods stay Pending. Turn it on and run again: `node-3` is provisioned, and both Pods are placed there.
3. **No request, no CPU decision.** Set the request to "no request" and run one sync at any load. The HPA reports no CPU decision and `spec.replicas` stays 2. The readout names the missing target instead of inventing 0%.
4. **Max clamps the recommendation.** With the request at its start value of 250m, set `maxReplicas` to 3 and load to 1000m. Utilization is 200%, so the raw result is `ceil(2 × 4) = 8`, clamped to 3. The report shows both numbers.
5. **Window delays scale-down.** Set load to 800m, run one sync, then run controllers to quiet: six Pods. Set load to 250m. The first two syncs with the 45-second window report held; the third scales down to 2. Set the window to 0 seconds and the first sync scales down at once.

## Misconceptions

**Misconception:** "The HPA adds nodes when the cluster is full."

**Correction:** The HPA only writes `spec.replicas`. A node is added by a node autoscaler, and only for Pods the scheduler cannot place.

**Misconception:** "A Pending Pod means the HPA failed."

**Correction:** The HPA did its job when it wrote the number. Pending means no node had room for that Pod's requests when the scheduler looked.

**Misconception:** "A container with no CPU request has 0% utilization, so it never scales up."

**Correction:** Utilization is undefined without a request. The HPA takes no CPU action, which is different from reading zero.

**Misconception:** "High CPU on a brand-new Pod drives scaling at once."

**Correction:** Pods that are not yet Ready are set aside. On a scale-up they count as 0%, so they dampen the result instead of adding their load.

**Misconception:** "Assigned means Running, and Ready means Running."

**Correction:** Assigned, Running, and Ready are different facts. A Pod can be assigned with its containers not yet started, Running but not Ready, or Ready. This page keeps the three apart.

**Misconception:** "VPA is another way to add replicas."

**Correction:** VPA changes requests and limits. The replica count still comes from the HPA, or from you.

## Safe read-only observation

Against a cluster you are authorized to inspect, these commands only read state:

```sh
kubectl get hpa web
kubectl describe hpa web
kubectl get deployment web -o jsonpath='{.spec.replicas}{"\n"}'
kubectl get pods -l app=web -o wide
kubectl describe pod POD_NAME -n NAMESPACE
kubectl get nodes
kubectl top pods -l app=web
```

Replace `web`, `POD_NAME`, and `NAMESPACE` with real values. `kubectl describe hpa` shows current and desired counts, conditions, and recent scaling events. `kubectl get pods -o wide` shows the node and the READY column; a missing node means not assigned, and `0/1` means not Ready. `kubectl top` needs metrics-server and shows current usage, not the average the HPA used at its last sync.

**Limit:** These are snapshots, and events expire. The HPA does not write a status line for every sync, so a single `describe` cannot reconstruct the window. A Deployment's replica count can change between two reads. This page has not run these commands against a live cluster.

## Predict and transfer

A Deployment has four Pods: three Ready and one Pending. Each Pod requests 200m. Ready Pods together use 480m of CPU. The target is 50% and `maxReplicas` is 10.

**Prediction:** The Ready average is 480 ÷ 3 = 160m, which is 80% of the request, so the ratio is 1.6. The Pending Pod is set aside, and a scale-up assumes it uses 0%. The adjusted ratio is (3 × 1.6 + 1 × 0) ÷ 4 = 1.2. The desired count is `ceil(4 × 1.2) = 5`. The HPA reports the 80% it measured, not the 1.2 it acted on.

Transfer question: one new Pod never becomes Ready because its readiness probe fails. Will adding more replicas make the load go away, and which controller would have to change for that Pod to become Ready? (Answer: no. The ReplicaSet creates Pods whether or not they are Ready, and the HPA sets not-Ready Pods aside. On a scale-up they count as 0%, so the HPA asks for the same or fewer replicas, never more. The readiness probe and the application must change; no controller in this model repairs it.)

Continue with [Kubernetes scheduling and placement constraints](/learn/kubernetes-scheduling-placement?mode=reference) and [Scheduling, resources, and health probes](/learn/scheduling-resources-health?mode=reference). This explanation supports their existing requests and scale objectives; exploring the object does not record mastery.

## Assumptions and limits

The fixture is a teaching model with these simplifications, named so no result is over-claimed:

- One sync is one 15-second period. The downscale window is counted in syncs and is set to 0 or 45 seconds; the default is 300 seconds.
- The HPA syncs only when every Pod it requested exists. Real HPAs do not wait; this rule keeps one decision from mixing creation with measurement.
- Scaling policies (rate limits in `behavior`), the initial-readiness delay, and the CPU initialization period are not modelled.
- On a scale-down, the fixture counts not-yet-Ready Pods as the target. The documented scale-down rule covers missing metrics; extending it to not-Ready Pods is a fixture choice.
- `minReplicas` is fixed at 2.
- Pods are removed at once. Real Pods receive a termination grace period first.
- The stand-in scheduler places a Pod on the node with room and the fewest web Pods, then the lowest node number. Real scheduling uses many filters and scores.
- Pods request CPU only. Memory, custom metrics, and pod-deletion-cost are absent.
- A request change applies to every existing Pod at once. A real template edit rolls out new Pods.
- Node 1 and node 2 each carry 500m of other workloads; each node has 1000m allocatable and four Pod bays. Cluster Autoscaler adds only nodes 3 and 4, with no other load.
- The page does not run commands, persist data, or claim live verification. Exploring it does not record mastery or change progress.

## Authoritative sources

Public claim review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Horizontal Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/) — the algorithm, set-aside rules, tolerance, stabilization window, metrics-server, and the replicas-in-manifest caution.
- [Kubernetes: Autoscaling Workloads](https://kubernetes.io/docs/concepts/workloads/autoscaling/) — the difference between horizontal, vertical, and cluster-level scaling.
- [Kubernetes: Vertical Pod Autoscaling](https://kubernetes.io/docs/concepts/workloads/autoscaling/vertical-pod-autoscale/) — VPA adjusts requests and limits, and needs metrics-server.
- [Kubernetes: ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/) — the scale-down victim order.
- [Kubernetes: Node Autoscaling](https://kubernetes.io/docs/concepts/cluster-administration/node-autoscaling/) — provisioning for unschedulable Pods, separate from workload autoscaling.
- [Kubernetes: HorizontalPodAutoscaler Walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/) — a Deployment with CPU requests and a 50% target.
