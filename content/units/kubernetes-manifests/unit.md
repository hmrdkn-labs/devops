# Kubernetes manifests and API objects

Kubernetes does not execute YAML. It exposes an API. A manifest is one convenient way to describe an API object that you want stored in that API.

Keep this model in your head:

```text
manifest on disk
    │ kubectl sends a request
    ▼
API server ── validates/admission ──► object stored as cluster state
                                         │
                                         ▼
                                  controllers observe it
                                         │
                                         ▼
                                  real resources change
```

That separation matters because `kubectl apply -f app.yaml` can succeed even when the application later fails. A successful write proves that the API accepted the object. It does not prove that a Pod was scheduled, an image was pulled, a readiness probe passed, or a Service can reach the Pod.

## Read the object before reading the YAML syntax

A typical object has a few recurring fields:

- `apiVersion` selects an API group and version understood by the server.
- `kind` selects the object type, such as `Pod`, `Deployment`, or `Service`.
- `metadata` gives the object identity and organization data such as name, namespace, labels, and annotations.
- `spec` describes desired state for objects that expose a spec.
- `status` is normally written by Kubernetes components to report observed state.

For learning, the important split is **intent versus observation**. You usually write `spec`; controllers and other cluster components update `status`.

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
        - name: web
          image: nginx:1.27
```

Do not memorize this as a block of text. Trace ownership. The Deployment object says it wants three replicas whose Pod template carries `app: web`. The Deployment controller interprets that request and manages lower-level objects that make the desired replica count real.

## Names, UIDs, and identity

An object name identifies one object of a resource kind within its scope. The API also assigns a UID. If you delete `Deployment/web` and create another object with the same name, humans see the same name but Kubernetes sees a different object identity because the UID changed.

This distinction becomes important when you inspect owner references and garbage collection: controllers own specific object instances, not merely strings that happen to reuse the same name.

## YAML is only a serialization format

Kubernetes accepts JSON at the API boundary; YAML is commonly used because it is easier for people to author. Indentation, lists, strings, numbers, and booleans matter because they change the data sent to the API. The API schema then decides whether those fields are valid for the selected resource version.

When a manifest feels confusing, ask four questions instead of staring at indentation:

1. What object am I asking the API to store?
2. Which fields describe desired state?
3. Which controller or component should react to it?
4. What observation would prove that reaction happened?

## Proof ladder

Use evidence in layers:

```text
kubectl apply succeeded
  ↓ proves API write succeeded
kubectl get <object>
  ↓ proves object exists and exposes summary state
kubectl describe <object>
  ↓ reveals conditions, ownership, events, scheduling or rollout clues
kubectl get ... -o yaml
  ↓ exposes detailed live spec/status/metadata
logs / endpoints / application request
  ↓ prove increasingly downstream behavior
```

The core KCNA habit is to avoid jumping from "the YAML looks right" to "the system works." Kubernetes is a set of APIs and control loops. Your job is to connect declared intent to observable state.
