## The big picture

A Pod is a disposable record with an identity, not a process you can trust to report its own health. Kubernetes keeps several answers that can disagree: whether the Pod has a node, whether its container has started, whether that container should be restarted, and whether Services should send it traffic. The common mistake is to read one word, Running, as all four.

The mental model has two owners. The kubelet on the Pod's node runs the container and its probes, and it can restart that container inside the same Pod, so the Pod keeps its UID. Service endpoints follow a different condition, Ready. A replacement Pod is always a new object with a new UID, created by a controller from a template, never a restarted copy.

The apparatus above is an original teaching fixture, not a live cluster. The housing is the Pod's identity, the cell is its one container, `app`, and the shutter and two tallies are the startup, liveness and readiness probes. The gate and puck are one Service endpoint. The console shows the phase dial and four condition lamps. Each press of Next probe period is one probe period.

## Who owns what

- **You or a template author** declare the spec: which probes exist, their thresholds, and `restartPolicy`. A running Pod cannot have these edited in place; the Pod is replaced.
- **The scheduler** binds an unassigned Pod to a node by setting `spec.nodeName`, which makes `PodScheduled` True. It starts no containers.
- **The kubelet on that node** creates and starts containers through the container runtime, runs the probes, applies `restartPolicy`, and writes the Pod status: phase, conditions and `restartCount`.
- **The EndpointSlice controller** adds or removes the Pod's address in the EndpointSlices of matching Services as `Ready` changes. It restarts nothing.
- **A workload controller**, such as the ReplicaSet behind a Deployment, creates replacement Pods from the template. Neither the kubelet nor the EndpointSlice controller creates Pods.
- **The application** answers the probe endpoints. The figure's application behaviour control is that input.

## How it works

Phase is one summary value. It is `Pending` until the Pod is bound and its containers are created. It is `Running` once the Pod is bound and all containers have been created, while at least one is running, starting or restarting. It is `Succeeded` or `Failed` when every container has terminated and none will restart.

Conditions are separate facts: `PodScheduled`, `Initialized`, `ContainersReady` and `Ready`. Container state is `Waiting`, `Running` or `Terminated`, with `restartCount` counting restarts. A Pod can be Running with a Ready condition that is False, so Running is not Ready.

The figure follows these stages:

1. **Bind.** The scheduler sets `nodeName`. `PodScheduled` becomes True. The phase stays Pending and no container exists.
2. **Start containers.** The kubelet starts `app`. The phase becomes Running and `restartCount` is 0. With no probes at all, Ready is True at once. With a readiness probe, the result counts as Failure until a check succeeds, so Ready stays False and the Pod is not in endpoints.
3. **Startup probe.** When configured, it is the only probe that runs until it succeeds. Liveness and readiness do not run before then, so their counters stay at zero in the figure. Each failure is counted. At its `failureThreshold` the kubelet kills the container, and `restartPolicy` decides what follows. The application selector includes an app that never finishes starting: with a startup probe it is killed at six failures; without one, liveness kills it at three.
4. **Liveness.** Consecutive failures are counted. At the threshold the kubelet kills and restarts the container in place: `restartCount` increases and the Pod keeps its UID. Liveness is for a container that is alive but stuck, such as a deadlock. In this fixture the app stays deadlocked after every restart, so the same probe fails again and Ready stays False.
5. **Readiness.** Consecutive failures at the threshold set Ready to False, and the EndpointSlice controller removes the Pod from matching Services. The container keeps running and `restartCount` does not change. When the probe succeeds again, Ready is True and the Pod returns to endpoints.
6. **Exit.** When the process exits, or a probe kill ends it, `restartPolicy` decides. `Always` restarts any exit. `OnFailure` restarts only non-zero exits. `Never` leaves the container Terminated. The Pod becomes `Succeeded` or `Failed` when no container will restart. Repeated crashes enter exponential back-off: the first restart is immediate, then delays of 10 seconds, 20 seconds, 40 seconds and so on, capped at 5 minutes. While a container waits, its state is `Waiting` with reason `CrashLoopBackOff`. That reason is container state, not a Pod phase, so the phase remains Running.
7. **Replace.** A running Pod accepts only a narrow set of updates. Probes and `restartPolicy` are not among them. To change them, a controller creates a new Pod from its template, or you delete the Pod and create another. The new object has a new UID and fresh counters.

## YAML example

