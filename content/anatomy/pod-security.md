## The big picture

A container's power on a node comes from fields in its Pod spec: the UID it runs as, whether it may gain privileges, which Linux capabilities it keeps, which syscalls its seccomp profile allows, and whether its root filesystem is writable. The Pod author sets those fields. The cluster must answer two different questions about them, at two different times. First: may a Pod with these fields be created in this namespace? Pod Security admission answers that when the create request arrives, using a label on the namespace. Second: what does the container actually run as? The kubelet and the container runtime answer that when the container starts, and they can use facts admission never sees, such as the UID the image is built to run as.

So a Pod can pass admission and still refuse to start. Pulling the image needs registry credentials, which are a separate setting from the security context. Image trust, such as signatures or scans, is not checked by any of these controls.

This fixture is authored. It makes no request to a cluster, and the names `sandbox`, `agent` and `legacy-agent` are fixture names.

## Who owns what

- **Namespace owner** sets the `pod-security.kubernetes.io/enforce`, `audit` and `warn` labels, each with a level: `privileged`, `baseline` or `restricted`. The label is the policy.
- **Pod author** writes the `securityContext`, `volumes` and `imagePullSecrets` in the Pod, or in the Pod template of a workload.
- **API server validation** refuses some combinations by itself. For example, `allowPrivilegeEscalation: false` cannot be set together with `privileged: true`.
- **Pod Security admission** checks create requests against the enforce level. Violations under `warn` come back to the client as warnings; violations under `audit` are written as annotations in the audit log. Only `enforce` refuses a request.
- **The registry and `imagePullSecrets`** authenticate the pull. They say nothing about what the process may do once it runs.
- **The kubelet** pulls the image through the runtime, and before starting a container with `runAsNonRoot: true` it checks that the container will not run as UID 0.
- **The container runtime** applies the UID, groups, capabilities, `no_new_privs`, seccomp profile and read-only root filesystem when it creates the process.

Each component owns its own check. Admission never inspects the image's default user. The kubelet never reads namespace labels.

## How it works

Every Pod passes four stages in order. Each stage can stop it, and each one checks different facts.

1. **Validation.** The API server checks the Pod object itself. A request that sets `privileged: true` together with `allowPrivilegeEscalation: false` is refused whatever the namespace says.
2. **Admission.** Pod Security admission compares the fields with the profile named by the `enforce` label. The three profiles are cumulative:
   - *Baseline* refuses `privileged: true`, capabilities added beyond the standard list (for example `NET_ADMIN`), and an explicit `Unconfined` seccomp profile.
   - *Restricted* also requires `allowPrivilegeEscalation: false`, `runAsNonRoot: true`, no `runAsUser: 0`, an explicit `RuntimeDefault` or `Localhost` seccomp profile, and `drop: ["ALL"]` with at most `NET_BIND_SERVICE` added back.
   - Neither profile requires `readOnlyRootFilesystem`. emptyDir is an allowed volume type.

   Admission sees `runAsNonRoot: true` and an unset `runAsUser`, and accepts them. It does not know that the image's default user is root.
3. **Start.** The kubelet pulls the image. A private image pulled without a valid `imagePullSecret` fails with ImagePullBackOff, and no container exists yet. Next, with `runAsNonRoot: true`, the kubelet validates the image at runtime and refuses to start the container if the image runs as UID 0. The Pod stays Pending. If `runAsUser` is set to a non-zero UID, that UID is used and the image's default user does not matter.
4. **Runtime.** The runtime applies the remaining settings. `allowPrivilegeEscalation: false` sets `no_new_privs`, so setuid binaries cannot gain privileges. `privileged: true` disables most isolation, and a privileged container always runs Unconfined for seccomp. `readOnlyRootFilesystem: true` mounts the root filesystem read-only, and a volume such as an emptyDir at `/app/cache` stays writable.

Two rules hold across the stages. First, a namespace label change does not evict anything: when an `enforce` label is added or changed, admission tests each existing Pod against the new level and returns violations as warnings. Second, a Pod's security context and image pull secrets are immutable. Pod updates may change only the container image, `activeDeadlineSeconds`, `terminationGracePeriodSeconds`, `tolerations` and `schedulingGates`. To change the spec you delete the Pod and create a new one. The new Pod has a new UID.

