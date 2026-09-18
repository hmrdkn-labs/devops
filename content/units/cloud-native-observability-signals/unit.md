# Metrics, logs, traces, events, and observability

Observability is the ability to infer what a system is doing from the evidence it exposes. No single signal answers every question.

## Metrics answer "how much" and "how often"

Metrics are numeric measurements over time: request rate, error count, CPU usage, queue depth, latency histogram, or available replicas. They are compact and excellent for trends, dashboards, and alert conditions.

Prometheus commonly discovers or is configured with targets, scrapes metrics, stores labeled time series, and evaluates queries and recording/alerting rules. Alertmanager handles notification routing for alerts produced by Prometheus rules.

A healthy Prometheus target proves that a metrics endpoint was scraped successfully. It does not prove every user transaction is healthy.

## SLI, SLO, and SLA start with the user outcome

A **service-level indicator (SLI)** is a defined measurement of service behavior,
such as successful checkout requests divided by eligible checkout requests.
A **service-level objective (SLO)** is a target for an SLI over a stated window.
An **SLA** is an agreement that may attach consequences to not meeting service
commitments. A graph is not an SLO until the measurement, target, and window are
explicit; an internal target is not automatically a customer contract.

For an authored example, “99.9% successful eligible checkouts over 30 days” is
an availability SLO. Its error budget permits 0.1% unsuccessful eligible requests
over that window. A latency objective needs its own definition, such as a
specified proportion finishing below a threshold. Decide how retries, malformed
requests, maintenance, and low traffic affect the measurement before using it
for release or incident decisions.

## Prometheus: collection, storage, rules, and notification

```text
application / exporter exposes metrics over HTTP
  -> Prometheus discovers target and periodically scrapes it
  -> local time-series storage -> PromQL / recording and alert rules
  -> firing alerts -> Alertmanager groups/routes notifications
  -> dashboard queries display measurements
```

An **exporter** translates another system's measurements into a scrapeable
format. Node Exporter exposes host operating-system metrics, not all application
business metrics. Instrument an application's checkout outcomes separately.
Prometheus normally pulls target metrics; the presence of exporters does not
turn every target into a metrics-pushing agent. Specialized mechanisms such as
Pushgateway exist for particular use cases, not as a replacement for all scrapes.

The following is an independently authored configuration example. It describes
collection intent only; no collector is started by reading it.

```yaml
global:
  scrape_interval: 30s
scrape_configs:
  - job_name: example-api
    metrics_path: /metrics
    static_configs:
      - targets: ['example-api:9100']
```

The target must resolve and expose the endpoint to Prometheus. A production
deployment additionally needs authentication/TLS where appropriate, sensible
retention, storage sizing, and version-compatible configuration. Inspect target
status and a known series before trusting a dashboard. `up=1` means a successful
scrape for that target, not a successful checkout.

### Metrics types and labels

| Type | Example | Interpretation |
| --- | --- | --- |
| Counter | Total HTTP requests | Accumulates and can reset on restart; use a rate over time for throughput |
| Gauge | Current queue length | Can increase or decrease |
| Histogram | Request durations in buckets | Supports aggregated distribution/quantile estimates with suitable queries |
| Summary | Instrumented duration quantiles | Client-calculated quantiles have different aggregation behavior from histogram buckets |

Labels distinguish series, for example `method="GET"` and `status="200"`.
Unbounded labels such as every user ID or request ID create many time series,
increasing cost and memory pressure. Put individual request correlation in traces
or logs instead of making one metric series per request.

## Monitoring Kubernetes requires several perspectives

Node Exporter measures hosts. Kubelet/container metrics can describe workload
resource consumption. kube-state-metrics exposes measurements derived from API
object state, such as declared and available replicas; it does not replace a
per-process CPU measurement. An application exporter or instrumentation provides
business behavior. Kubernetes service discovery helps Prometheus find suitable
targets as Pods change; relabeling selects targets and labels.

Metrics Server supplies resource metrics commonly used by `kubectl top` and
resource-based autoscaling. It is not a durable Prometheus replacement or a full
historical monitoring system. A DaemonSet is often appropriate for a host exporter,
while an application endpoint can travel with its Deployment.

## Cost monitoring is also a feedback loop

Compare requested resources, observed usage, idle node capacity, storage, and
network charges; allocate costs to meaningful owners or workloads. Low average
CPU does not by itself justify reducing memory, eliminating redundancy, or
removing a peak-demand margin. Define the SLO first, then right-size and test
whether the service still meets it. Telemetry itself has a cost: retention,
scrape frequency, and label cardinality all matter.

## Logs explain discrete events from one component

Logs contain timestamped records emitted by applications and infrastructure. They are useful for exceptions, startup configuration, request context, and state transitions.

Logs can be missing, sampled, malformed, or too local. A log line saying "request sent" does not prove the downstream service processed it.

## Traces connect work across boundaries

A distributed trace follows one request or operation across participating services. A trace is made of spans representing units of work and their relationships. It is especially useful for answering where latency or errors appear in a multi-service path.

Trace context must propagate between components for the causal path to remain connected.

## Kubernetes events are control-plane clues

Events often explain scheduling failures, image-pull problems, probe failures, mount problems, and other transitions. They are valuable but temporary and are not a durable application log.

## OpenTelemetry is instrumentation and telemetry plumbing

OpenTelemetry provides vendor-neutral APIs, SDKs, semantic conventions, and a Collector for generating, processing, and exporting telemetry. It can handle traces, metrics, and logs. It is not a storage/query backend by itself.

```text
application/infrastructure
  -> instrumentation / telemetry signals
  -> OpenTelemetry Collector or direct exporter
  -> backend such as Prometheus-compatible metrics, trace store, or log store
  -> dashboards / alerts / investigation
```

## Start incidents from the user boundary

If users report slowness:

1. Define the exact transaction and time window.
2. Check a user-visible or synthetic request to confirm the symptom.
3. Use metrics to find where rate/error/latency changed.
4. Use traces to localize slow spans across services.
5. Use logs and Kubernetes events to explain the local cause.

Evidence becomes stronger when independent signals agree. A dashboard is a view of measurements, not the system itself.

## Worked case: telemetry transport is another system

~~~text
14:00–14:05 checkout p95: 120ms → 2s
trace t42: checkout 2s; inventory call span 1.8s
log trace_id=t42: inventory request timed out
Prometheus target up=1; Collector exports succeeded
~~~

This authored fixture localizes t42's delay without proving inventory's underlying
cause. Examine inventory-side traces/logs and compare other sampled requests;
network delay, saturation and a downstream dependency remain possible explanations.
The Collector receives/processes/exports telemetry, while the application handles
checkout. An export acknowledgment is evidence about that transport boundary.

Recovery evidence should include the same checkout transaction and a useful time
window of latency/error measurements. One successful transaction cannot by itself
establish restored p95 for the population. Avoid printing private transaction
payloads or putting high-cardinality request IDs into every metric label.