The block below is the Pod object the figure shows after one serving probe period, when the Pod is Ready. The `spec` is what you write. The `status` is written by the kubelet and API server. The `uid` is assigned by the API server; the figure uses a fixture id.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: orders-api
  uid: p-1 # fixture id; real UIDs are UUIDs
spec:
  nodeName: node-1
  restartPolicy: Always
  containers:
  - name: app
    image: registry.example.com/orders-api:1.4.2
    startupProbe:
      httpGet: {path: /startup, port: 8080}
      periodSeconds: 10
      failureThreshold: 6
    livenessProbe:
      httpGet: {path: /livez, port: 8080}
      periodSeconds: 10
      failureThreshold: 3
    readinessProbe:
      httpGet: {path: /readyz, port: 8080}
      periodSeconds: 10
      failureThreshold: 3
status:
  phase: Running
  conditions:
  - {type: PodScheduled, status: "True"}
  - {type: Initialized, status: "True"}
  - {type: ContainersReady, status: "True"}
  - {type: Ready, status: "True"}
  containerStatuses:
  - name: app
    restartCount: 0
    state: {running: {}}
  # EndpointSlice: this Pod is in Service endpoints (follows Ready)
```

Read the example in three parts:

- `startupProbe.failureThreshold: 6` is a fixture choice: six failures at 10 seconds apiece give a 60-second start window. The Kubernetes default is 3.
- `livenessProbe` and `readinessProbe` both use `failureThreshold: 3`, which is the default written out. Liveness decides restarts; readiness decides endpoints.
- The `# EndpointSlice` line is an annotation the figure adds. It is not a Pod field. A real object shows endpoint membership in EndpointSlices, not in the Pod.

## Try these changes

Each experiment starts from a fresh Ready Pod: press Reset to a new Pod, then Bind to node, Start containers and Next probe period. Experiments 3 and 5 create their own new Pod when a spec changes.

1. **Readiness alone.** Choose "Overloaded: readiness fails, liveness passes". Press Next probe period twice: Ready stays True and the puck stays in the tray. Press it a third time: the report reads "Pod removed from Service endpoints; not restarted". `restartCount` stays 0 and the Pod keeps `p-1`.
2. **Liveness restarts.** From a fresh Ready Pod, choose "Deadlocked: liveness and readiness fail" and press Next probe period three times. Liveness counts 1, 2 and then kills the container on the third press. `restartCount` becomes 1 and the UID stays `p-1`. Ready stays False: this fixture's app is deadlocked again after the restart, so readiness fails again (see Assumptions). Press Next probe period three more times: the third press kills the container again and it waits in CrashLoopBackOff, with `restartCount` still 1. The next press restarts it and `restartCount` reaches 2.
3. **Remove liveness and nothing restarts.** From the deadlocked case, uncheck Liveness probe. This creates Pod `p-2`, a new object with fresh counters; the Application behaviour is kept. Press Bind to node, Start containers, then Next probe period three times. Readiness counts its failures, Ready never becomes True, and `restartCount` stays 0. Only liveness restarts containers.
4. **Startup gates the others.** Press Reset to a new Pod, choose "Slow start: serves after 3 periods", then Bind to node, Start containers and Next probe period. After three presses the startup count reads 3 of 6 failed, while liveness and readiness counts stay at 0. On the fourth press the startup probe passes and Ready becomes True, with `restartCount` 0.
5. **Without startup, liveness kills a slow start.** Keep Slow start and uncheck Startup probe. This creates a new Pod. After Bind to node, Start containers and three presses, liveness reaches its threshold on the third press. The container restarts, `restartCount` is 1, and Ready never becomes True. The startup probe is what protects a slow start.

## Misconceptions

- **Running means ready to serve.** Running is a phase. It means the containers exist and at least one is running, starting or restarting. Ready is the condition that Services use.
- **A failing readiness probe restarts the container.** It does not. It removes the Pod from endpoints and leaves the container running. Restarts come from liveness or startup failures, and `restartPolicy` decides what happens after an exit.
- **CrashLoopBackOff is a Pod phase.** It is a container waiting reason shown in `kubectl` status. The phase of such a Pod can still be Running.
- **Editing a probe on a running Pod updates it.** The API rejects probe and `restartPolicy` changes on an existing Pod. The change arrives through a new Pod object.
- **No probe means healthy.** It means no probe is configured. Ready becomes True as soon as the container runs, so a deadlocked container without probes stays Ready.
- **A liveness restart fixes the fault.** It restarts the process, not the bug. Whether the fault returns depends on the application. In this fixture a deadlock returns after every restart, so Ready does not come back.
- **A replacement Pod is the same Pod.** A replacement may reuse the name, but it has a new UID and no memory of the old restart count.

