## The big picture

Kubernetes needs a way to keep many teams' objects apart inside one cluster. A namespace provides a **scope for names**: most namespaced objects are unique per kind within their namespace, so two teams can each have a Deployment called `web`. The namespace is not a security wall and not a network wall. Those are separate mechanisms, configured by separate objects, and creating a namespace turns none of them on.

The apparatus above is an original teaching fixture, not a recording of a cluster. The low chest holds two pull-out drawers, `team-a` and `team-b`, one per namespace. The tall tower on the right holds **cluster-scoped** objects, which have no namespace and belong to no drawer. Each card is one identity. Every action changes only this fixture's state.

## Who owns what

- **The API server** checks each request (authentication, authorization, admission), enforces name uniqueness per kind and scope, and refuses creating new objects in a namespace that is `Terminating`.
- **The namespace controller** finishes a namespace deletion: it removes the namespace's namespaced objects, then removes the namespace itself.
- **You** (or a tool acting for you) choose the namespace, kind and name of each object. A namespace is set in `metadata.namespace` of a namespaced object; a cluster-scoped object has no such field.
- **Other controllers** act on the objects that exist. A Deployment is stored intent; the fixture does not create Pods for it.
- **Network policy** is a separate object type in a namespace. It applies to the Pods selected inside that namespace, and only if the network plugin enforces it.

## How it works

1. **Identity is kind, namespace and name.** For a namespaced object the API group, resource type, namespace and name together identify it. Two objects with the same kind and name can coexist only if their namespaces differ. For a cluster-scoped object such as a ClusterRole, there is no namespace in the identity, so the name must be unique across the whole cluster.
2. **Create checks the identity.** If the namespace is `Active` and no object has that identity, the object is stored. If it already exists, the API server refuses with a conflict and nothing changes. The fixture's Create button is a create, not an apply: an apply on an existing object would patch it.
3. **A Terminating namespace accepts no new objects.** Deleting a namespace moves it to `Terminating`. Existing objects remain until the namespace controller removes them. Creating anything inside it is refused in the meantime.
4. **Cleanup is a cascade.** Finishing a namespace deletion removes every namespaced object in that namespace, then the namespace object. Cluster-scoped objects are not inside any namespace, so they are not removed.
5. **Cross-namespace names need the full DNS name.** A Service creates a DNS record of the form `<service>.<namespace>.svc.cluster.local`. A client in `team-a` resolves `web` to its own namespace; to reach `team-b` it must use `web.team-b.svc.cluster.local`. The fixture shows whether that name resolves: it does only while Service `web` exists in `team-b`.
6. **Reach is a separate rule.** By default a Pod is non-isolated for ingress, so traffic from `team-a` to `team-b` is not restricted. Creating a NetworkPolicy with `policyTypes: [Ingress]` in `team-b` isolates the selected Pods; the fixture's lid closes on `team-b`'s socket while that policy exists. Deleting the namespace removes the policy too.

## YAML example

The four documents below are the manifests the panel shows for the selected identity. The panel starts on `Deployment web` in `team-a`. Its `namespace` line always equals the namespace you selected; a ClusterRole has no such line.

```yaml
# Namespaced: metadata.namespace is part of identity.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: team-a
spec:
  replicas: 1
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
---
# Namespaced: the DNS name includes the namespace.
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: team-a
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
---
# Namespaced: applies only to Pods in its own namespace. Ingress is isolated and no ingress rule allows anything (traffic from the Pod's node still passes).
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-ingress
  namespace: team-b
spec:
  podSelector: {}
  policyTypes:
    - Ingress
---
# Cluster-scoped: there is no metadata.namespace line; the identity is kind + name only.
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: web
rules:
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list"]
```

Read the identity fields as a unit. `Deployment/team-a/web` and `Deployment/team-b/web` are different objects. `ClusterRole/web` is one object for the whole cluster, whichever namespace you selected. The NetworkPolicy has no `ingress` rules, so it isolates its Pods for ingress and allows nothing into them, except traffic from their own node. A Deployment, a Service or a ClusterRole creates no traffic rule at all.

## Try these changes

