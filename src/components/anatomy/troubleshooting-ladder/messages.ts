import type { ScenarioId } from './model';

/** What one read lets you conclude (why), and what it still leaves unproven or unchanged (not yet). Both are statements, never questions. */
export interface RungNote { why: string; notYet: string }

/** Who wrote the fact a rung shows. Used in the actor line of every read. */
export const WRITERS: readonly string[] = [
  'The kubelet and scheduler (the status summary)',
  'The kube-scheduler (spec.nodeName)',
  'Each component named in the event: scheduler, kubelet or endpoints controller',
  'The kubelet (containerStatuses)',
  'The application (its own output, kept by the kubelet)',
  'The EndpointSlice controller',
];

/** Broken, settled facts of each authored fault: one note per rung, in ladder order. */
export const NOTES: Record<ScenarioId, readonly RungNote[]> = {
  'pending-cpu': [
    { why: 'STATUS is Pending with READY 0/1 and no restarts, so the Pod never reached a container: the problem is before the kubelet.', notYet: 'The reason is not on this rung. Nothing has changed; the request is still 2 CPU.' },
    { why: 'NODE is empty, so the scheduler owns the next step and the kubelet has nothing to run yet.', notYet: 'The scheduler’s reason is not on this rung. The Pod is still unassigned.' },
    { why: 'The scheduler reports Insufficient cpu on all three nodes, so the fault is the 2-CPU request, not an image or a volume.', notYet: 'Apply fix is unlocked. The template still requests 2 CPU, so every retry stays unassigned.' },
    { why: 'No container exists, so this rung cannot localize the fault; it only confirms that nothing has started.', notYet: 'Free CPU on each node is not shown here; the scheduler event is the only evidence of it.' },
    { why: 'No container has run, so there are no logs; reading them rules out the application as the cause.', notYet: 'The application is untested because it never started. Nothing about the request has changed.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; this rung shows the Service is not the cause.', notYet: 'The Service is only confirmed as a bystander. No Service object changed.' },
  ],
  'pending-pvc': [
    { why: 'STATUS is Pending with no node and no restarts: the Pod waits on the scheduler, not on a container.', notYet: 'Whether the wait is capacity, a taint or a claim is not on this rung. Nothing has changed.' },
    { why: 'NODE is empty, so the scheduler still owns the Pod and no volume can have been mounted yet.', notYet: 'The claim name is not on this rung; the scheduler event names it.' },
    { why: 'The scheduler reports unbound immediate PersistentVolumeClaims, so the fault is claim orders-api-data, not CPU or the image.', notYet: 'Apply fix is unlocked. The claim stays unbound until a matching volume exists, so the Pod stays unassigned.' },
    { why: 'No container exists because the Pod has no node; the container rung cannot name the claim.', notYet: 'The claim’s binding state is not on this rung; only the scheduler event names it.' },
    { why: 'No container has run, so there is no application output; this rung rules out the app as the cause.', notYet: 'The application is untested because it cannot start until the claim is bound.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service is not the fault.', notYet: 'No Service or claim has changed; this read only confirms the Service is a bystander.' },
  ],
  'pending-volume': [
    { why: 'STATUS is ContainerCreating with NODE set: the scheduler is done and the kubelet is starting the container.', notYet: 'The kubelet’s reason is not on this rung; the container has not started.' },
    { why: 'NODE is node-1, so the kubelet on node-1 owns the next step and the scheduler is finished.', notYet: 'The mount failure is not on this rung; it is in the kubelet’s event.' },
    { why: 'The kubelet reports configmap orders-api-conf not found for the conf volume, so the fault is a missing ConfigMap, not the image or CPU.', notYet: 'Apply fix is unlocked. The kubelet has not retried the mount, so the container is still not created.' },
    { why: 'The container is waiting with reason ContainerCreating and no exit code: it has never run, so the fault is before start.', notYet: 'The container rung does not name the missing object; the events do.' },
    { why: 'No container output exists because the volume mount failed before the container was created.', notYet: 'The application is untested; logs cannot show a volume that was never mounted.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service is not implicated.', notYet: 'Nothing about the Service has changed.' },
  ],
  'pull-tag': [
    { why: 'STATUS is ImagePullBackOff with NODE set: the scheduler is done, and the kubelet is failing to pull the image.', notYet: 'The reason for the failure is not on this rung; the container has never started.' },
    { why: 'NODE is node-1, so the kubelet on node-1 owns the pull. The scheduler is not the cause.', notYet: 'The image reference is not on this rung; the event names it.' },
    { why: 'The kubelet reports manifest unknown for tag 1.4.3, so the tag in the spec does not exist in the registry.', notYet: 'Apply fix is unlocked. The spec still names 1.4.3, so every pull retry gets the same answer.' },
    { why: 'The container is waiting with reason ImagePullBackOff and no lastState: it never ran, so there is no exit code to read.', notYet: 'The container rung does not say which tag failed; the event does.' },
    { why: 'No container output exists because the image was never pulled.', notYet: 'The application is untested; it cannot start until an image is pulled.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service has no part in the pull failure.', notYet: 'The Service is not checked beyond this read; nothing has changed.' },
  ],
  'pull-auth': [
    { why: 'STATUS is ImagePullBackOff with NODE set: the kubelet is failing to pull, and the container has never started.', notYet: 'The registry’s refusal is not on this rung; nothing has changed.' },
    { why: 'NODE is node-1, so the kubelet owns the pull; a registry refusal is not a scheduler problem.', notYet: 'Credentials are not on this rung; the event and the spec’s imagePullSecrets are.' },
    { why: 'The kubelet reports unauthorized: authentication required for the 1.4.2 image, so the registry refuses an anonymous pull and the Pod names no pull secret.', notYet: 'Apply fix is unlocked. The Secret it names must exist; the fixture assumes it does.' },
    { why: 'The container is waiting with reason ImagePullBackOff and no exit code: it never ran, so the fault is in the pull.', notYet: 'The container rung does not say why the pull was refused; the event does.' },
    { why: 'No container output exists because the pull never completed.', notYet: 'The application is untested; it cannot start without its image.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; this rung does not implicate the Service.', notYet: 'No Service or Pod object has changed.' },
  ],
  'crash-exit': [
    { why: 'STATUS is CrashLoopBackOff with phase Running and RESTARTS 3: the container starts and exits repeatedly, so scheduling and pulling are past.', notYet: 'The exit reason is not on this rung; the container and log rungs hold it.' },
    { why: 'NODE is node-2, so the kubelet on node-2 restarts the container; the scheduler is not the cause.', notYet: 'The reason for the exit is not on this rung.' },
    { why: 'The event says only Back-off restarting failed container app: it shows a restart loop, not its cause.', notYet: 'This read does not unlock a fix: no event names the cause. The exit code and logs are still unread.' },
    { why: 'lastState is Error with exit code 1: the process exited with an application error, not a kill by the kernel.', notYet: 'The exit code does not say which setting is missing; the previous logs do.' },
    { why: 'The previous run’s last line is FATAL: DATABASE_URL is not set, so the app reads a variable the spec does not provide.', notYet: 'Apply fix is unlocked. The spec still sets DB_URL, so the next run exits 1 again and RESTARTS keeps counting.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service is not the cause.', notYet: 'No Service or Pod object has changed.' },
  ],
  'crash-oom': [
    { why: 'STATUS is CrashLoopBackOff with RESTARTS 3: the container starts and stops repeatedly, so the question is why it stops.', notYet: 'The stop reason is on the Container rung, not this one.' },
    { why: 'NODE is node-2, so the kubelet restarts the container; the scheduler is not involved.', notYet: 'Nothing on this rung shows the memory limit.' },
    { why: 'The events show only BackOff restarting the container; they do not name memory.', notYet: 'This read does not unlock a fix: the container’s termination reason is still unread.' },
    { why: 'lastState is Terminated with reason OOMKilled and exit code 137: the kernel killed the process for exceeding its memory limit, so the fault is the container limit, not the app logic.', notYet: 'Apply fix is unlocked. The limit is still 64Mi, so the next run is killed again and RESTARTS keeps rising.' },
    { why: 'The previous run stops mid-load with no error line: the process was killed, not stopped by an error the app reported.', notYet: 'The logs confirm a kill but cannot name the limit; the Container rung did that.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service is not the cause.', notYet: 'No Service or Pod object has changed.' },
  ],
  'crash-liveness': [
    { why: 'STATUS is CrashLoopBackOff with phase Running and RESTARTS 2: the container restarts after it starts, so a probe or the process is failing.', notYet: 'Which probe is failing is not on this rung; the events name it.' },
    { why: 'NODE is node-1, so the kubelet restarts the container; the scheduler is not involved.', notYet: 'The probe is not on this rung.' },
    { why: 'Liveness fails with connection refused on /livez and the kubelet restarts the container: liveness is the owner that restarts it, and the app was not listening yet.', notYet: 'Apply fix is unlocked. The spec has no startupProbe, so liveness keeps firing during the slow start.' },
    { why: 'lastState is Error with exit code 143: the kubelet stopped the process with SIGTERM after the probe failed, so the exit is a consequence, not the cause.', notYet: 'The exit code depends on the app’s SIGTERM handling; the probe event is the evidence.' },
    { why: 'The previous run ends at warming catalog cache with no error line: the app was still starting when liveness killed it.', notYet: 'The logs show a slow start, not a bug; they do not name the probe.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service is not the cause.', notYet: 'No Service or Pod object has changed.' },
  ],
  'notready-probe': [
    { why: 'STATUS is Running with READY 0/1 and RESTARTS 0: the container runs, so the fault is readiness, not start or liveness.', notYet: 'Why it is not Ready is on the Events rung. Nothing has changed.' },
    { why: 'NODE is node-1: the kubelet runs the container and its readiness probe, and the scheduler is finished.', notYet: 'The probe path is not on this rung.' },
    { why: 'The readiness probe fails with HTTP 404, so the probe path is wrong for this app; the app is not down.', notYet: 'Apply fix is unlocked. The spec still probes /ready, so the Pod stays not Ready and out of endpoints.' },
    { why: 'The container is Running with no lastState: it never exited, so readiness is not restarting it and RESTARTS stays 0 by design.', notYet: 'This rung does not show which probe failed; the events do.' },
    { why: 'The current run logs GET /ready 404: the probe reaches the app, and the app has no /ready route.', notYet: 'The logs confirm the path; they do not change the spec.' },
    { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing; the Service is not the cause.', notYet: 'No Service or Pod object has changed.' },
  ],
  'no-endpoints': [
    { why: 'STATUS is Running with READY 1/1: the Pod is healthy by its own probes, so the fault is not inside the Pod.', notYet: 'The Service is not checked on this rung; the Endpoints rung does that.' },
    { why: 'NODE is node-2: the Pod is placed and running, so the scheduler and the kubelet are not the cause.', notYet: 'The Service selector is not on this rung.' },
    { why: 'No Warning events exist for this Pod, so no Pod-level owner reports a fault.', notYet: 'Absence of events does not unlock a fix; the Endpoints rung localizes this fault.' },
    { why: 'The container is Running with no lastState: it has not restarted, so this is not a crash.', notYet: 'This rung does not check the Service.' },
    { why: 'The app logs GET /readyz 200: it answers its readiness route, so the app is serving.', notYet: 'The logs cannot show the Service selector.' },
    { why: 'The EndpointSlice lists 0 endpoints for a Ready Pod, and the Service selects app=orders while the Pod is labelled app=orders-api: the selector is the fault.', notYet: 'Apply fix is unlocked. Only the Service changes; the endpoint follows when the EndpointSlice controller runs.' },
  ],
};

/** Reads of a settled object after its fix: the healthy state, which no longer localizes a fault. */
export const HEALTHY: readonly RungNote[] = [
  { why: 'STATUS is Running with READY 1/1 and no restarts: the Pod is healthy by its own probes after the fix.', notYet: 'This confirms the healthy state only; it does not prove the application returns correct responses.' },
  { why: 'NODE is set, so the scheduler has placed the Pod and the kubelet owns its containers.', notYet: 'Placement is confirmed, not spare capacity; that changes as other Pods come and go.' },
  { why: 'The events are Normal messages with no Warning, so no owner reports a fault on this object.', notYet: 'Events expire, so this is a recent record, not a history.' },
  { why: 'The container is Running with no lastState: it has not restarted since it started.', notYet: 'One healthy start is not proof of stability over time.' },
  { why: 'The current logs show the app starting and listening, with no error line.', notYet: 'Logs show what the app printed, not whether its responses are correct.' },
  { why: 'The EndpointSlice lists the Pod, so the Service routes to a Ready Pod.', notYet: 'Endpoints are routing targets; they do not show whether traffic succeeds end to end.' },
];

/** A replacement Pod that no owner has acted on yet. */
export const FRESH: readonly RungNote[] = [
  { why: 'STATUS is Pending with READY 0/1 and no restarts: this new object has not been placed or started.', notYet: 'No owner has acted on this object yet. Reconcile once to let the scheduler act.' },
  { why: 'NODE is empty: the scheduler has not placed this new object.', notYet: 'Nothing about the node is known until the scheduler has run.' },
  { why: 'No events exist yet for this new object, so no owner has written a result.', notYet: 'Events appear only after an owner acts; reconcile once to create them.' },
  { why: 'No container exists yet, so the container rung can show nothing about this object.', notYet: 'The kubelet has not run, so nothing has started.' },
  { why: 'No container output exists because no container has started.', notYet: 'Logs appear only after a container runs.' },
  { why: 'The Pod is not Ready, so the EndpointSlice correctly lists nothing for it yet.', notYet: 'The Service cannot route to this Pod until it is placed, started and Ready.' },
];

/** An outside object is fixed but its owner has not run: the Pod still shows the old state. */
export const STALE: readonly RungNote[] = [
  { why: 'STATUS still shows the old state: the outside fix is applied, but the owners of this Pod have not run.', notYet: 'Nothing on the Pod has changed. Reconcile once to let its owner act.' },
  { why: 'NODE still shows the old placement; the outside change has not reached the scheduler or the kubelet.', notYet: 'Reconcile once to let the owner act on the change.' },
  { why: 'The events are the old owner messages; they change only after the owner acts on the change.', notYet: 'Reconcile once to let the owner act.' },
  { why: 'The container still shows its old state, because its owner has not run since the fix.', notYet: 'Reconcile once to let the kubelet act.' },
  { why: 'The logs come from the old run; they change only after the owner has acted.', notYet: 'Reconcile once to let the owner act.' },
  { why: 'The endpoints still reflect the old Service selector, because the EndpointSlice controller has not run yet.', notYet: 'The Service object already has the fix; the endpoint follows when the controller runs.' },
];