## Safe read-only observation

- `kubectl get pod <name> -o wide` shows the STATUS, the READY count and RESTARTS. Limit: READY counts containers and does not say which probe failed or how many failures are pending.
- `kubectl get pod <name> -o jsonpath='{.status.phase}{"\n"}{range .status.conditions[*]}{.type}={.status}{"\n"}{end}'` shows the stored phase and conditions. Limit: conditions hold the latest value, not the history or failure counters.
- `kubectl describe pod <name>` shows the container's state, reason and exit code, its restart count, and events such as probe failures and kills. Limit: events are kept only for a limited time, so older ones may be gone.
- `kubectl get pod <name> -o jsonpath='{.spec.containers[0].livenessProbe}'` shows the probe configuration. Limit: it does not show whether the probe passes now.
- `kubectl get endpointslices -l kubernetes.io/service-name=<service>` shows whether the Pod's address is listed for that Service and whether it is ready. Limit: it does not prove that the application answers requests correctly.

## Predict and transfer

1. A Pod shows `Running`, `RESTARTS` 0 and `READY 0/1`. Which signal explains the endpoint state, and did the kubelet restart the container? *Answer:* Ready is False, so the Pod is not in endpoints. A readiness probe or readiness gate has not passed, or a startup probe is still gating the checks. No restart occurred because readiness never restarts containers.
2. Readiness fails for three consecutive periods on a Pod whose liveness probe keeps passing. Predict `restartCount`, Ready and endpoints. *Answer:* `restartCount` is unchanged, Ready is False, and the Pod is removed from endpoints. The container keeps running.
3. A Job's Pod uses `restartPolicy: OnFailure` and its container exits with code 0. Predict the phase. *Answer:* `Succeeded`, because the container will not restart.
4. You need a new probe path for the Pods of a Deployment. Which object do you edit, and what happens to the existing Pods? *Answer:* Edit the Deployment's Pod template. The ReplicaSet creates new Pods from it and the rollout replaces the old ones; the existing Pods are not changed in place.

## Assumptions and limits

- One Pod with one container, `app`. Init containers, sidecars, readiness gates and ephemeral containers are omitted.
- Four lamps show PodScheduled, Initialized, ContainersReady and Ready. The current Kubernetes documentation also lists conditions such as `PodReadyToStartContainers`, which the figure omits.
- Ready equals ContainersReady because there are no readiness gates.
- `Initialized` is shown when the container starts. With no init containers it is already satisfied, but the figure does not model its exact timing.
- One press is one probe period, not a timer. Real probes run every `periodSeconds` (default 10). Real probes can also time out, and they use `initialDelaySeconds` and `successThreshold`, which the figure omits. While not Ready, the readiness probe may run more often than `periodSeconds`.
- Liveness and readiness use the default `failureThreshold` of 3. The startup probe uses 6 so the slow-start fixture fits. The default is 3.
- Back-off is simplified. The first restart is immediate, and later restarts wait one period. The 10-second, 20-second, 40-second delays, the 5-minute cap and the 10-minute reset are not modelled.
- Probe kills use exit code 137 (SIGKILL). Real exit codes depend on how the application handles SIGTERM during the termination grace period.
- Endpoint membership changes instantly in the figure. Real propagation through the EndpointSlice controller and the data plane takes time.
- Deadlocked and never-starting apps, and a slow start without a startup probe, fail again after every restart, so restarts repeat and Ready does not return. A real restart often clears a deadlock. The fixture keeps the fault so you can see why Ready stays False after a restart; see the loop in experiment 2.
- Replacement Pods are created by "You" in the figure. In practice a controller creates them from a template.
- A Ready condition with no probes means no probe is configured. It is not evidence that the application serves requests.

## Authoritative sources

- [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/): phases, conditions, container states, restart policy and back-off. Documentation reviewed 2026-10-12.
- [Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/): what each probe does, its defaults and its effect on restarts and endpoints. Documentation reviewed 2026-10-12.
- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/): probe configuration and kubelet behaviour in practice. Documentation reviewed 2026-10-12.
- [Pods, including Pod update and replacement](https://kubernetes.io/docs/concepts/workloads/pods/): which Pod fields can change in place, and how controllers replace Pods. Documentation reviewed 2026-10-12.
