## The big picture

A checkout request slows down, and then one Pod stops receiving Service traffic. The same incident leaves records in five places: Events, container logs, metrics, sampled traces and probe results. None of them is the whole story. Each answers a different question, keeps its record for a different length of time, and was written by a different actor. Good troubleshooting starts by asking, for each claim, which record could prove it and whether that record still exists.

The bench on this page is an **authored fixture**: one Service, three Pods, and one subject Pod (`web-z5r1t`) whose database calls slow down during a failover. Steps are 30 minutes apart, and each step summarises many real probe runs. No button calls a cluster.

## Who owns what

- **Your application** writes logs to stdout and stderr. It exposes metrics and emits traces only if you instrument it. Kubernetes does not know what a slow query means.
- **The kubelet** runs the probes, sets the Pod's `Ready` condition, restarts containers when liveness fails, records Events for probe results and container lifecycle, serves `kubectl logs` from the log files on its node, and reports Pod status such as `restartCount`.
- **The EndpointSlice controller** removes the address of a Pod that is not Ready from the EndpointSlices of its Services. This is what stops traffic.
- **The API server** stores Event objects for a limited time. The `--event-ttl` flag defaults to one hour.
- **metrics-server**, an add-on, serves only the short-term CPU and memory figures behind `kubectl top` and autoscaling. It does not carry request rates or latencies.
- **A monitoring backend** (outside Kubernetes core) scrapes the metric endpoints your application exposes, and often Pod status exported as metrics, then stores the history. Prometheus is one common example. Its role is to scrape, store and query time series; it does not measure latency by itself.
- **A tracing backend and an OpenTelemetry collector** (outside Kubernetes core) receive spans from instrumented code. OpenTelemetry is the instrumentation and export standard: the SDK in your app creates spans, and the collector routes them. Its role is to make one request's path visible across services; it does not trace a request that your code never instruments.

## How it works

### One incident, five records

The fixture follows one Pod through a failover:

- **10:00, baseline.** The Pod serves a request in 38 ms. The Started Event is on the tape, the log holds `listening on :8080`, the backend p99 is 42 ms, and a sampled trace shows a 6 ms database span. The Pod is Ready.
- **10:30, failover begins.** The p99 rises to 1380 ms. A sampled trace has a 1210 ms `db` span, and the log has a WARN line for `orders.select`. The `/ready` handler still answers within 1 s, so the Pod stays Ready and remains in the Service.
- **11:00, readiness fails.** `GET /ready` pings the database and waits past `timeoutSeconds: 1`. After `failureThreshold: 3` failures in a row, the kubelet sets `Ready=False`. The EndpointSlice controller removes the Pod, so Service endpoints fall from 3 to 2 and the Pod receives 0 req/s. An `Unhealthy` Event is recorded. The Started Event from 10:00 is older than one hour and leaves the tape.
- **11:30, recovery.** The ping succeeds and `Ready=True` returns. The endpoint is restored.
- **12:00, retention.** The `Unhealthy` Event from 11:00 leaves the tape. Metrics, logs and traces from 10:00 to 11:30 are still there.

Nothing restarted during this incident. Readiness failures remove a Pod from Services; they do not restart containers.

### What each signal can prove

| Signal | Answers | How long it keeps the record | Cannot prove |
| --- | --- | --- | --- |
| Events | What the kubelet or a controller did to an object | About one hour by default (`--event-ttl`); best-effort | Latency; why a request was slow; that a Service changed endpoints |
| Logs | What the process wrote | The running container's log, plus one terminated instance after a restart; logs go with the Pod's containers if they are evicted | Anything the app did not write; the Service's decisions; earlier instances once they are rotated or gone |
| Metrics | How much and how often, over time | As long as the monitoring backend keeps them. p99 and req/s come from app instrumentation; restart counts come from Pod status | Which call or request was slow. `kubectl top` cannot show p99 or req/s at all |
| Traces | Where one sampled request spent its time, across calls | Only sampled requests, kept by the tracing backend | Requests that were not sampled; requests that never arrived |
| Probes | Whether the kubelet's check passes now and what it did about it | The current result and its last transition only | Latency; what happened before the last transition |

Two rules follow from the table. Absence is evidence only in a signal that keeps complete records for the window you care about. A signal can answer a question only if it was written at the moment the claim is about.

### Probes act; they do not explain

