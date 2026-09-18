# Kubernetes identity, authorization, admission, and workload boundaries

Kubernetes security is not one permission check. A useful model follows an API request and then asks which controls still matter after the workload is running.

## API request path

```text
client request
  -> authentication: who is the caller?
  -> authorization: may that identity perform this verb on this resource?
  -> admission: is the proposed object allowed or should it be mutated?
  -> persist accepted API state
```

**Authentication** establishes identity. A kubeconfig may carry a client certificate, token, or information used with an external identity provider. Having credentials does not automatically mean the caller may do everything.

**Authorization** answers whether the authenticated identity may perform an action. RBAC is a common Kubernetes authorization model. A `Role` or `ClusterRole` defines allowed operations; a `RoleBinding` or `ClusterRoleBinding` connects those permissions to users, groups, or ServiceAccounts.

**Admission** evaluates requests after authentication and authorization but before accepted objects are persisted. Admission can validate or mutate objects. Pod Security Admission is one example that can enforce Pod Security Standards at namespace scope.

## TLS, certificates, and kubeconfig come before API permission

TLS protects a connection and lets a client verify the API server's identity.
The server presents a certificate; the client checks its trusted certificate
authority (CA), validity period, and the server name. A trusted server certificate
does not give the client permission to list Pods.

Client-certificate authentication adds a separate identity check. In the common
Kubernetes X.509 model, a certificate signed by a trusted client CA identifies
the caller; the certificate's subject can supply the username and groups.
RBAC then determines what that identity may do. Other authentication mechanisms,
including bearer tokens and external credential plugins, do not require each
human to have a client certificate.

Certificate creation has distinct responsibilities:

```text
requester creates private key -> requester creates certificate signing request
  -> authorized approver checks identity and intended use
  -> trusted signer issues certificate
  -> client uses certificate + private key
  -> API server authenticates identity -> authorization checks permissions
```

The private key must stay private. Generating a key, submitting a CSR, approving
it, and signing it are different actions; Kubernetes does not automatically
approve every human certificate request. Do not disable TLS verification to
hide an expired certificate or hostname mismatch.

A **kubeconfig** organizes connection settings rather than granting access on its
own. A `cluster` entry names the API endpoint and server trust information;
a `user` entry describes credentials or how to obtain them; a `context` joins
a cluster, user, and optional default namespace. Switching context changes which
combination `kubectl` uses, not the command's Kubernetes meaning.

Safe first inspections include `kubectl config current-context`,
`kubectl config get-contexts`, and `kubectl auth can-i get pods -n sandbox`.
Keep kubeconfigs private if they contain or can obtain credentials. Treat an
untrusted kubeconfig as executable configuration: credential plugins can run
programs. Avoid publishing `kubectl config view --raw` output.

## API groups connect manifests to RBAC rules

`apiVersion` identifies an API group and version. A Pod uses the core group
(`apiVersion: v1`); a Deployment uses the `apps` group (`apps/v1`); a Role uses
`rbac.authorization.k8s.io/v1`. The API server exposes discovery information so
clients can learn which resources and versions a cluster supports.

In an RBAC rule, the core group's name is the empty string `""`, not `"v1"`.
A rule granting `get` on `pods` in `apiGroups: [""]` does not grant access to
`deployments` in `apps`. Resource names are generally plural API resource names,
not the manifest's capitalized `kind`. Use `kubectl api-resources` to inspect
group names and namespace scope; use `kubectl api-versions` for served versions.

| Permission object | Binding | Effective scope |
| --- | --- | --- |
| Role in `sandbox` | RoleBinding in `sandbox` | That namespace |
| ClusterRole | RoleBinding in `sandbox` | The binding's namespace, for namespaced resources |
| ClusterRole | ClusterRoleBinding | Cluster-wide permission, including suitable cluster-scoped resources |

A ClusterRole definition alone grants nothing. For a namespace-only Pod reader,
prefer a RoleBinding rather than giving cluster-wide permissions by convenience.

## Image security and process security are separate

An image reference names an artifact, not a trust guarantee. Use reviewed
registries, immutable digest references where reproducibility matters, vulnerability
scanning, and an appropriate provenance/signature verification policy. An
`imagePullSecret` supplies registry credentials; it does not scan or certify an
image. `imagePullPolicy: Always` is also not a vulnerability check.

A Pod or container `securityContext` configures aspects of execution such as
user IDs, capability sets, privilege escalation, seccomp, and filesystem access.
For example, a compatible application can run as a non-root user, disallow
privilege escalation, drop unnecessary capabilities, and use a read-only root
filesystem with explicit writable mounts. These choices need testing: an image
that writes logs under `/var/log` may fail with an entirely read-only root.

Pod-level settings provide shared defaults where supported; container-level
settings can override overlapping settings for that container. Admission can
reject an unsafe proposed configuration. Node/runtime/kernel mechanisms enforce
the accepted execution settings. A scanned image can still be run with unsafe
privileges, and a restricted process can still contain vulnerable software.

## Workload identity is not a human kubeconfig

Pods commonly receive a **ServiceAccount** identity. That identity can be bound to RBAC permissions for Kubernetes API access. Give workloads only the permissions they require; do not treat the default ServiceAccount as an all-purpose application identity.

Cloud workload identity is a separate integration boundary. A Kubernetes ServiceAccount may be mapped to a cloud identity mechanism, but the Kubernetes object itself is not an AWS IAM role, Google service account, or Azure managed identity.

## Secrets need multiple controls

A Kubernetes `Secret` is a distinct API resource intended for sensitive data, but ordinary manifest values are base64-encoded rather than inherently encrypted. Protect Secrets with API authorization, encryption at rest, restricted mounts, short-lived identity where possible, and careful logging.

Avoid assuming that "inside a namespace" means "private." Namespace scope helps organize API objects and RBAC bindings, but it is not by itself a process isolation, network firewall, or secret-encryption boundary.

## Pod and network controls answer different questions

Pod Security Standards define increasingly restrictive workload-security profiles. Pod Security Admission can enforce those profiles. These controls are about what a Pod is allowed to request: privileges, host namespaces, capabilities, and related settings.

NetworkPolicy instead describes which network flows are allowed for selected Pods, when the network implementation supports enforcement. RBAC controls API actions; NetworkPolicy controls traffic; Pod security controls workload privileges. None substitutes for the others.

## A practical least-privilege checklist

For a workload that only needs to read one ConfigMap and call one backend:

1. Give it a dedicated ServiceAccount.
2. Bind only the required API read permission, if API access is actually needed.
3. Avoid mounting unrelated Secrets.
4. Apply an appropriate Pod security profile.
5. Restrict network ingress/egress where the cluster dataplane enforces policy.
6. Verify the workload can perform its required transaction and cannot perform a nearby forbidden action.

Security evidence includes both positive and negative tests: prove the intended action works and the disallowed action fails.

## Worked case: known caller, permitted verb, rejected object

~~~text
subject: system:serviceaccount:sandbox:deployer
can create pods in sandbox: yes
privileged Pod create: denied by restricted Pod Security policy
can list secrets in sandbox: no
~~~

These authored outputs represent different checks. Authentication establishes
the subject; authorization permits Pod creation; admission evaluates the proposed
Pod. The API rejection names the policy that stopped persistence. A `can-i` yes
checks authorization and cannot promise every proposed Pod will pass admission.

Inspect the Role/RoleBinding scope and admission error before proposing a change.
Use the existing identity or authorized impersonation for diagnostic checks;
impersonation itself needs permission. Do not expose Secret values as evidence.
A successful create would still require node-side execution and separate network
connectivity evidence.
