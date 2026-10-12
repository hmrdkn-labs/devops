## The big picture

A Service call fails, and the first thing you see is a status word: `Pending`, `ImagePullBackOff`, `CrashLoopBackOff`, `Running`. Each word is a summary that one component wrote for its own step. The scheduler writes that a Pod has no node. The kubelet writes that a container cannot be pulled, mounted or kept alive. The EndpointSlice controller writes which Pods a Service routes to. The summary is not the diagnosis. The fix belongs to whichever owner's step failed, and you need evidence from that owner before you change anything.

The mental model is a ladder of six read-only rungs: Status, Placement, Events, Container, Logs and Endpoints. You climb from the symptom toward the owner, one observation at a time. Some rungs do not apply to some faults: a container that never started has no logs. When one rung names the cause, the fix is unlocked. Changing an object before you have localized the fault is the common mistake. It can repair the wrong thing, and it can destroy the evidence: deleting a Pod also deletes its events, previous logs and last container state.

The apparatus above is an original teaching fixture, not a live cluster. A ladder stands at the back left; its probe carriage rides to the last rung you read, and each rung has a read lamp. The housing is one Pod: its container cell sits seated when the container runs and is raised when it does not. A connector seats in the socket when a node is assigned. The lamp on the housing post is lit only when the Pod is Ready. A gate between the housing and a Service tray lifts when the selector matches the Pod labels, and an endpoint puck enters the tray only when the Pod is listed. Each indicator answers one question, and none stands in for another.

## Who owns what

- **You** write the spec: the Deployment template, the Service selector, and any object outside the Pod, such as a PersistentVolume or a ConfigMap. You also delete Pods, which is a request, not a repair.
- **The Deployment and its ReplicaSet** create replacement Pods from the template. A template change never edits a running Pod. With one replica and the default rolling update, the surge budget rounds up to 1 and the unavailable budget rounds down to 0, so the new Pod is created before the old one is removed.
- **The scheduler** binds an unassigned Pod to a node by setting `spec.nodeName`, or it writes a `FailedScheduling` event saying why no node fits. It starts no containers.
- **The PersistentVolume controller** binds a claim to a matching volume. A claim with no matching volume stays unbound. This fixture uses immediate binding, so the scheduler does not place the Pod while the claim is unbound.
- **The kubelet on the Pod's node** pulls images, mounts volumes, creates and starts containers, runs probes, restarts failing containers and writes container status. It is the only owner that starts containers.
- **The EndpointSlice controller** lists a Pod in a Service's endpoints only when the selector matches the Pod labels and the Pod is Ready. It restarts nothing.

## How it works

`kubectl get pods` prints a STATUS column. When a container is waiting or has terminated, that column shows the reason, which can be `ContainerCreating`, `ImagePullBackOff`, `CrashLoopBackOff` or `OOMKilled`. STATUS is a kubectl display field, not the Pod phase. The phase is `Pending` until the Pod is bound and its containers are created, and that includes time spent downloading images. It is `Running` while at least one container runs or is restarting. So `CrashLoopBackOff` can appear with phase `Running`, and a `Running` Pod can still be not Ready.

The ladder follows the owners in order:

1. **Status.** Read STATUS, READY and RESTARTS. This tells you the symptom and nothing more.
2. **Placement.** If `NODE` is empty, the scheduler owns the next step. If a node is set, the kubelet on that node owns it.
3. **Events.** The owner's own message: a scheduler refusal, a kubelet pull or mount failure, a probe failure, or a back-off notice. A back-off event says a container restarts, not why.
4. **Container.** The state (`Waiting`, `Running`, `Terminated`), the waiting reason, and `lastState` with its exit code. An exit code of 137 with reason `OOMKilled` means the kernel killed the process for exceeding its memory limit.
5. **Logs.** The application's own output, which for a crash is the previous run. A process killed by the kernel may print no reason at all.
6. **Endpoints.** The EndpointSlice for the Service. Compare the Service selector with the Pod labels, and check whether the Pod is Ready.

