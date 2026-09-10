# kubectl apply and live state

`kubectl apply` is a declarative object-management workflow. You provide configuration describing fields you want, kubectl sends an API request, and Kubernetes stores the resulting live object. Controllers then react to that live desired state.

The key is to separate three things that are easy to mentally collapse:

```text
local file              live API object             runtime reality
-----------             ---------------             ---------------
what you intend   ───►  what cluster stores   ───►  what controllers/nodes made real
app.yaml                spec + metadata + status    Pods, IPs, mounts, processes, traffic
```

These can diverge for legitimate reasons. The API adds defaults and metadata. Controllers update status. Other actors may update fields. The runtime can fail to converge even while the desired object is valid.

## Imperative and declarative are control styles

An imperative command describes an action: create this object, scale this Deployment, delete that Pod. A declarative workflow describes a target configuration and repeatedly applies it.

Neither word automatically means good or bad. The important difference is what becomes the durable source of intent.

For reproducible application delivery, versioned declarative configuration is useful because you can review the intended state, diff changes, and reapply it. For exploration or one-off inspection, imperative commands can be efficient.

## Apply is field-aware update behavior

Apply is not equivalent to blindly replacing the entire object with the contents of your file. Kubernetes object-management mechanisms track field ownership/management so multiple actors can update different parts of an object. Modern Kubernetes also provides Server-Side Apply, where the API server manages this field ownership explicitly.

For KCNA understanding, keep the higher-level model:

- your configuration declares fields you intend to manage;
- the API merges/validates that intent into the live object according to apply semantics;
- other Kubernetes components can own or update other fields, especially status;
- conflicts can happen when actors try to manage the same field incompatibly.

## "configured" is an API result, not an availability result

Suppose this succeeds:

```text
deployment.apps/web configured
```

That tells you the apply operation completed for the Deployment object. It does not tell you:

- the new ReplicaSet reached desired replicas;
- Pods scheduled;
- images pulled;
- containers stayed running;
- readiness passed;
- Service endpoints selected the Pods;
- external traffic reached the Service.

Use the ownership/request path to choose the next proof rather than rerunning `apply` and hoping.

## Drift can exist at several layers

"Drift" is not one thing:

1. **File versus live object:** someone changed the API object after your file was written.
2. **Desired versus observed state:** the live spec asks for three replicas but status shows only two available.
3. **Kubernetes versus application behavior:** Kubernetes sees Ready Pods, but a downstream dependency or business check still fails.

Each drift needs different evidence.

## Read before changing

When an apply did not produce the expected result:

1. Read the live object.
2. Compare the fields you intended to change.
3. Inspect conditions and events.
4. Follow owner references into controllers and Pods.
5. Continue into Services/networking/application probes if necessary.

The durable skill is not command recall. It is knowing where declared intent lives, which control loop consumes it, and what observation proves the next state transition.