The figure places stage 2 at the tollgate, stage 3 at the registry and the kubelet's UID check, and stage 4 as the lit fittings on the cartridge. A fitting lights only when the runtime has applied that setting.

## YAML example

This is the namespace and Pod the panel shows when the page opens. The image runs as root and `runAsUser` is unset, so admission accepts the Pod and the kubelet refuses to start it.

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: sandbox
  labels:
    pod-security.kubernetes.io/warn: restricted
---
apiVersion: v1
kind: Pod
metadata:
  name: agent
  namespace: sandbox
spec:
  imagePullSecrets:
  - name: registry-creds
  volumes:
  - name: cache
    emptyDir: {}
  containers:
  - name: agent
    image: registry.example.com/agent:2.0
    # image USER: 0 (root); the Pod does not set it
    securityContext:
      runAsNonRoot: true
      # runAsUser unset: the image USER decides the UID
      allowPrivilegeEscalation: false
      # privileged omitted (false)
      capabilities:
        drop: ["ALL"]
      seccompProfile:
        type: RuntimeDefault
      readOnlyRootFilesystem: true
    volumeMounts:
    - name: cache
      mountPath: /app/cache
```

- `runAsNonRoot: true` is checked by admission as a field, and by the kubelet against the real UID at start.
- With `runAsUser` unset, the image's default user applies, and the panel keeps a comment in its place. Setting `runAsUser: 1000` is the change that makes this Pod start.
- `registry-creds` is a Secret holding registry credentials. It authenticates the pull and nothing else.
- The emptyDir mounted at `/app/cache` is the writable location that `readOnlyRootFilesystem: true` needs.
- A setting left out of the Pod appears as a comment carrying the same name. The comments show what admission and the kubelet looked at, even where nothing is written.

## Try these changes

1. **Admitted, then refused at start.** With the default draft, press Apply Pod. Admission accepts it, and `warn: restricted` has nothing to warn about. Press Start container: the kubelet refuses the container because the UID is 0. Set `runAsUser` to 1000, press Delete agent Pod, then Apply Pod and Start container. Expected: the container runs as UID 1000. Admission was never the blocker.
2. **Tighten enforce while a Pod runs.** Set `enforce` to `restricted`. The report says `legacy-agent #1` was re-tested and returned as a warning, and it stays Running. Then, in the draft, turn on `privileged` and set `allowPrivilegeEscalation` to `unset`, and press Apply Pod. Expected: refused by `enforce`, and no Pod object is created.
3. **A combination the API refuses.** The default draft already sets `allowPrivilegeEscalation` to `false`. Turn on `privileged` and press Apply Pod. Expected: refused by validation, whatever `enforce` says, because the combination itself is invalid. Set `allowPrivilegeEscalation` to `unset` and the validation refusal goes away; the enforce result then decides.
4. **Pull before runtime.** Remove `imagePullSecret`, press Apply Pod, then Start container. Expected: the pull fails, the container never reaches the runtime, and the security context is untouched. Restoring the secret does not change the Pod: delete it and apply a new one.
5. **A volume is not the root filesystem.** Set `runAsUser` to 1000, turn off the emptyDir, keep `readOnlyRootFilesystem` on, then delete, apply, start and press Write to /app/cache. Expected: denied by the read-only root filesystem. Turn the emptyDir back on, then delete, apply, start and write again: the write succeeds, and the report names the volume as the reason.

## Misconceptions

- **"Labelling a namespace evicts Pods that break the rule."** Existing Pods are re-tested and receive warnings. They keep running. Only later create requests are refused.
- **"Restricted makes the container read-only."** Restricted does not require `readOnlyRootFilesystem`. It is a separate setting, and this fixture shows the difference.
- **"If admission accepted the Pod, it will start."** Admission checks the fields. The kubelet checks the UID the image really runs as, and it can refuse to start the container.
- **"`runAsNonRoot` sets the user."** `runAsNonRoot` is a check. `runAsUser` sets the UID. A root image with `runAsNonRoot: true` and no `runAsUser` is refused at start.
- **"An image pull secret makes the image trusted or lets it run safely."** It authenticates the pull. Image trust and execution restrictions are different controls.
- **"Pod Security admission applies to the Deployment."** For workload resources only audit and warn apply to the resource itself. Enforce applies to the Pods the controller creates, so the ReplicaSet is the object refused.