Probe results feed Kubernetes actions. A **readiness** failure marks the container not ready, and the Pod stops receiving traffic from matching Services. A **liveness** failure makes the kubelet restart the container, subject to the Pod's `restartPolicy`. A **startup** probe holds off the other two until it succeeds. Probes return only pass, fail or unknown for their own check. They say nothing about how slow the real requests were or which dependency was slow.

A liveness probe that calls the database turns a database outage into restarts across every replica. The probes documentation warns about this cascade. Keep liveness to the process itself, and let readiness reflect whether the Pod can serve.

### Retention is part of the answer

On the bench, each instrument has its own history:

- The **Events** tape drops entries after one hour, so a 10:00 Event cannot prove anything at 11:00.
- The **log** cassette keeps the lines of the one container instance, because nothing restarted. A real `kubectl logs` without `--previous` shows only the latest log file, so an earlier instance would need `--previous` or a log backend.
- The **metrics** dial keeps every window. A window with no requests has no p99 at all, which is not the same as a fast one.
- The **trace** rack holds sampled cards. A request that never reached the Pod leaves no card.
- The **probe** lamps show the current result and when it last changed. The 11:00 failure is gone from the probe state once Ready returns at 11:30.

Each claim on the bench is judged from what its signal kept at the chosen moment. "Cannot decide here" is a legitimate answer: it means the record is missing, expired, sampled out or only a current value. Every verdict also states what the signal cannot say.

## YAML example

This is the Pod spec the bench's ManifestPanel shows. It is minimal and valid. The fixture's probes are the only fields that change how the Pod behaves in the incident; the other signals are not configured in this spec.

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
        - name: app
          image: registry.example.com/app:v1
          ports:
            - containerPort: 8080
          livenessProbe:
            httpGet:
              path: /livez           # process only; no database call
              port: 8080
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /ready           # pings the database
              port: 8080
            periodSeconds: 5
            timeoutSeconds: 1        # a slower ping counts as a failure
            failureThreshold: 3      # consecutive failures before Ready=False
