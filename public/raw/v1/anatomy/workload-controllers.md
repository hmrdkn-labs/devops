## The big picture

A Pod is one set of containers on one node, and it does not repair itself. When a Pod is deleted, a new Pod with a new UID appears only if some controller creates it. The Pod alone cannot answer three questions a real application needs answered: how many copies should exist, whether a replacement is interchangeable or must keep its name and storage, and whether the work is meant to end.

Kubernetes answers those questions with the **kind** of the workload object you apply. The kind selects the controller that will own the Pods, and each controller has different promises. Choose by the promise the workload needs, not by the container image.

| The workload needs… | Kind | Identity it keeps | What it does not promise |
| --- | --- | --- | --- |
| Interchangeable replicas that keep serving | Deployment | Replicas are counted, not named | That a deleted Pod's replacement is the same Pod |
| Stable names and one volume per replica | StatefulSet | Ordinals `web-0`, `web-1`, … and their claims | That a Pod stays on the same node |
| One Pod per eligible node | DaemonSet | Coverage follows node presence | Replica counts, or Pods moving between nodes |
| Work that ends | Job | Completions counted from successful Pods | Retries beyond `backoffLimit` |
| The same Job on a schedule | CronJob | One Job object per scheduled run | That each run starts at the exact instant, or that skipped runs are queued |

This apparatus is an **authored fixture**. Pod labels `p1`, `p2` and so on are readable UIDs, not Kubernetes names. The fixture performs no request to a cluster.

## Who owns what