## Safe read-only observation

In a namespace you are authorized to read, replace `sandbox` and `agent` with your names:

```sh
kubectl get namespace sandbox --show-labels
kubectl get pod agent -n sandbox -o jsonpath='{.spec.securityContext}{"\n"}{.spec.containers[0].securityContext}{"\n"}'
kubectl describe pod agent -n sandbox
kubectl label --dry-run=server --overwrite namespace sandbox pod-security.kubernetes.io/enforce=restricted
```

**Limits:** `--show-labels` shows labels, not whether an existing Pod would pass them. The `jsonpath` output shows the spec you submitted, not the UID the container runs as; `kubectl exec ... -- id` reports that, but it runs a command in the container. `describe` shows recent events only, so a missing event proves nothing. The server dry-run changes no label, and the page's documentation says it reports how existing Pods would be treated. It still sends a request to the API server.

## Predict and transfer

- A Pod sets `runAsNonRoot: true` and no `runAsUser`, and its image runs as root. Under `enforce: restricted`, is the Pod accepted? Does it start? Which component decides each?
- A namespace has `enforce: baseline`, and a Pod with `privileged: true` is already running. Does the Pod stop when the label is set? What does a new privileged Pod receive?
- A Pod sets `privileged: true` and `allowPrivilegeEscalation: false`. Which check refuses it, and would changing the namespace label fix it?
- An image is signed and scanned, and the Pod has the right `imagePullSecret`, but the Pod runs as root under `warn: restricted` only. Name what each control checked and what each one did not.
- The same question for a Deployment whose Pod template violates `enforce: restricted`. Which object is refused, and where do the warnings appear?

## Assumptions and limits

- Fixture values: namespace `sandbox`, one schedulable node named `node-a`, the image `registry.example.com/agent:2.0` is private and needs `registry-creds`, the image's default user is 0 or 1000, the namespace starts with only `warn: restricted`, and `legacy-agent` exists before any label.
- Simplifications: the scheduler step is omitted and assignment is recorded directly to `node-a`. Probes and Ready are not modeled. Image files are root-owned, so a non-root UID cannot write them; emptyDir is writable by any UID. A failed pull is not retried, because the spec is immutable, and real kubelet backoff is omitted. Capability sets are shown by name only. An unset seccomp profile is treated as Unconfined, the kubelet default unless `seccompDefault` is enabled. The Pod captures the image's default user when it is applied.
- Not modeled: exemptions, `pod-security.kubernetes.io/*-version` labels, Windows, `hostNetwork`, `hostPID`, `hostIPC`, `hostPath`, `hostPort`, AppArmor, SELinux, sysctls, `Localhost` seccomp profiles, ephemeral containers, image signature or scan policy, RuntimeClass, user namespaces, and admission of workload resources beyond the note above.
- Reviewed 2026-10-12 against the kubernetes.io pages below. The documentation describes current behaviour; confirm the version your cluster runs.

## Authoritative sources

Reviewed 2026-10-12 against the kubernetes.io pages below.

- [Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/)
- [Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- [Enforce Pod Security Standards with Namespace Labels](https://kubernetes.io/docs/tasks/configure-pod-container/enforce-standards-namespace-labels/)
- [Configure a Security Context for a Pod or Container](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
- [Restrict a Container's Syscalls with seccomp](https://kubernetes.io/docs/tutorials/security/seccomp/)
- [Images](https://kubernetes.io/docs/concepts/containers/images/)
- [Pod API reference (securityContext.runAsNonRoot)](https://kubernetes.io/docs/reference/kubernetes-api/workload-resources/pod-v1/)
- [Pods (fields that may change after creation)](https://kubernetes.io/docs/concepts/workloads/pods/)

This exploration supports [Kubernetes identity, authorization, admission, and workload boundaries](/learn/kubernetes-security-access?mode=reference), objectives `fpp:kubernetes-security-access/artifact-execution` and `fpp:kubernetes-security-access/workload`. Exploring this fixture does not record evidence for those objectives. For the API request checks that run before admission, see [Authentication, RBAC, and admission](/anatomy/access-control/).
