## The big picture

A container has two resource numbers, and they do different jobs. A **request** is what the scheduler reserves on a node before it places the Pod. A **limit** is the ceiling the kubelet and the Linux kernel enforce while the container runs. A Pod that sets only a request can use more than that request when the node has spare room. A Pod with a limit cannot use more CPU than the limit, and it can be killed for using more memory than the limit.

The admission step adds a third question. Before a Pod is created, the namespace can check its numbers. A **LimitRange** supplies defaults for fields the author left out and sets a maximum for a container's limits. A **ResourceQuota** caps the total requests of the namespace. Both act when a Pod is created, not on Pods already running.

The figure is one candidate Pod in the namespace `shop` on one node, **node-a**, with three resident Pods already there. You choose the candidate's requests and limits, switch the two namespace policies on or off, and then submit it. Each later step (load, node memory pressure) shows one mechanism at a time, so you can see which owner decided what.

The figure is a teaching fixture with fixed numbers, not a live cluster. Its simplifications are listed under [Assumptions and limits](#assumptions-and-limits).

## Who owns what

- **Workload author** writes `resources.requests` and `resources.limits` in the Pod spec, often through a controller's Pod template. The author decides the values; nothing else invents them.
- **Namespace administrator** creates a LimitRange (per-container defaults and bounds) and a ResourceQuota (namespace totals of requests). These are policy objects, not per-Pod settings.
- **API server admission** applies defaulting, then the LimitRanger's defaults, then checks the LimitRange max and the ResourceQuota. The order of defaulting and the LimitRanger follows the kube-apiserver code; see How it works. A refused Pod is never created.
- **kube-scheduler** fits a Pod's requests against each node's allocatable capacity minus the requests already committed there. It ignores limits and ignores actual usage.
- **kubelet and container runtime** start each container with its requests and limits and pass them to the kernel through cgroups. Under node memory pressure, the kubelet chooses Pods to evict.
- **Linux kernel** (through cgroups) throttles CPU that exceeds the limit and OOM-kills a container that exceeds its memory limit.

## How it works

1. **Admission fills and checks.** Defaults come before the checks. The kube-apiserver defaulting code copies a container's limit into a missing request, and then the LimitRanger fills each still-missing request and limit from the namespace's LimitRange defaults. The figure follows that order at the time of writing; the docs state the copy rule in different words, so confirm the stored result with `kubectl apply --dry-run=server -o yaml`. Next, each container's limits are checked against the LimitRange **max**, and a limit above the max is refused with 403 Forbidden. Last, if a ResourceQuota tracks CPU or memory, every new Pod must set a request or a limit for each of them, and the sum of requests across non-terminal Pods must stay within the hard limit. The fixture reports the LimitRange and quota verdicts separately, so you can see both.
2. **The QoS class is derived once.** It is computed from the effective spec, after defaulting, and stored when the Pod is created. **Guaranteed** means every container sets CPU and memory requests equal to its limits. **Burstable** means at least one request or limit is set, but not all of the Guaranteed conditions hold. **BestEffort** means no requests or limits are set. Because the class is read after defaults, a LimitRange can change it: a BestEffort Pod that receives defaults becomes Burstable.
3. **The scheduler fits requests only.** For CPU and memory separately, the request must not exceed node-a's allocatable capacity minus the requests of Pods already bound there. A Pod that fits is bound to node-a. A Pod that does not fit remains Pending, with no node name, and the scheduler does not consider its limits. A Pod can have limits far larger than node capacity and still be scheduled, as long as its requests fit.
4. **The kubelet and kernel enforce limits.** A CPU limit is a hard ceiling. When the container would exceed it, the kernel holds the cgroup back until the next period, so the container runs more slowly and is not killed for CPU. A memory limit is also enforced by the kernel. When a process in the container tries to allocate past the limit, the OOM handler stops it. The Kubernetes docs say this is reactive: a container over its memory limit is killed only when the kernel detects memory pressure. The fixture simplifies this to an immediate kill. When the killed process is PID 1 and the container is restartable (the default `restartPolicy: Always`), the kubelet restarts the container inside the same Pod. The restart count goes up by one, the last state reports `OOMKilled` with exit code 137, and the Pod keeps its name and node.
5. **Node-pressure eviction ranks by usage above request.** When `memory.available` falls below the eviction threshold, the kubelet evicts Pods in this order. First are Pods whose memory use exceeds their memory request. Any BestEffort Pod that uses memory exceeds its zero request, so these come first. Within this group, Pods are ordered by priority and then by how far their usage exceeds the request. After them come Guaranteed and Burstable Pods whose use is under their request, ordered by priority. The kubelet sets an evicted Pod's phase to Failed. A controller such as a Deployment creates a replacement with a new name; a bare Pod does not get one. The QoS class is not an input to this ranking. The docs suggest using QoS only to estimate the likely order.

The fixture's residents make the numbers concrete. **checkout-7f9c** is Guaranteed: request and limit 500m and 512Mi. **search-5d6b** is Burstable: request 300m and 256Mi, limit 1000m and 1024Mi. Its memory use is either 200Mi (within its request) or 600Mi (above it). **batch-report-x** is BestEffort: 300Mi of memory use against a zero request. Node-a has 2000m and 2048Mi allocatable. The residents request 800m and 768Mi together.

## YAML example

The figure renders the namespace policies and the candidate Pod from its state. This is the matching configuration: both policies on, and the candidate's author spec is burstable. The policy objects below are the values the fixture uses, and the Pod is the author's draft before submission.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: shop-defaults
  namespace: shop
spec:
  limits:
  - type: Container
    defaultRequest:       # filled only where the author left a request empty
      cpu: 200m
      memory: 256Mi
    default:              # filled only where the author left a limit empty
      cpu: 500m
      memory: 512Mi
    max:                  # a limit above this is refused at admission
      cpu: "1"
      memory: 1Gi
---
apiVersion: v1
kind: ResourceQuota
metadata:
  name: shop-quota
  namespace: shop
spec:
  hard:                   # sum of requests across non-terminal Pods in shop
    requests.cpu: "1"
    requests.memory: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: api-canary-1
  namespace: shop
spec:
  containers:
  - name: api
    image: registry.example.com/api:2.3
    resources:
      requests:           # what the scheduler reserves and the quota counts
        cpu: 200m
        memory: 256Mi
      limits:             # what the kernel enforces: throttle CPU, OOM-kill memory
        cpu: 500m
        memory: 512Mi
```

After you submit, the Pod panel shows the stored spec. Each field carries a comment naming who filled it (author, API default, or LimitRange default), and a status block appears with `qosClass`, `nodeName` and the restart count. The fields that a run depends on are highlighted.

## Try these changes

1. **Burstable, then Submit Pod, then Run load with spike.** Expected: CPU demand of 900m is capped at the 500m limit and throttled; CPU is never a reason to kill the container. Memory demand of 900Mi exceeds the 512Mi limit, so the container is OOM-killed and restarted in the same Pod. The restart count becomes 1, and the Pod keeps its name. The change report names the kernel cgroup as the actor and the kubelet as the restarter.
2. **Guaranteed, with ResourceQuota on, then Submit Pod.** Expected: the namespace would reach 1300m CPU against a 1000m quota, and 1280Mi memory against 1024Mi. The Pod is rejected at admission, no Pod object exists, and the scheduler never runs. Switch the quota off and submit again: the Pod is bound to node-a and its qosClass is Guaranteed.
3. **BestEffort, with LimitRange on, then Submit Pod.** Expected: the LimitRange fills the default request (200m and 256Mi) and default limit (500m and 512Mi). The stored qosClass changes from BestEffort to Burstable. Turn ResourceQuota on as well and submit: the filled requests make the Pod countable, and it lands exactly at the quota.
4. **CPU 1500m request and limit, with both policies off, then Submit Pod.** Expected: the Pod object is created but stays Pending with no node. The scheduler's fit fails on CPU, because 1500m is more than the 1200m free on node-a. The change report names the requested and free values.
5. **Set search-5d6b to 600Mi with no Pod submitted, then Apply node memory pressure.** Expected: node memory in use is 1300Mi, so 748Mi is available, below the 768Mi line. The ranking puts search-5d6b first, because it is 344Mi above its request. Evicting it brings available memory above the line, so batch-report-x, a BestEffort Pod, stays. Its usage is 300Mi above its zero request, so the ranking here is by excess, not by QoS.

## Misconceptions

- **Wrong:** "A Burstable Pod cannot use more than its request." **Correct:** the request is a reservation. Usage above it is allowed while the node has room. The limit is the ceiling, and it is what the kernel enforces.
- **Wrong:** "Exceeding a memory limit always kills the container immediately." **Correct:** the kernel's OOM handling is reactive and usually acts under memory pressure. The fixture shows an immediate kill to keep the mechanism visible; it is a simplification.
- **Wrong:** "BestEffort Pods are always evicted first." **Correct:** BestEffort Pods usually come first because their request is zero, so any use exceeds it. The kubelet's real rule is usage above request, then priority. A Burstable Pod that exceeds its request by more can be evicted before a BestEffort Pod that exceeds it by less.
- **Wrong:** "The QoS class decides eviction." **Correct:** the kubelet does not use the QoS class to choose a victim. The class is a useful estimate of the likely order, and the ranking uses usage, request and priority.
- **Wrong:** "The scheduler checks limits, so a Pod whose limit exceeds node capacity cannot run." **Correct:** the scheduler checks requests only. A Pod with a large limit and a small request can run, and its limit is enforced later at runtime.
- **Wrong:** "A CPU limit kills the container when it is exceeded." **Correct:** CPU over the limit is throttled. The container keeps running, more slowly.
- **Wrong:** "Adding a LimitRange changes existing Pods." **Correct:** LimitRange validation and defaults happen at admission only. Pods already in the namespace are unchanged.

## Safe read-only observation

Run these only against a cluster you are authorized to inspect. They read state and change nothing:

```sh
kubectl get pod api-canary-1 -n NAMESPACE -o jsonpath='{.status.qosClass}{"\n"}{.spec.containers[0].resources}{"\n"}'
kubectl get pod api-canary-1 -n NAMESPACE -o jsonpath='{.status.containerStatuses[0].lastState.terminated.reason}{"\n"}'
kubectl describe pod api-canary-1 -n NAMESPACE
kubectl get limitrange,resourcequota -n NAMESPACE
kubectl describe resourcequota shop-quota -n NAMESPACE
kubectl describe node node-a
```

The first command shows the stored QoS class and the effective resources. `describe pod` shows the last termination (`Reason: OOMKilled`, `Exit Code: 137`) and the restart count. `describe resourcequota` shows used against hard, and `describe node` shows the requests and limits committed on the node.

**Limit:** these are snapshots. `describe node` totals only the requests and limits of Pods bound to that node, not their live usage. Live usage needs the metrics pipeline, and it does not show the kernel's throttling counters. Events expire, so an old eviction may be gone. A Pod that is Pending shows the scheduler's reason, but a Pod that the admission step rejected has no object to describe at all.

## Predict and transfer

A BestEffort Pod with no requests and no limits is submitted to namespace `shop`. Both policies are on: the LimitRange default is a 200m and 256Mi request with a 500m and 512Mi limit, and the ResourceQuota is 1000m CPU and 1Gi memory. The three residents already request 800m CPU and 768Mi memory.

**Prediction:** the LimitRange fills both the request and the limit for each resource, so the Pod is admitted with qosClass Burstable, not BestEffort. The quota counts the filled requests: 800m + 200m = 1000m and 768Mi + 256Mi = 1024Mi, which is exactly the hard limit, so the Pod is admitted. The scheduler fits 200m and 256Mi into the 1200m and 1280Mi free on node-a, so the Pod runs there. The namespace card then reads 1000m / 1000m CPU and 1024Mi / 1024Mi memory.

**Check:** turn both policies on, press Submit Pod, and compare the change report and the namespace card. This prediction depends only on the defaults filling empty fields, not on the order in which the API server and the LimitRanger apply them.

Continue with [Scheduling and placement](/anatomy/scheduling-placement/) for how a Pod is matched to a node, and [Taints and tolerations](/anatomy/taints-tolerations/) for the other filter a node can apply. For the Pod lifecycle around a restart, read [Pod lifecycle](/anatomy/pod-lifecycle/). This explanation supports the Scheduling and resource-policy objectives of [the scheduling health unit](/learn/scheduling-resources-health?mode=reference) and [the Scheduling quiz companion](/learn/kcna-scheduling-review?mode=reference). Exploring the figure does not record mastery.

## Assumptions and limits

- **One container per Pod.** No init or ephemeral containers and no Pod-level resources (a beta feature). The docs describe Pod-level resources and in-place resize; the figure does neither. A running Pod's QoS class is fixed at creation, so the figure changes the draft by starting a new Pod with a new name, not by editing the running one.
- **Defaulting order.** The docs state the copy rule (a limit copied into a missing request, unless an admission default already set one) without giving the order against a LimitRange default. The figure follows the kube-apiserver defaulting code at the time of writing, which copies limits into requests before the LimitRanger runs. A limits-only result depends on that order; confirm it on a cluster with `kubectl apply --dry-run=server -o yaml`.
- **Missing quota fields.** The docs say the control plane *may* reject a Pod that states no request for a resource the quota tracks. The figure always rejects it.
- **Fixture numbers.** Node-a has 2000m and 2048Mi allocatable. The residents' requests and usage are fixed. Residents were admitted before these policies existed, so the LimitRange and quota do not change them, which matches the docs' rule that policies apply at admission.
- **Eviction threshold.** The figure evicts when `memory.available` drops below 768Mi. The kubelet's default on Linux is `memory.available<100Mi`. Soft thresholds, grace periods and minimum-reclaim amounts are not modelled.
- **Priority.** Every Pod has priority 0, so the priority step decides nothing. PriorityClass and preemption are not modelled. Among Pods that stay under their request, the figure orders by priority and then by name; the docs give no finer rule.
- **OOM and restarts.** The figure kills at once and restarts at 128Mi of idle memory. It does not model the kernel's reactive timing, CrashLoopBackOff back-off, or readiness after a restart.
- **Replacements.** Evicted Pods are set to Failed. The figure creates no replacement, because it does not model the controllers that would create one.
- **LimitRange scope.** Only the max on limits is modelled. The min, the request-to-limit ratio, and storage limits are not modelled. The LimitRange does not check whether its defaults are consistent with each other, and the figure does not demonstrate that case.
- **Readiness and probes.** Not modelled. "Running" in the figure means bound to node-a and started; it does not mean Ready. Probes and readiness are covered on the [Pod lifecycle](/anatomy/pod-lifecycle/) page.
- **Single node.** Scheduling considers only node-a, so the scheduler's choice between nodes is not shown here. See [Scheduling and placement](/anatomy/scheduling-placement/) for placement among nodes.
- The model does not run cluster commands, persist learner data, or claim live verification.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests drive scheduling, limits are enforced by the kubelet and kernel, CPU is throttled, memory is OOM-killed reactively, and a limit without a request copies the limit.
- [Kubernetes: Configure Quality of Service for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/quality-service-pod/) — the Guaranteed, Burstable and BestEffort criteria, and that the class is set at creation.
- [Kubernetes: Node-pressure Eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) — the eviction ranking by usage above request, then priority, and that the QoS class is not an input; evicted Pods are set to Failed.
- [Kubernetes: Limit Ranges](https://kubernetes.io/docs/concepts/policy/limit-range/) — defaults applied at admission, max and min checks, 403 Forbidden on violation, and that validation does not re-check running Pods.
- [Kubernetes: Resource Quotas](https://kubernetes.io/docs/concepts/policy/resource-quotas/) — requests and limits counted across non-terminal Pods, and that a quota on CPU or memory requires the Pod to state those values or have them defaulted.