The ten fixture faults split by the owner that fails first:

- **Unassigned Pending**: the scheduler refuses. One fault is a request no node can fit; the other is a claim that stays unbound. Taint and affinity mismatches appear the same way, as a scheduler event naming the rule that failed.
- **Assigned Pending**: the kubelet cannot start the container, for example because a ConfigMap volume is missing. The Pod keeps its UID while the kubelet retries the mount.
- **ImagePullBackOff**: the kubelet cannot pull. Either the tag does not exist in the registry, or the registry refuses an anonymous pull and the Pod names no `imagePullSecrets`. The back-off delay grows and is capped at 5 minutes.
- **CrashLoopBackOff**: the container starts and exits. The exit code, the previous logs and the events each point to a different cause: an application error that logs a missing setting, a kernel OOM kill, or a liveness probe that kills an app still starting up. Liveness failures restart the container; a missing startup probe lets liveness fire too early.
- **Running but not Ready**: the readiness probe fails, so the Pod is removed from endpoints. The kubelet does not restart the container for a readiness failure, so RESTARTS stays 0.
- **Ready Pod, no endpoints**: the Pod is healthy, but the Service selector matches no Pod labels. No Pod event exists for this fault, which is why the Endpoints rung is the one that localizes it.

Fixes take one of two paths. A template fix creates a new Pod with a new UID and fresh counters; the old Pod stays listed until the new one is Ready. An external fix changes an object the Pod uses, and the same Pod keeps its name and UID until its owner acts on the change. Deleting a Pod is not a fix: the ReplicaSet recreates it from the same template, so it keeps the same spec and the same fault, and the evidence on the old object is discarded.

For the owners in depth, read [Taints and tolerations](/anatomy/taints-tolerations/) for scheduler refusals, [Pod lifecycle and health probes](/anatomy/pod-lifecycle/) for probes and restarts, and [Service endpoints](/anatomy/service-endpoints/) for selectors and EndpointSlices.

## YAML example

The Pod and Service below are what the figure's ManifestPanel shows for the default fixture before any rung is read: the Pod is Pending because no node has 2 CPU free. The `spec` is what you write. The `status` is written by the scheduler and the kubelet. The `uid` is assigned by the API server; the figure uses a fixture stand-in.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: orders-api-7d4b5-x2k4q
  labels:
    app: orders-api
  uid: p-1   # fixture stand-in for a UUID
spec:
  containers:
  - name: app
    image: registry.example.com/orders-api:1.4.2
    env: [{name: DATABASE_URL, value: orders-db}]
    resources:
      requests: {cpu: "2"}
      limits: {memory: 256Mi}
    livenessProbe: {httpGet: {path: /livez, port: 8080}, initialDelaySeconds: 5, failureThreshold: 3}
    readinessProbe: {httpGet: {path: /readyz, port: 8080}, periodSeconds: 10}
  volumes:
  - name: data
    persistentVolumeClaim: {claimName: orders-api-data}
  - name: conf
    configMap: {name: orders-api-conf}
status:
  phase: Pending
  conditions:
  - {type: PodScheduled, status: "False", reason: Unschedulable}
  - {type: Ready, status: "False"}
---
apiVersion: v1
kind: Service
metadata:
  name: orders-api
spec:
  selector: {app: orders-api}
```

Read the example in three parts:

- `requests.cpu: "2"` is the cause the Events rung names. Its condition `PodScheduled` is False with reason `Unschedulable`, so no node has been assigned and no `nodeName` appears.
- The probes and volumes are real fields. The readiness path `/readyz` matches the app in the healthy case, and the Service selector `orders-api` matches the Pod label. Each symptom moves one of these fields away from its healthy value.
- The `# fixture stand-in` comment marks the UID, which real objects give as a UUID. The `---` line separates the Service from the Pod in one file, as `kubectl get -o yaml` does for a list.

## Try these changes

