# Metrics, logs, traces, events, and observability

Observability is the ability to infer what a system is doing from the evidence it exposes. No single signal answers every question.

## Metrics answer "how much" and "how often"

Metrics are numeric measurements over time: request rate, error count, CPU usage, queue depth, latency histogram, or available replicas. They are compact and excellent for trends, dashboards, and alert conditions.

Prometheus commonly discovers or is configured with targets, scrapes metrics, stores labeled time series, and evaluates queries and recording/alerting rules. Alertmanager handles notification routing for alerts produced by Prometheus rules.

A healthy Prometheus target proves that a metrics endpoint was scraped successfully. It does not prove every user transaction is healthy.

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
