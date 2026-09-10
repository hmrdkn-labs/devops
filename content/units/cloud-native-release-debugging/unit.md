# Release strategies and application debugging

A release strategy answers two questions: **how much new code exists at once, and how much traffic is exposed to it?**

## Rolling update

Kubernetes Deployments natively support rolling updates. A new ReplicaSet grows while the old one shrinks according to rollout settings. Old and new replicas can coexist temporarily.

Rolling updates are efficient when versions can safely overlap and ordinary readiness checks are enough to decide whether a replica should receive traffic.

## Blue-green

Blue-green keeps two complete environments or versions and switches traffic from the current set to the new set after validation. It can make traffic cutover and rollback simple, but it costs extra capacity and still requires data compatibility.

Kubernetes does not have a single built-in `strategy: BlueGreen` on ordinary Deployments. Teams implement the pattern with Services, ingress/gateway routing, progressive-delivery controllers, or deployment platforms.

## Canary

Canary delivery exposes a small portion of traffic or users to a new version, observes defined signals, then expands or aborts. The key idea is **controlled exposure with measurement**, not merely "run one new Pod."

Traffic weighting may live in an ingress controller, service mesh, cloud load balancer, or progressive-delivery tool. Always identify the actual traffic executor.

## Debug a release as a chain

When a release fails, walk forward from intent:

```text
artifact exists
  -> desired manifest references correct artifact
  -> API accepts object
  -> controller creates rollout objects
  -> Pods schedule
  -> image pulls
  -> containers start
  -> readiness becomes true
  -> EndpointSlices include replicas
  -> traffic reaches the new version
  -> user-visible behavior succeeds
```

Each step has different evidence:

- image digest or registry metadata for the artifact;
- `kubectl rollout status` and ReplicaSets for rollout progress;
- Pod events for scheduling/image/start failures;
- `kubectl logs --previous` for a crashing previous container instance;
- readiness conditions and EndpointSlices for traffic eligibility;
- an actual request for end-to-end proof.

## Readiness protects traffic; liveness restarts processes

A readiness failure can remove a Pod from Service endpoints without restarting the container. A liveness failure tells the kubelet to restart the container. Using liveness for a dependency outage can turn an external failure into a restart storm.

## Roll back only after naming the failure boundary

Rollback can be the safest mitigation, but it is not a substitute for diagnosis. Record the failing revision and the smallest evidence first. If the failure is a shared database outage or invalid Secret, rolling back application Pods may not fix the incident.

The durable skill is to localize the first broken boundary before choosing the mitigation.