Each experiment names its symptom in the Symptom fixture select, which loads a fresh object. Rung and action labels match the buttons on the figure.

1. **Read before you change.** On the default fixture, press Apply fix first: it stays disabled with "Locked: no read has named the cause yet." Press 3 Events. Apply fix unlocks; press it and the Deployment template changes CPU from 2 to 250m. A new Pod `orders-api-5c9f6-q9wz1` appears, unassigned and not Ready, and `orders-api-7d4b5-x2k4q` is still listed. Press Let owners reconcile once: the new Pod is placed on node-2 and becomes Ready, and the old Pod is removed.
2. **Delete destroys evidence.** Choose ImagePullBackOff with the tag 1.4.3. Press Delete Pod before reading anything. The replacement has the same spec and the same fault, and the Evidence ledger is empty again. Reconcile once; the registry still answers "manifest unknown". Only the rungs you read on the new object count.
3. **Retrying a crash does not fix it.** Choose the OOMKilled crash. Press Let owners reconcile once three times: RESTARTS goes from 3 to 6, and STATUS stays CrashLoopBackOff. Press 4 Container: lastState shows OOMKilled and exit code 137, and the cause names the memory limit. Press Let owners reconcile once more: the Container snapshot now carries the "read before the last change" badge, because an owner ran after you read it. Apply fix raises the limit to 256Mi on a new Pod, which clears the ledger because the new object has no reads yet. Reconcile once and it is Ready with RESTARTS 0. The fixture counts one restart per owner press for simplicity. The real kubelet waits longer after each crash, an exponential back-off of 10s, 20s, 40s and so on, capped at 300 seconds (5 minutes), so a real loop slows down rather than restarting once per press.
4. **Readiness never restarts.** Choose the readiness 404 fixture and reconcile three times. READY stays 0/1, RESTARTS stays 0, and the endpoint count stays 0, while the probe event count rises. Press 3 Events, apply the template fix, then reconcile once: the new Pod is Ready and listed, and the old Pod is removed.
5. **A Ready Pod can still have no endpoints.** Choose the selector mismatch. Press 6 Endpoints: the Service selects `app=orders` and the Pod is labelled `app=orders-api`. Apply fix edits the Service, not the Pod, so the Pod keeps its name and UID. The gate lifts at once, because the Service now selects `app=orders-api`. The puck stays outside until you reconcile once and the EndpointSlice controller lists the Pod; then the puck enters the tray and the endpoint count reads 1.

## Misconceptions

- **Pending means the image is missing.** Pending covers both an unscheduled Pod and a Pod whose containers are not yet created, which includes volume mounts and image downloads. Read Placement to see which.
- **CrashLoopBackOff is a Pod phase.** It is a container waiting reason that kubectl prints in STATUS. The Pod phase stays `Running` while the container restarts.
- **Running means it is serving.** `Running` is a phase. Ready is a condition, and only Ready Pods are listed in endpoints.
- **A failing readiness probe restarts the container.** It removes the Pod from endpoints. Liveness and startup probes restart containers, and `restartPolicy` decides what happens after an exit.
- **The events tell the whole story.** Events are short-lived records, and an owner writes only what it saw. In the crash fixture the events say only "Back-off restarting failed container"; the cause is in the logs.
- **Deleting the Pod fixes it.** The ReplicaSet recreates the Pod from the same template, so the same fault returns with fresh counters and no evidence.
- **A Ready Pod is reachable through its Service.** Only if the Service selector matches its labels.

## Safe read-only observation

- `kubectl get pods -o wide` shows STATUS, READY, RESTARTS and NODE. Limit: READY counts containers, and it does not say which owner failed.
- `kubectl describe pod <name>` shows the Events section and the container state, reason and exit code. Limit: events are short-lived records, and the output is a snapshot of a moving object.
- `kubectl get pod <name> -o jsonpath='{.status.containerStatuses[0].lastState}'` shows the last termination reason and exit code. Limit: it holds only the most recent termination.
- `kubectl logs <name> --previous` shows the output of the last terminated container. Limit: there is none if the container never started, and a kernel kill can leave no error line.
- `kubectl get endpointslices -l kubernetes.io/service-name=<service>` shows which Pods a Service lists. Limit: it does not show whether the application answers requests correctly.
- `kubectl get svc <service> -o jsonpath='{.spec.selector}'` together with `kubectl get pods --show-labels` compares the selector with the labels. Limit: it does not show readiness; check both.