1. **Duplicate name in one namespace.** Keep namespace `team-a`, kind `Deployment`, name `web`, and press **Create Deployment web in team-a**. Expected: refused with a conflict. The identity already exists, and nothing else changes.
2. **Same name, other namespace.** Select `team-b` and press **Create Deployment web in team-b**. Expected: created. Team-a's object is untouched, and the two now have distinct identities.
3. **Delete a namespace.** Start after step 2, so `team-b` holds Deployment `web`. With `team-b` selected, press **Delete namespace team-b**. Expected: its drawer dims, its objects remain, the namespace is `Terminating`, and **Create** in `team-b` is refused. Then press **Complete cleanup of team-b**. Expected: only `team-b`'s namespaced objects are removed and the namespace is gone; team-a's Deployment remains.
4. **Policy versus namespace.** Select kind `NetworkPolicy` and namespace `team-b`, then press **Create NetworkPolicy deny-ingress in team-b**. Expected: the lid closes and the ingress row reads **NetworkPolicy in team-b: ingress to its Pods is blocked, except from their node**. Press **Delete NetworkPolicy deny-ingress in team-b**. Expected: the lid opens and the ingress row reads **no NetworkPolicy in team-b: ingress not restricted**. The namespace and its other objects are untouched, because a NetworkPolicy is a separate object.
5. **Cluster-scoped name ignores the namespace.** Select kind `ClusterRole`, name `web`, and press **Create ClusterRole web (cluster-scoped)**. Then switch the namespace to `team-b` and create it again. Expected: refused; the namespace selector was never part of a ClusterRole's identity.

## Misconceptions

- **"A namespace isolates traffic and access."** Correction: by default no NetworkPolicy exists, and Pods accept traffic from any source. Network isolation needs a NetworkPolicy, access control needs RBAC bindings, and resource limits need a ResourceQuota. A namespace is only the scope those objects apply to.
- **"Names are unique across the whole cluster."** Correction: names are unique per kind within a namespace. Only cluster-scoped objects, such as ClusterRoles, have cluster-wide uniqueness per kind.
- **"Deleting a namespace removes only the namespace object."** Correction: the namespace's namespaced objects are removed as well, and the deletion is asynchronous. The namespace stays `Terminating` until cleanup finishes.
- **"Every object lives in a namespace."** Correction: Namespace, Node, PersistentVolume and ClusterRole are cluster-scoped. Deleting a namespace never removes them.
- **"A new namespace lets its users do things."** Correction: permissions come from RBAC bindings. A ClusterRole grants nothing until a binding refers to it, and a new namespace has none by itself.

## Safe read-only observation

These commands only read state. Replace the names with objects you are authorized to inspect.

```sh
kubectl api-resources --namespaced=true
kubectl api-resources --namespaced=false
kubectl get namespace team-b -o jsonpath='{.status.phase}{"\n"}'
kubectl get deployment web -n team-a -o jsonpath='{.metadata.namespace}{"\n"}'
kubectl get networkpolicy -n team-b
kubectl get clusterrole web -o yaml
```

The first two lists show which resource types are namespaced. The phase command shows `Active` or `Terminating`. The Deployment read proves that one identity exists in one namespace, not that Pods are running. The NetworkPolicy list shows the policy objects present, not whether the network plugin enforces them. The ClusterRole output has no namespace line, which is the cluster-scope identity. Each command is a snapshot; RBAC may hide objects from you, and a read cannot prove the absence of an object in another namespace you cannot list.

## Predict and transfer

Team-b has a Service `web` and a `deny-ingress` NetworkPolicy. You delete team-b, complete its cleanup, and then create team-b again, empty.

**Prediction:** Service `web` and the NetworkPolicy are gone with the old namespace. While team-b is absent, both rows of the path read **team-b is absent: nothing to reach**. After it is recreated empty, the ingress row reads **no NetworkPolicy in team-b: ingress not restricted**, but the DNS row reads **no Service web in team-b: the name does not resolve** until a new Service `web` is created there. Deleting the policy alone would have left the Service in place, and the DNS row would still read that the name resolves.

## Assumptions and limits

The fixture has two namespaces, two names per namespaced kind, and one cluster-scoped kind. It starts with a single Deployment in `team-a` and nothing else. A Deployment is stored intent; no Pods, ReplicaSets, endpoints or container runtimes are modelled. A Service exists in DNS while its object exists, without checking backing Pods. The NetworkPolicy is assumed to be enforced by the network plugin, and its empty `podSelector` is assumed to select every Pod in team-b, which the fixture does not show. RBAC is not evaluated, ServiceAccounts and ResourceQuotas are not modelled, and namespace deletion completes on a single press, whereas a real `Terminating` phase can last longer when finalizers hold objects. The model does not run cluster commands, persist learner data, or claim live verification.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/) — scope for names, namespaced versus cluster-scoped objects, and the DNS form for cross-namespace reach.
- [Kubernetes: Object Names and IDs](https://kubernetes.io/docs/concepts/overview/working-with-objects/names/) — per-kind uniqueness within a namespace and the four-part identity.
- [Kubernetes: Share a Cluster with Namespaces](https://kubernetes.io/docs/tasks/administer-cluster/namespaces/) — the `Active` and `Terminating` phases and the asynchronous deletion that removes everything in the namespace.
- [Kubernetes: Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/) — default non-isolation, the default deny-ingress example, and the requirement for an enforcing network plugin.
- [Kubernetes: Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) — ClusterRoles versus namespaced Roles, and permissions granted only through bindings.
