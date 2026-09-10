# Kubernetes namespaces and API scope

A Kubernetes namespace partitions the names of many API resources inside one cluster. It is primarily an API scope and organizational boundary.

For a namespaced resource, identity includes the namespace:

```text
Deployment/web in namespace team-a
Deployment/web in namespace team-b
```

Those are different objects even though both are named `web`.

## Namespaced versus cluster-scoped

Many everyday workload objects are namespaced: Pods, Deployments, Services, ConfigMaps, and Secrets. Other resources describe cluster-wide infrastructure or policy and are cluster-scoped, such as Nodes and Namespaces themselves.

You can ask the API which resources are namespaced instead of memorizing a giant table. Conceptually, the important question is: **does this object's identity include a namespace, or does it exist once at cluster scope?**

This changes how you query and troubleshoot. `kubectl get pods` operates in the current namespace unless you specify another namespace or all namespaces. If you look in the wrong namespace, "not found" can be a scope mistake rather than absence from the cluster.

## Namespace is not a complete security boundary

Creating two namespaces does not automatically prevent traffic between them, prevent users from reading each other's objects, or impose compute quotas.

Those properties come from separate mechanisms, for example:

- RBAC for API authorization;
- NetworkPolicy for network traffic policy when supported by the network implementation;
- ResourceQuota and LimitRange for resource governance;
- Pod security controls and workload hardening for execution constraints.

Namespaces give those policies a useful scope, but the namespace alone is not the policy.

## Namespace and label solve different problems

Use this distinction:

```text
namespace → API naming/scope boundary for namespaced resources
label     → metadata used for grouping and selection
```

An application can be in namespace `payments` and carry labels such as `app=api` and `environment=staging`. The namespace decides where its namespaced API identity lives; labels allow Services, controllers, policies, and queries to select sets of objects.

## Default namespace is still a namespace

When you omit `metadata.namespace` for a namespaced object and your client context does not choose another namespace, you commonly end up working in `default`. That convenience can hide the scope from beginners.

Make namespace explicit while learning:

```text
kubectl get pods -n payments
kubectl get deployment web -n payments
```

The goal is not command memorization; it is to keep scope visible in your mental model.

## Namespaces and DNS names

Kubernetes service discovery also reflects namespace. A Service called `api` in namespace `payments` can be referred to with a namespace-qualified service DNS name such as `api.payments` from other namespaces, with the full cluster DNS suffix available when needed.

This is a useful reminder that namespace is not just a UI folder. It participates in namespaced object identity and common discovery conventions.

## Observable proof

When an object appears missing or a reference resolves incorrectly:

1. Check the current namespace in your kubectl context.
2. Query the explicit namespace.
3. Determine whether the resource type is namespaced or cluster-scoped.
4. Inspect labels separately from namespace.
5. If the problem is access or traffic isolation, inspect the relevant RBAC or network policy rather than assuming namespace isolation.

The durable KCNA rule: **namespace tells you where a namespaced API object lives; policy tells you what actors or traffic are allowed to do.**
