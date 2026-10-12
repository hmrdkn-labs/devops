## The big picture

An API request is not one yes-or-no decision. The API server asks three different questions in order: **who is this** (authentication), **may this identity perform this verb on this resource** (RBAC authorization), and **is this object acceptable to store** (admission). A yes to one question never answers another. A caller can be authenticated and forbidden, authorized and rejected by admission, or admitted and still not running.

The cluster administrator decides how the API server authenticates callers and which authorizers run. An RBAC administrator writes the Role and RoleBinding in a namespace. The namespace owner labels the namespace with a Pod Security level. The workload author writes the Pod's `securityContext` and `serviceAccountName`. The API server applies these in the order above. None of those checks starts a container.

The apparatus above is an original teaching fixture: one request, one namespace, one rail of gates. It shows the order of checks. It is not a live cluster, and it does not claim scheduling, image pull or a Running container.

## Who owns what

- **The authenticator (API server).** Turns a presented credential into a username and groups, or rejects it. An invalid bearer token gets `401 Unauthorized`. A ServiceAccount is an API object with a token. A normal user has no object in the API; the cluster only trusts a credential that establishes who the user is.
- **The RBAC authorizer (API server).** Finds RoleBindings whose subjects include the identity, then checks the bound Role's rules for the verb and resource. Access is denied by default, and RBAC rules are purely additive: there are no deny rules. A denial is `403 Forbidden`.
- **The mutating step.** Admission plugins and webhooks may change the object before validation. The fixture's step stands in for them and fills only fields the Pod left unset.
- **The validating step, here PodSecurity.** Reads the namespace's `pod-security.kubernetes.io/enforce` label and rejects a Pod that violates that level. It validates; it does not repair the Pod. The fixture checks five restricted controls.
- **The ServiceAccount, as workload identity.** A Pod names one with `spec.serviceAccountName`, and Kubernetes gives the Pod credentials for it. That decides what the Pod runs as. It is not the identity RBAC checked for the create request.

## How it works

1. **Authentication.** The API server checks the credential. An expired bearer token stops here with `401`, and no later check is evaluated. A valid identity continues to the next check.
2. **RBAC · subject.** The authorizer looks for a RoleBinding in the namespace whose subjects include the identity. The fixture's RoleBinding names only the `deployer` ServiceAccount. With no matching binding there is no grant, so the request is denied with `403`.
3. **RBAC · rule.** The bound Role must allow the verb on the resource. The fixture's Role `pod-writer` allows `create` on `pods`. A `get` on `secrets` is denied here, so admission never sees it.
4. **Mutating step.** Runs before validation, so validation reads the mutated object. The fixture fills the four restricted fields that the Pod leaves unset and leaves set fields alone. Because it never overwrites a field the Pod sets, it cannot remove `privileged: true`.
5. **Validating step.** PodSecurity checks the object against the namespace's enforce level. The fixture checks `privileged` is not true, `allowPrivilegeEscalation: false`, `runAsNonRoot: true`, `seccompProfile.type: RuntimeDefault`, and `capabilities.drop` includes `ALL`. One violation rejects the whole request, so nothing is written. The rejection message has the shape `pods "report-job" is forbidden: violates PodSecurity "restricted:latest": …` ([the PodSecurity Admission announcement](https://kubernetes.io/blog/2022/08/25/pod-security-admission-stable/) shows this form). The word *forbidden* is also what RBAC denials carry, so read the message, not the word.
6. **Persistence.** The object is stored with an empty `spec.nodeName`. Scheduling, image pull and container start happen later and are outside the fixture.

The order is fixed by the API server's design: authentication, then authorization, then mutating admission, then validating admission, and only then persistence. Admission runs only for requests that authorization allowed. Admission does not block reads (`get`, `list`, `watch`), so reads bypass this path entirely; the fixture's read is denied at RBAC.

## YAML example

The request body the figure validates, for the default hardened profile. The Pod panel shows this text:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: report-job
  namespace: sandbox
spec:
  serviceAccountName: deployer
  containers:
    - name: report
      image: registry.example.com/report:1.4.2
      securityContext:
        runAsNonRoot: true
        allowPrivilegeEscalation: false
        seccompProfile:
          type: RuntimeDefault
        capabilities:
          drop: ["ALL"]
