## The big picture

An image should not carry per-environment settings or credentials, or every change becomes a new build. Kubernetes lets a Pod receive settings from a **ConfigMap** (non-confidential data) or a **Secret** (sensitive data) at the moment its container starts or its volume is projected. The image stays the same; the delivery path decides what the process sees.

The question this page answers: after you change stored data, which values does a **running** Pod actually see, when, and why? The answer depends on the delivery path, not on the object alone.

The apparatus above is an original teaching fixture, not a recording of a cluster. Its store holds one ConfigMap drawer and one Secret drawer. The carriage stands for periodic kubelet sync into a mounted rack. The stamp stands for container start, the only moment an environment variable is read. The box is the Pod's container. Each control edits stored data, edits the staged Pod template, runs one cluster action (sync or rollout), or resets the fixture; the change report says which one happened.

## Who owns what

- **You or your pipeline** write the ConfigMap or Secret object and the Deployment's Pod template, usually with `kubectl apply` or GitOps. Writing an object does not change any container that already runs.
- **The Deployment controller** creates ReplicaSets and Pods from the template. A changed template creates new Pods with new names. It does not edit running Pods.
- **kubelet on the node** builds each container's configuration when the container starts. It sets environment variables at that moment, and it projects volume files and refreshes them during periodic sync. It never changes the environment of a running container.
- **The application** decides how often it reads what it was given. An app that reads a mounted file once at startup keeps the old value until it reads again.
- **RBAC and encryption at rest** are separate controls. RBAC decides which subjects may read Secret objects through the API. Encryption at rest is configured on the API server. Neither changes what kubelet delivers to a Pod that is allowed to run.

## How it works

1. **Store.** A ConfigMap keeps data as plain text. A Secret keeps values base64-encoded in `data`. Base64 is an encoding, so anyone who can read the object can decode it. The Secret documentation states that Secrets are stored unencrypted in etcd by default, and that encryption at rest is an additional, opt-in step.
2. **Reference.** The Pod template names an object, a key and a delivery path. `optional` decides what happens when the object or key is missing. Required is the default.
3. **Container start.** For an environment variable (`configMapKeyRef` or `secretKeyRef`), kubelet reads the stored value and fixes it in the container. If a required key is missing, kubelet cannot build the container configuration, so the container does not start. If the reference is optional and the key is missing, the variable is unset and the container starts.
4. **Volume projection.** Each key becomes a file under `mountPath`. Kubernetes refreshes projected files eventually: the total delay can be the kubelet sync period plus the cache propagation delay. Environment variables are never refreshed this way. A container using a ConfigMap or Secret as a **subPath** mount does not receive updates at all.
5. **Rollout.** A template change creates new Pods, and a running Pod keeps the reference it was created with. The fixture uses one replica and the Deployment's default rolling update (25% max unavailable, 25% max surge). With those defaults, the controller brings up the replacement before retiring the old Pod. If the replacement cannot start, the old Pod keeps serving. The fixture simplifies this: it retires the old Pod as soon as the replacement runs, and readiness is not modelled.

Here "blocked" means the kubelet could not start the new container. It does not mean the old Pod has failed.

## YAML example

Default state: a ConfigMap delivered as an environment variable. This is the Deployment template the panel shows for that state. The stored objects appear in the same panel.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: registry.example/app:1.4.2
          env:
            - name: LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: app-settings
                  key: LOG_LEVEL
                  optional: false
```

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-settings
data:
  LOG_LEVEL: info
---
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
data:
  API_TOKEN: dG9rZW4tdjE=
```

Annotations for the fields that matter here:

- `configMapKeyRef` names one key. Nothing else from the ConfigMap enters the container.
- `optional: false` is the default, shown explicitly. A missing `LOG_LEVEL` blocks the container.
- `LOG_LEVEL: info` is plain text. `API_TOKEN` is `token-v1` in base64: an encoding, not protection.

The same Pod template with a mounted file instead of an environment variable. Selecting **Mounted volume** in the figure produces this part of the template:

```yaml
          volumeMounts:
            - name: settings
              mountPath: /etc/app
              readOnly: true
      volumes:
        - name: settings
          configMap:
            name: app-settings
            items:
              - key: LOG_LEVEL
                path: log-level
            optional: false
```

## Try these changes

Each experiment starts from the fixture's first state: press **Reset fixture** first. Button labels show the next value to apply, so they match a fresh fixture. The staged template sits directly under the readout, above the actions and the change report.

