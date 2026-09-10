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