## Predict and transfer

1. A Pod is `Running`, `READY 0/1`, `RESTARTS 0`, and its Service has no endpoints. Which owner failed, and which rung localizes it? *Answer:* the kubelet's readiness probe is failing or has not passed. The Events rung names the probe. RESTARTS is 0 because readiness never restarts a container.
2. `kubectl get pod` shows `CrashLoopBackOff`, and `lastState` reads `OOMKilled` with exit code 137. Which rung localizes the cause, and is the phase `Running`? *Answer:* the Container rung; yes, the phase is `Running` while the container restarts.
3. A Pod is unassigned, and its event says the claim is unbound. You create a matching PersistentVolume. Does the Pod get a new UID? *Answer:* no. The PV controller binds the claim, then the scheduler places the same Pod; the fix lives outside the Pod.
4. You change the Deployment's image tag to a valid one. The new Pod is created, and the old Pod stays in `ImagePullBackOff` for a while. Why? *Answer:* the rolling update creates the new Pod first, because maxSurge rounds up to 1 and maxUnavailable rounds down to 0. The old Pod is removed only after the new one is available.

## Assumptions and limits

- One Deployment with one replica, one Service and one container named `app`. The Pod name suffixes and the `p-N` UIDs are fixture stand-ins.
- Each fault is authored with one cause. Real symptoms often combine causes, and the ladder must be read again after each change.
- Event wording, the count of nodes, and the scheduler message are representative and abridged. Exact text varies by Kubernetes version, and the ×N counts are fixture counts, not kubectl output.
- One "Let owners reconcile once" press stands for one pass of each owner's loop. Real controllers run continuously, and the back-off delays are described rather than modelled.
- The exit code 143 for a liveness kill depends on how the app handles SIGTERM. The fixture uses 143 for that case and 137 for the kernel OOM kill.
- Probe timing is fixed by the fixture: liveness uses an initial delay of 5 seconds and a failure threshold of 3, and the startup probe fixture allows 12 failures at 5 seconds. Real defaults differ.
- Creating a PersistentVolume, a ConfigMap or a Service selector change takes effect in one step here. Real controllers take time to observe the change.
- Not modelled: taints and affinity in full, network policy, DNS, init containers, sidecars, image digests, node pressure, and cross-namespace Services.

## Authoritative sources

- [Debug Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/): the Pending and Waiting checks and the first `kubectl describe` step. Documentation reviewed 2026-10-12.
- [Debug Running Pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/): container state, Ready and restart count, and how events are read. Documentation reviewed 2026-10-12.
- [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/): checking EndpointSlices and selector labels when a Service has no endpoints. Documentation reviewed 2026-10-12.
- [Determine the Reason for Pod Failure](https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/): termination messages and where a failing container reports its reason. Documentation reviewed 2026-10-12.
- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/): phases, the Status field as a display value, container states and back-off. Documentation reviewed 2026-10-12.
- [Images](https://kubernetes.io/docs/concepts/containers/images/): ImagePullBackOff, its 5-minute cap, and imagePullSecrets. Documentation reviewed 2026-10-12.
- [Assign Memory Resources to Containers and Pods](https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/): OOMKilled with exit code 137. Documentation reviewed 2026-10-12.
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/): claims that stay unbound until a matching volume exists. Documentation reviewed 2026-10-12.
- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/): rolling update surge and unavailability rounding. Documentation reviewed 2026-10-12.
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/): selectors, and the controller that keeps EndpointSlices in step with matching Pods. Documentation reviewed 2026-10-12.