```

The RBAC and namespace objects the request meets in `sandbox`. The second panel shows this text:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: deployer
  namespace: sandbox
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-writer
  namespace: sandbox
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: deployer-pod-writer
  namespace: sandbox
subjects:
  - kind: ServiceAccount
    name: deployer
    namespace: sandbox
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: pod-writer
---
apiVersion: v1
kind: Namespace
metadata:
  name: sandbox
  labels:
    pod-security.kubernetes.io/enforce: restricted
```

Annotations:

- `serviceAccountName: deployer` is the identity the Pod runs as. No modelled check reads it, because RBAC authorized the caller who sent the create.
- The `securityContext` lines are what PodSecurity reads. `privileged` is absent here, which the restricted profile accepts as unset; a field set to `true` is what fails.
- The Role grants `create` on core `pods` only. The RoleBinding is the only link from the ServiceAccount to that Role.
- `pod-security.kubernetes.io/enforce: restricted` on the Namespace is the only PodSecurity setting the fixture uses.

## Try these changes

1. **Expired token.** Set Caller to the expired bearer token and send. Expected: `401` at authentication; RBAC and admission cards say Not reached; no manifest line is highlighted, because the credential is not in either manifest.
2. **Remove the RoleBinding.** Untick the RoleBinding control and send with the valid ServiceAccount. Expected: `403` at the RBAC subject check. The Role still exists, but the rule check is Not reached. Authentication passed: the identity is known, and no grant names it.
3. **Ask for a Secret.** Keep the binding and set Request to Get a Secret. Expected: `403` at the RBAC rule check, because the Role allows `create` on `pods` only. Admission never runs.
4. **Minimal Pod, then the mutating step.** Set the securityContext to Minimal and send. Expected: RBAC allows the request, and admission rejects it with four restricted checks failing. Then tick the mutating-step control and send again. Expected: the step adds four unset fields, validation passes, and the Pod is stored. The sleeve lamp lights to show the object was changed.
5. **Privileged Pod, same mutating step.** Set the securityContext to Privileged, keep the mutating step on, and send. Expected: still rejected, with `privileged: true` named as a failure. The step fills only unset fields, and `allowPrivilegeEscalation: true` is explicitly set, so it is not repaired.

## Misconceptions

- **"RBAC allowed it, so the Pod is acceptable."** Authorization and admission are separate gates. Experiment 4 shows admission rejecting a Pod that RBAC had allowed.
- **"A 403 means the token is bad."** An invalid or expired token is `401`. A `403` means the identity is established and no grant applies. An admission rejection is a different outcome.
- **"A 403 always means RBAC said no."** A PodSecurity rejection's message also says `is forbidden`, and the webhook documentation's example rejection carries `code: 403`. The message names the check that fired; the number does not.
- **"A mutating step makes a Pod secure."** A mutating step fills only unset fields. A `privileged: true` the author wrote survives and fails validation.
- **"`serviceAccountName` decides who may create the Pod."** The caller is what is authorized. `serviceAccountName` picks the identity the new Pod runs as. The authorization documentation lists, as an escalation path, that a principal allowed to run arbitrary Pods in a namespace can use any ServiceAccount there. So `create pods` is a powerful grant, not a neutral one.
- **"Kubernetes stores users."** It stores ServiceAccounts. A normal user is an identity established by a trusted credential, and RoleBindings name that identity as a subject.

## Safe read-only observation

These commands read state and do not write:

```sh
kubectl auth can-i create pods --namespace sandbox --as system:serviceaccount:sandbox:deployer
kubectl auth can-i get secrets --namespace sandbox --as system:serviceaccount:sandbox:deployer
kubectl get roles,rolebindings --namespace sandbox -o yaml
kubectl get namespace sandbox --show-labels
kubectl get pod report-job --namespace sandbox -o jsonpath='{.spec.serviceAccountName}{"\n"}{.spec.nodeName}{"\n"}'
```

**Read-safe, but not a read:** `kubectl apply --dry-run=server -n sandbox -f pod.yaml` sends the create through authentication, authorization and admission, so you see the PodSecurity message. Kubernetes guarantees a dry-run request is not persisted and has no side effects ([API concepts: dry-run](https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run)). Its limits: it needs the same authorization as the real create, and a request that would trigger an admission controller with side effects fails instead of running it.