```

- `livenessProbe` decides restarts. Because `/livez` never calls the database, a slow database cannot restart this container.
- `readinessProbe` decides Service membership. Its `/ready` path pings the database, so a slow database removes the Pod from the Service.
- `timeoutSeconds: 1` is why a 1.2 s ping counts as a failure. Real probes time out per call; the bench summarises several calls as one step.
- `failureThreshold: 3` on the readiness probe is the number of consecutive failures before the kubelet sets `Ready=False`.
- Nothing in this spec enables metrics, traces or log shipping. Those come from the application and the platform around it.

## Try these changes

1. **Slow at 10:30.** Advance to 10:30. Check "Slow at 10:30" with **Traces**: it proves the claim from the 1240 ms sampled trace. Check it with **Metrics**: it proves it from the 1380 ms backend p99. Check it with **Probes**: it is the wrong question, because a probe does not time requests.
2. **Traffic stopped at 11:00.** Advance to 11:00. Check the traffic claim with **Probes**: it proves `Ready=False` since 11:00. Check it with **Events**: it cannot decide, because the Unhealthy Event proves the probe failed, not that the Service changed its endpoints.
3. **The same claim, later.** Advance to 12:00. The Events check now reports the 11:00 Event as expired. The Probes check reports that Ready last changed at 11:30, after the claim's moment, so the earlier state is gone.
4. **No restart, and what that evidence rests on.** Check "Liveness restart" with **Logs**: the fixture keeps one continuous instance log, so it contradicts the claim, and the verdict says that this relies on the fixture keeping the whole log. Check it with **Metrics**: the restart counter stayed at 0. The readiness failure at 11:00 did not restart anything.
5. **Healthy at 10:00, read late.** Check "Healthy at 10:00" with **Logs** and **Traces** at 10:00, then advance to 12:00 and check it with **Events**. The Started Event was the only Event that could show a start, and it has expired.

## Misconceptions

- **"Events are the cluster's audit trail."** They are best-effort, short-lived and may be dropped. The Event API says consumers must not rely on an Event's continued existence.
- **"`kubectl logs` shows everything the container ever wrote."** It reads only the latest log file, which is rotated at 10Mi by default. `--previous` reads the one terminated instance kept after a restart.
- **"`kubectl top` is my latency history."** metrics-server is short-term, in memory, and covers CPU and memory only. It could not answer the 10:30 slow-request claim: p99 and req/s come from application metrics in a backend.
- **"A failing readiness probe restarts the container."** It does not. It removes the Pod from matching Services. Liveness is the probe that restarts.
- **"A trace proves every request was slow."** A trace is one sampled request. The sampling rate decides how many exist.
- **"Kubernetes traces show my checkout request."** The kubernetes.io trace page covers control-plane components such as the kubelet and kube-apiserver. Your checkout spans exist only if your application is instrumented with OpenTelemetry and exported to a backend.
- **"No error line means the app is healthy."** Logs record only what the app chose to write.

## Safe read-only observation

In a cluster you are authorised to inspect, replace `demo`, `web` and `web-z5r1t` with your namespace and Pod:

```sh
kubectl get events -n demo --field-selector involvedObject.name=web-z5r1t
kubectl describe pod web-z5r1t -n demo
kubectl logs web-z5r1t -n demo -c app --since=30m
kubectl logs web-z5r1t -n demo -c app --previous
kubectl top pod -n demo -l app=web
kubectl get endpointslices -n demo -l kubernetes.io/service-name=web -o yaml
```

- `get events` shows what is still on the tape. **Limit:** the list is best-effort and expires; an empty result is not proof that nothing happened.
- `describe pod` shows the Pod's conditions, restart count and recent Events. **Limit:** it shows the current state and recent Events, not a history.
- `logs --since` reads the current container's log. **Limit:** only the latest log file is available, and logs stay on the node.
- `logs --previous` reads the terminated instance kept after a restart. **Limit:** it helps only when a restart happened.
- `top pod` reads CPU and memory from metrics-server. **Limit:** it cannot show the 10:30 latency or request rate; a backend query for p99 and req/s can.
- `get endpointslices` shows which addresses are Ready at this moment. **Limit:** a snapshot, not a history of endpoint changes.

This page does not run these commands and does not claim their output was observed.

## Predict and transfer

Start at 10:00 with the subject Pod healthy. Before each step, predict which signal will record it and whether that record will still exist at the step after.

- At 10:30, which two signals can prove the slow request, and why does the probe state not help?
- At 11:00, why is an Unhealthy Event evidence of a probe failure but not of the Service change?
- At 12:00, why does an empty Events list not prove the readiness failure never happened?

Transfer: a team reports "checkout got slow at 14:10 and some users got errors, but nothing restarted." Which signal would you query first to prove the slowness, which to prove whether a restart happened, and which to show that traffic moved? Which of those records will still exist if you start investigating two hours later, and which must be exported before then?

## Assumptions and limits

The fixture compresses time: a step stands for 30 minutes, and many real probe runs happen inside it. Real readiness failures take a few periods of `periodSeconds` to trip `failureThreshold`, and real Events and metrics arrive continuously. The Event retention window is set to two steps to match the default one-hour `--event-ttl`.

The bench keeps one log instance, one p99 series for the subject Pod, and sampled traces only for requests that touched it. It does not model log shipping, histogram-based metrics, per-dependency latency or sampling rates. The restart counter is shown as a metric exported from Pod status, which is one way to get it; the fixture does not show which exporter is used. The database failover is an illustrative cause; the fixture does not claim the real cause of any incident.

Provenance: the p99 and request rate are application metrics a backend scrapes, the restart count is Pod status, and the trace cards are app spans. The kubernetes.io pages cited below describe the Kubernetes parts: probes, logs, Events, metrics-server, and tracing for control-plane components over OTLP. They do not describe your application's spans, and they do not describe Prometheus or OpenTelemetry in depth. Those tools are outside Kubernetes core, so this page does not claim Kubernetes ships them.

## Authoritative sources

This page supports the course objectives [Signals](/learn/cloud-native-observability-signals?mode=reference) (`fpp:cloud-native-observability-signals/signals`) and [Tools](/learn/cloud-native-observability-signals?mode=reference) (`fpp:cloud-native-observability-signals/tools`). Exploring this fixture does not record evidence for those objectives.

Public documentation review, 2026-10-12. This is a documentation review, not a live-cluster observation. Original explanation and apparatus; no course assets or copied proprietary questions.

- [Kubernetes: Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [Kubernetes: Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
- [Kubernetes: Event (events.k8s.io/v1)](https://kubernetes.io/docs/reference/kubernetes-api/events/event-v1/)
- [Kubernetes: kube-apiserver reference (`--event-ttl`)](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-apiserver/)
- [Kubernetes: Resource metrics pipeline (metrics-server, CPU and memory)](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)
- [Kubernetes: Tools for Monitoring Resources (full pipeline, OpenMetrics)](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-usage-monitoring/)
- [Kubernetes: Traces for Kubernetes system components (control plane over OTLP, not application spans)](https://kubernetes.io/docs/concepts/cluster-administration/system-traces/)