1. **Environment values are fixed.** Keep the default ConfigMap and **Environment variable**. Press **Update ConfigMap value to debug**: the report says the stored value changed, and the readout still shows `LOG_LEVEL=info (fixed at start)`. Press **Kubelet sync (mounted files only)**: the report says the environment is unchanged. Press **Roll out template (new Pod)**: the new Pod reads `LOG_LEVEL=debug`.
2. **A mounted file is old until sync.** Press **Reset fixture**. Under **Staged Pod template**, select **Mounted volume**, then press **Roll out template (new Pod)**: the new Pod shows `file log-level=info (updates at sync)`. Press **Update ConfigMap value to debug**: the readout still shows `file log-level=info`, and the report says the mounted file still reads `info` until a kubelet sync. Press **Kubelet sync (mounted files only)**: the file now reads `debug`.
3. **subPath never receives updates.** Press **Reset fixture**. Select **subPath mount**, then press **Roll out template (new Pod)**: the readout shows `subPath copy=info (never updates)`. Press **Update ConfigMap value to debug**, then **Kubelet sync (mounted files only)**: the subPath copy still shows `info`. Only another rollout creates a Pod that reads `debug`.
4. **A missing required key blocks the replacement.** Press **Reset fixture**. Tick **Reference a key the object does not hold (LOG_LVL)** and press **Roll out template (new Pod)**: the report says the replacement did not start, and the readout still shows `LOG_LEVEL=info (fixed at start)`. Untick the box and roll out again to start a correct replacement. With the misspelled key still ticked, also tick **optional: true** and roll out: the replacement starts and the readout shows `LOG_LEVEL unset`.
5. **Secrets are encoded, not hidden.** Press **Reset fixture**. Under **Staged Pod template**, select **Secret app-secrets** and press **Roll out template (new Pod)**: the new Pod reads `API_TOKEN=token-v1 (fixed at start)`, and the Secret card shows the stored value as `dG9rZW4tdjE=`. Press **Update Secret value to token-v2**: the report says the running Pod keeps `token-v1` in its environment until a new Pod is created.

## Misconceptions

- **"Editing the ConfigMap changes my running app."** Correction: environment values are fixed when the container starts. Mounted files change only after kubelet sync, and an app may still hold an old value in memory. A subPath mount never changes.
- **"Base64 makes a Secret safe."** Correction: base64 is reversible encoding. Secrets are stored unencrypted in etcd by default. Protection requires encryption at rest, least-privilege RBAC, and limiting which Pods run in a namespace. Anyone authorised to create a Pod in a namespace can use that access to read Secrets in that namespace.
- **"`optional: true` means the app works without the value."** Correction: it lets the container start without the key. The application must handle the missing setting.
- **"Applying the Deployment updates the Pods it already runs."** Correction: a template change creates new Pods. Running Pods keep the reference they were created with.
- **"Running means ready."** Correction: Running means the container started. Readiness is a separate condition, and this fixture does not model it.

## Safe read-only observation

Against a cluster you are authorised to inspect, these commands only read state:

```sh
kubectl get configmap app-settings -n NAMESPACE -o yaml
kubectl describe pod POD_NAME -n NAMESPACE
kubectl get pod POD_NAME -n NAMESPACE -o jsonpath='{.spec.containers[0].env}{"\n"}{.spec.volumes}{"\n"}'
kubectl get pod POD_NAME -n NAMESPACE -o jsonpath='{.status.containerStatuses[*].state}{"\n"}'
kubectl auth can-i list secrets -n NAMESPACE
```

Replace the placeholders with real names. The first command shows the ConfigMap values in plain text. Describing a Pod shows the references to a Secret or ConfigMap, not the values. The Pod spec shows what the Pod was created with, not what the running process holds. Container states show waiting reasons, which are kubelet-reported strings and not a stable API contract.

**Limit:** `kubectl get secret -o yaml` prints base64 values, so treat its output as sensitive. These are snapshots. Events can expire, and a permissions check reports what the authorization layer allows, not what any workload did.

## Predict and transfer

A Deployment with one replica reads `LOG_LEVEL` through a mounted file, delivered from a ConfigMap, and the pipeline has just updated that ConfigMap. A new kubelet sync runs, and then a second change adds a misspelled key with `optional: false` to the template and rolls it out. Which values does the running Pod see after the sync, and does the new Pod start?

**Prediction:** The running file changes after the sync, because a mounted volume follows the object. The new Pod is not created as a running container: the required key is missing, so kubelet cannot set up the volume. The old Pod keeps serving. If the same reference were a subPath mount, the running copy would not have changed at all, however long you waited.

Continue with [Kubernetes Secrets and security boundaries](/learn/kubernetes-security-access?mode=reference) and [the ConfigMaps and persistent storage unit](/learn/config-secrets-storage?mode=reference). This explanation supports their configuration and workload-security objectives. Exploring the object does not record mastery.

## Assumptions and limits

The fixture has one replica, one container, one key per object, and no readiness probe. The mounted file names are fixture naming: `log-level` for the ConfigMap and `api-token` for the Secret. The carriage's motion and the stamp's press show ordering, not measured timing. Real sync delay depends on the kubelet's configuration and cache strategy.

Not modelled: RBAC decisions, encryption at rest, immutable objects, external secret stores (such as a CSI driver or an operator that creates Secrets), and image pull Secrets. Those are real, and they change where a value comes from, but not the delivery rules shown here. The kubelet's waiting reason strings are typical observed behaviour, not a documented API contract.

The fixture is not a live cluster. It does not run commands, store learner data, or claim verification against a cluster.

## Authoritative sources

Public claim review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/) — non-confidential data, environment and volume delivery, eventual volume updates, and the subPath exception.
- [Kubernetes: Secrets](https://kubernetes.io/docs/concepts/configuration/secret/) — Secret types, base64 `data`, unencrypted default storage in etcd, optional references, and who can read Secrets.
- [Kubernetes: Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — Pod template changes, rolling update defaults, and why old Pods remain until replacements are available.
- [Kubernetes: Encrypting Confidential Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/) — the default identity provider and the opt-in encryption configuration.
