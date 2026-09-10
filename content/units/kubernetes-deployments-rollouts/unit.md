# Deployments, rollouts, and rollbacks

A Deployment is a higher-level controller for replaceable application replicas. It does not directly keep a fixed number of Pods alive. Instead, it manages ReplicaSets, and the active ReplicaSet manages Pods.

```text
Deployment/web
   │ desired Pod template + rollout strategy
   ▼
ReplicaSet/web-abc123
   │ desired replica count
   ▼
Pods
```

This ownership chain explains most Deployment behavior.

## Why an image change creates a new ReplicaSet

The Pod template is the recipe for new Pods. When a field inside `.spec.template` changes, such as the container image, the Deployment now wants a different Pod template than the one represented by the current ReplicaSet.

Rather than mutating existing Pods in place, the Deployment creates a new ReplicaSet for the new template and shifts replicas between old and new ReplicaSets according to the rollout strategy.

```text
before
Deployment → RS-v1 → Pod v1, Pod v1, Pod v1

after image change
Deployment ─┬→ RS-v1 → old Pods gradually reduced
            └→ RS-v2 → new Pods gradually increased
```

This replacement model gives Kubernetes a history of rollout revisions and a controlled way to move from one template to another.

## RollingUpdate is controlled overlap

For the common `RollingUpdate` strategy, `maxUnavailable` limits how many desired replicas may be unavailable during the update, while `maxSurge` limits how many extra replicas may exist above the desired count.

You do not need to memorize every rounding rule to understand the control intent. Ask:

- How much temporary capacity may be added?
- How much availability may be lost at once?
- Are new Pods becoming Ready quickly enough for the rollout to advance?

If new Pods never become Ready, the Deployment can stop making useful progress even though the new ReplicaSet and Pods were created successfully.

## Rollout status is not end-to-end application proof

`kubectl rollout status deployment/web` is valuable because it follows Deployment rollout conditions. A successful rollout tells you that the Deployment reached its rollout criteria. It does not automatically prove external DNS, Ingress routing, Service selectors, downstream dependencies, or business behavior.

Keep the proof ladder:

```text
Deployment accepted
  ↓
new ReplicaSet created
  ↓
new Pods created and Ready
  ↓
rollout completes
  ↓
Service endpoints include healthy Pods
  ↓
real request succeeds
```

## Rollback changes desired template history

A rollback asks the Deployment to return to a previous revision's Pod template. The controller then performs another reconciliation toward that earlier template. Rollback is not a time machine for application data, external databases, migrations, or side effects.

That is why production rollback safety depends on more than Kubernetes. A technically valid Deployment rollback can still be unsafe if the application made incompatible schema changes or external side effects.

## Scale and rollout are different dimensions

Changing `.spec.replicas` changes desired capacity. Changing `.spec.template` changes the desired Pod template and triggers a rollout. This difference is useful when reading diffs:

- replica count change → same template, different count;
- template change → new ReplicaSet/revision;
- metadata outside the Pod template may update the Deployment without creating a new ReplicaSet.

## Observable proof

For one rollout, inspect:

1. Deployment generation and conditions.
2. Old and new ReplicaSets plus their desired/current counts.
3. Pod labels and owner references showing which ReplicaSet owns each Pod.
4. Pod readiness and events.
5. Service endpoints and an application request if availability matters.

The KCNA-level understanding is not "run `kubectl rollout undo`." It is: **the Deployment changes desired Pod-template history, creates/manages ReplicaSets, and the cluster converges by replacing Pods rather than editing them in place.**