**Limit:** `kubectl auth can-i` queries the authorization layer only, using a SelfSubjectAccessReview for the current user; `--as` needs permission to impersonate the identity. It does not authenticate a real token, run admission, or predict whether PodSecurity would reject a create. The namespace label shows configuration, not whether existing Pods comply. A rejected create leaves no Pod to describe. An empty `nodeName` means stored but not assigned; it does not mean Running.

## Predict and transfer

A ServiceAccount `ci` has a RoleBinding to `pod-writer` (create pods) in `sandbox`, and the namespace enforces `restricted`. `ci` submits a Pod with `privileged: true`. Predict which check stops it, and whether adding a second RoleBinding that grants `ci` `get` on secrets changes the result.

**Prediction:** authentication and both RBAC checks pass for `create pods`. Validating admission rejects `privileged: true`, so nothing is stored, and the message names PodSecurity rather than RBAC. The secrets grant is a different verb and resource, so it does not change this create. A mutating step could fill unset defaults, but it cannot remove `privileged: true`.

Second question: a pipeline gets `401` from the API server. Which of the three questions failed, and why is editing its Role the wrong first step?

**Prediction:** authentication failed. The Role is never evaluated while the credential is invalid, so editing it changes nothing until the credential works.

Continue with [Kubernetes security access](/learn/kubernetes-security-access?mode=reference). Exploring this object does not record mastery.

## Assumptions and limits

- The fixture has one ServiceAccount, one user, one Role with one rule, one RoleBinding and one namespace. The mutating step is invented for this fixture; real mutation comes from built-in plugins and webhooks.
- PodSecurity has no numeric status in the built-in pages cited here. The webhook documentation's example rejection carries `code: 403`, so an admission rejection can share RBAC's number; the figure therefore reports the message, not a status code.
- The default discovery grants that Kubernetes gives authenticated users are not modelled. "Deny by default" here refers to the modelled Role.
- Not modelled: existing objects and name conflicts, schema validation, other admission plugins such as the ServiceAccount plugin, LimitRanger and ResourceQuota, webhook failure policies, token expiry, certificate revocation, audit, and everything after storage. Each send starts from an empty sandbox.
- The authenticator order is not guaranteed by Kubernetes. The figure's gate order explains the checks; it does not claim a plugin execution order beyond the stated phases.

## Authoritative sources

Documentation review: **reviewed 2026-10-12**. This records a review of the public documentation, not a cluster observation.

- [Kubernetes: Authenticating](https://kubernetes.io/docs/reference/access-authn-authz/authentication/): `401` for an invalid bearer token; users versus ServiceAccounts.
- [Kubernetes: Authorization](https://kubernetes.io/docs/reference/access-authn-authz/authorization/): access is denied by default; admission runs after authorization; `403` on denial; the escalation paths for arbitrary Pods.
- [Kubernetes: Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/): purely additive rules; Role, RoleBinding and subjects; `kubectl auth can-i`.
- [Kubernetes: Admission Control in Kubernetes](https://kubernetes.io/docs/reference/access-authn-authz/admission-controllers/): admission after authentication and authorization; mutating before validating; reads bypass admission.
- [Kubernetes: Pod Security Admission](https://kubernetes.io/docs/concepts/security/pod-security-admission/): enforce mode rejects Pods that violate the namespace level.
- [Kubernetes: Pod Security Standards](https://kubernetes.io/docs/concepts/security/pod-security-standards/): the restricted controls the fixture approximates.
- [Kubernetes: Pod Security Admission announcement](https://kubernetes.io/blog/2022/08/25/pod-security-admission-stable/): the rejection message shape, `is forbidden: violates PodSecurity "restricted:latest"`.
- [Kubernetes: Apply Pod Security Standards at the Cluster Level](https://kubernetes.io/docs/tutorials/security/cluster-level-pss/): `kubectl label --dry-run=server` to preview a policy against existing Pods.
- [Kubernetes: API Concepts, dry-run](https://kubernetes.io/docs/reference/using-api/api-concepts/#dry-run): dry-run requests are not persisted and have no side effects.
- [Kubernetes: Dynamic Admission Control](https://kubernetes.io/docs/reference/access-authn-authz/extensible-admission-controllers/): the webhook rejection example carries `code: 403`.
