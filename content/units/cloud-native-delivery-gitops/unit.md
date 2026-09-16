# CI, CD, declarative delivery, and GitOps

Application delivery has at least two different products: a **versioned artifact** and a **desired deployment state**.

## CI builds evidence and artifacts

Continuous Integration (CI) integrates code changes frequently and runs automated checks. A typical CI pipeline may compile, test, scan, and build a container image. The durable output should be an immutable, identifiable artifact such as an image digest.

CI answering "the image was built successfully" does not prove that production is running that image.

## CD changes an environment

Continuous Delivery keeps a releasable change ready for controlled promotion. Continuous Deployment automatically promotes qualifying changes to an environment. Teams use the terms differently, so focus on the boundary: delivery/deployment changes declared environment state after CI has produced an artifact.

For Kubernetes, a release often changes a Deployment image reference or another manifest value. Kubernetes controllers then perform the rollout. The delivery system does not directly become the kubelet or Service dataplane.

```text
source change
  -> CI checks
  -> immutable image/artifact
  -> desired deployment change
  -> delivery/GitOps reconciliation
  -> Kubernetes API state
  -> controllers roll out Pods
  -> runtime and traffic proof
```

## GitOps adds a reconciliation contract

The OpenGitOps principles describe a system whose desired state is declarative, versioned and immutable, pulled automatically, and continuously reconciled.

That changes the operating model. Instead of a human laptop being the only source of deployment truth, a reconciler compares version-controlled desired state with the target system and works to converge it.

Git remains a record of intended state; the GitOps controller is the translator/reconciler. Kubernetes controllers still own Kubernetes workload reconciliation beneath it.

## Drift and rollback

If someone manually edits a live object, a GitOps reconciler may detect that drift and restore the declared state. That behavior is valuable only when Git truly is the intended source of truth and emergency procedures are designed around reconciliation.

A Git revert or new corrective commit changes desired state. It does not time-travel external databases, undo every side effect, or guarantee the previous application version is safe with current data. Delivery rollback and data rollback are separate concerns.

## What to prove after delivery

Do not stop at a green pipeline. Verify:

1. the intended artifact digest exists;
2. desired deployment state references it;
3. reconciliation reports healthy/synchronized state;
4. the Kubernetes rollout reaches ready replicas;
5. a user-visible or service-level check succeeds.

This produces a causal chain from source to running behavior instead of equating "pipeline passed" with "release succeeded."

## Worked case: synchronized to which revision?

~~~text
CI artifact: D2
production Git R10: Deployment image D1
reconciler applied revision: R10, synchronized
runtime image ID: D1; GET /version: D1
~~~

The authored evidence is internally consistent: production has not been promoted
to D2. The GitOps agent pulls and reconciles desired state; Kubernetes controllers
roll out the declared template; node agents execute the artifact. A healthy
reconciler status without its revision identity is incomplete release evidence.

After a reviewed R11 declares D2, check that R11 was applied, Pods resolve the
intended artifact, and the version request succeeds. If D2 performed a database
migration, reverting R11 may restore D1 Pods while leaving migrated data intact.
Compatibility and data recovery need a separate decision.