- **You** choose the kind and apply the manifest. That stores intent; it creates no Pod.
- **Deployment controller** manages ReplicaSets and rollouts. Here it only holds the relationship between the Deployment and its ReplicaSet.
- **ReplicaSet controller** creates and deletes Pods until the live count matches `replicas`, using the template.
- **StatefulSet controller** creates `web-0` through `web-N-1` in order, one claim per ordinal from `volumeClaimTemplates`.
- **DaemonSet controller** creates one Pod per eligible node and sets that Pod's `nodeAffinity` to the node's name.
- **Job controller** creates Pods while completions remain, within `parallelism`, and counts failed Pods against `backoffLimit`.
- **CronJob controller** creates a Job object when a schedule time arrives, unless `concurrencyPolicy` says otherwise.
- **kube-scheduler** (or the default scheduler, after a DaemonSet's affinity is set) binds a Pod to a node.
- **kubelet and container runtime** start containers. A readiness probe result decides Ready.

Each controller writes only changes of its own kind. None of them starts containers.

## How it works

Every Pod in the figure passes through the same stages, but each controller decides when a Pod may advance:

1. **Create.** The owning controller creates a Pod object with a new UID from its template. Creation is not scheduling.
2. **Assign.** A scheduler writes `nodeName`. The Pod is bound to a node but its containers are not all created yet. In the API it is still `Pending`.
3. **Run.** The kubelet creates the containers. The Pod is `Running`, which is a phase, not a readiness claim.
4. **Ready.** The readiness probe succeeds and the Pod's Ready condition becomes true. Services and endpoints are not modeled here.

The controllers differ in the rules that gate each stage:

- **Deployment.** The ReplicaSet creates until the live count reaches `replicas`. When it must scale down, real ReplicaSets rank candidates: pending Pods first, then lower deletion cost, then Pods on nodes with more replicas, then newer Pods, then random choice. The fixture removes the newest Pod. Scaling does not start a rollout; only a change to the Pod template does.
- **StatefulSet.** Ordered creation: `web-1` is not created until `web-0` is Running and Ready. Deletion runs in reverse. Each Pod's PersistentVolumeClaim outlives the Pod and is not deleted by scale-down. A deleted `web-1` comes back as a new UID with the same name, and `data-web-1` is reattached. The fixture deletes immediately; the real controller waits for successors to finish terminating.
- **DaemonSet.** One Pod per eligible node. A node that leaves takes its Pod with it, and a node that joins gets one Pod. The fixture counts a node as eligible only if it is present. Real eligibility also depends on selectors, affinity and taint tolerations.
- **Job.** Parallelism caps live Pods, and the remaining completions cap parallelism. A Pod that exits 0 is Succeeded. Each failed Pod is counted. While the count stays within `backoffLimit`, the controller creates a replacement, which is the retry. When failed Pods exceed `backoffLimit`, the Job is Failed and running Pods are terminated. The Jobs page words this two ways: the backoff section says the Job is considered failed once the count *reaches* `backoffLimit`, and the terminal-conditions list says failures *exceed* it. This fixture follows "exceed", so `backoffLimit: 2` allows two replacements and the third failed Pod fails the Job. Confirm that boundary on a real cluster before relying on it. The fixture uses `backoffLimit: 2`; the Kubernetes default is 6. It omits the exponential delay between retries.
- **CronJob.** Each schedule time creates one Job object. `Allow` is the default; `Forbid` skips a new run while the previous Job is still active; `Replace` replaces it. History limits default to 3 successful and 1 failed Job. Schedule times are approximate.

## YAML example

This is the Deployment manifest the panel shows when the page opens. Change the kind to see the other manifests.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
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
        image: registry.example.com/web:1.0
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
```

- `replicas` is intent. Changing it changes nothing until the ReplicaSet controller acts.
- `selector.matchLabels` must match `template.metadata.labels`; both say `app: web`.
- `template` is the recipe for every new Pod. Changing it starts a rollout.
- `readinessProbe` is why Running is not Ready.

A StatefulSet adds `serviceName: web` and a `volumeClaimTemplates` entry, so each ordinal gets its own claim, `data-web-N`.

## Try these changes

1. **Scale a Deployment.** Apply the Deployment and run events until three Pods are Ready. Choose desired replicas `2`. The ChangeReport says the observed count stays at 3 until a controller acts. Run the next event: the newest Pod is removed, and the template and the other Pods are unchanged.
2. **Delete a StatefulSet Pod.** Apply the StatefulSet and run events until three Pods are Ready. Choose `web-1` in "Pod to delete": the report says nothing changed and names the Pod that Delete will act on. Press Delete selected Pod, then run the next event. `web-1` returns with a new UID, and `data-web-1` is listed as retained throughout.
3. **Ordered start.** Apply the StatefulSet and press Run next event once. Only `web-0` is created. The next create waits until `web-0` is Ready.
4. **Node ownership.** Apply the DaemonSet. Remove `node-b`: its node-agent Pod is evicted, and no Pod moves to another node. Add `node-d`: a Pod is created for it on a later event, pinned by `nodeAffinity`.
5. **Job failure budget.** Apply the Job and run events until two Pods are running. Use "Pod exits non-zero" once: the report says `retries used 1 of 2` and a replacement appears on the next event. Use it again: `retries used 2 of 2`, and another replacement appears. A third non-zero exit exceeds `backoffLimit`: the Job is Failed and the other running Pods are removed.
6. **CronJob Forbid.** Apply the CronJob and press "Schedule fires". Press it again while the run is active: the second run is skipped and nothing is queued. Run events until the first Pod is running, let it exit 0, then press "Schedule fires" again: a new Job is created.

## Misconceptions

- **"A Job is a Deployment that stops."** A Job counts successful completions. A Job's Pod template must use `restartPolicy: Never` or `OnFailure`. Deployment Pods default to `restartPolicy: Always` and are kept running.
- **"A StatefulSet Pod is the same Pod."** The name and claim are stable. The UID is new after replacement, and the Pod may land on another node. Kubernetes does not guarantee the same node.
- **"A DaemonSet runs on every node."** It runs on eligible nodes. Selectors, affinity and taints decide eligibility, and the DaemonSet controller adds only certain tolerations automatically.
- **"A CronJob runs exactly on time."** It creates Job objects approximately once per schedule time. Edge cases can create two or none, so design the Job to be idempotent.
- **"Ready means the controller finished."** Ready is a probe result. Assigned and Running are separate facts, and a Pod can be Running without being Ready.

## Safe read-only observation

In a namespace you are authorized to read, replace `demo` and `web` with your names:

```sh
kubectl get deployment,statefulset,daemonset,job,cronjob -n demo
kubectl get pods -n demo -o wide --show-labels
kubectl get pvc -n demo
kubectl describe job <job-name> -n demo
```

**Limits:** each command is a snapshot, not a history. `-o wide` shows the node but not why the scheduler chose it. Events from `describe` are short-lived, so a missing event does not prove nothing happened. A PVC listing shows that a claim exists, not what data it holds. Running these commands is not part of this page.

## Predict and transfer

- A Deployment has three Ready Pods and you delete one. Before the next event, predict: does the replacement keep the old Pod name? Which controller creates it?
- A StatefulSet's `web-1` is Running but not Ready. Which ordinal can be created next, if any? Why?
- A DaemonSet's node carries a taint that the Pod template does not tolerate. Which part of the DaemonSet documentation says how eligibility is decided, and does this fixture model taints? (It does not.)
- A Job has `completions: 3`, `parallelism: 2` and `backoffLimit: 6`. Two Pods fail, then one succeeds. Is the Job Failed, and how many successes remain? With `backoffLimit: 2` instead, how many failed Pods end the Job?
- A CronJob with `concurrencyPolicy: Forbid` has runs that take 100 minutes, and its schedule fires every 30 minutes. Over the first 120 minutes, which schedule times create a Job and which are skipped?

## Assumptions and limits

- Fixture values: 4 nodes, 2 Pod sockets per node, `node-d` absent at start. Deployment replicas 0 to 4. Job `completions: 3`, `parallelism: 2`, `backoffLimit: 2`. CronJob history limits 3 and 1, the Kubernetes defaults.
- Simplifications: Pod deletion is immediate and terminating Pods are not drawn. Real counts can temporarily exceed `replicas`. Placement is a fixed rule (fewest bound Pods, then node order), not the scheduler's scoring. Readiness succeeds on an explicit event. The Job retry delay is omitted. StatefulSet scale-down does not wait for successors. DaemonSet eligibility is presence only. A deleted Job Pod is replaced without counting as a failure.
- Not modeled: Services, PodDisruptionBudgets, rolling update strategies, pod failure policies, indexed Jobs, Pod garbage collection after node loss.

## Authoritative sources

Reviewed 2026-10-12 against the kubernetes.io pages below. Claims about the Pod phase and binding come from the Pod lifecycle page.

- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
- [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
- [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- [DaemonSet](https://kubernetes.io/docs/concepts/workloads/controllers/daemonset/)
- [Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)
- [CronJob](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/)
- [Pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)

This exploration supports [Pods and workload controllers](/learn/pods-workloads?mode=reference), objective `fpp:pods-workloads/controller-choice`, and [KCNA scheduling review](/learn/kcna-scheduling-review?mode=reference), objective `fpp:kcna-scheduling-review/node-ownership`. Exploring this fixture does not record evidence for those objectives.
