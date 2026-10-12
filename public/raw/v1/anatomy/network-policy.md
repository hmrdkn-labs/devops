## The big picture

A Pod accepts and sends traffic from anywhere in the cluster until a NetworkPolicy selects it for a direction. In the namespace `shop` used by the figure, the client can reach the database by Pod IP, and nothing stops it by default. A NetworkPolicy narrows that for the Pods it selects, one direction at a time: ingress, egress, or both.

You write the policy. The API server validates and stores it. The network plugin (CNI) on each node enforces it. If the plugin does not implement NetworkPolicy, the object is accepted and has no effect.

The apparatus above is an original teaching fixture, not a recording of a cluster. Four Pods sit on a bench. One probe, the overhead cartridge, travels from its source's egress gate to its destination's ingress gate. A lowered lid is an applied policy checking traffic; a raised lid is open, or stored but not enforced.

## Who owns what

- **Policy author** (you, a Helm chart, or a GitOps pipeline): writes the selectors, `policyTypes`, and allow rules.
- **kube-apiserver**: validates and stores NetworkPolicy objects. It does not filter packets.
- **Network plugin (CNI)**: implements the policy on each node. Only its enforcement changes which connections succeed.
- **Service data path** (kube-proxy or your dataplane): sends a connection to a Service's port 80 onward to a backing Pod's targetPort, 8080 here. The policy sees the port the Pod receives.
- **kube-dns (CoreDNS)**: resolves the name `web`. When client egress is isolated, a lookup is traffic like any other and needs its own allow rule.

## How it works

1. **Isolation is per direction.** A Pod is isolated for ingress once a NetworkPolicy selects it and lists `Ingress` in `policyTypes`; egress works the same way. Until then, that direction is open.
2. **Policies are additive.** When several policies select a Pod for one direction, the allowed traffic is the union of their rules. Creation order does not matter.
3. **A connection needs both ends.** The source's egress rules and the destination's ingress rules must each allow it. Client to db needs client-egress to allow db, if client is isolated for egress, and db-ingress to allow the client.
4. **Selectors combine two ways.** A `podSelector` matches Pods in the policy's own namespace. One `from` or `to` item that holds both `namespaceSelector` and `podSelector` matches only the Pods that satisfy both. Two separate items match either. The DNS rule in the example is one item.
5. **Ingress ports are the Pod's ports.** The ingress `ports` list names ports made accessible on the selected Pods. For Service web, that is 8080, the targetPort. A rule that names 80 is a silent mistake: no connection arrives at a Pod on 80, so nothing matches. The port control in the figure reproduces it.
6. **Egress ports are a documented gap.** The API reference describes egress `ports` as destination ports. It does not say whether a Service port is rewritten before the egress check, so the fixture compares egress against the Pod port and names that choice under the limits below.
7. **DNS is a separate allow.** The docs warn that a deny-all egress policy also blocks DNS. In the probe, the DNS gate runs before the Service gate, so a blocked lookup stops the probe before any connection to a Pod.
8. **A probe stops at the first armed gate that does not match.** Gates after it are not reached, and the ledger says so. A gate whose direction has no applied policy is not a check at all; it reports "no policy applies".
9. **Enforcement is a separate fact from storage.** When the plugin does not enforce, stored policies are shown as stored, and the probe still reports the gate that would have stopped it. Turning enforcement on is what makes the stored objects act.

## YAML example

This is the state the panel shows after you apply web-ingress with port 8080: the Service plus the policy. Comments explain the fields that matter.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  selector:
    app: web
  ports:
    - protocol: TCP
      port: 80                 # Service port: what clients dial
      targetPort: 8080         # Pod port: what NetworkPolicy compares
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-ingress
  namespace: shop
spec:
  podSelector:               # selects app=web Pods: isolates them for Ingress
    matchLabels:
      app: web
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
      ports:
        - protocol: TCP
          port: 8080           # Pod port (targetPort), as the Pod receives it
```

The `podSelector` isolates both web Pods for Ingress, because each carries `app: web`. The rule admits only `role: frontend` Pods on TCP 8080. Nothing in this object names the Service's port 80 as an allowed port, which is why the Service must be probed to see the translation.

## Try these changes

1. **Apply web-ingress on port 8080, then send client to Service web.** Expected: delivered. The ledger shows web-ingress admitted, and the result says the Service translated port 80 to 8080. The web Pod cards now read "ingress: isolated, gate checks". The probe reaches one endpoint, web-7c9d4-x2kq8, by design of the fixture.
2. **Change the web-ingress port to 80 and send the same probe.** Expected: dropped at the web-7c9d4-x2kq8 ingress gate, which the object marks with a red cross on that Pod's in hatch. The API accepted the object in both cases; only the port's meaning changed.
3. **Apply client-egress with DNS allowed, then send client to db by Pod IP.** Expected: dropped at client egress. The egress rule allows only `app: web`, and db is not web, so the probe never reaches db-ingress.
4. **With client-egress applied, turn DNS off and send client to Service web.** Expected: dropped at the DNS lookup, before any connection to a Pod. Turning DNS back on restores delivery.
5. **Keep web-ingress on port 80, turn enforcement off, and send client to Service web.** Expected: delivered, with the result stating that web-ingress would have dropped it. Turn enforcement on and probe again to see the drop.

## Misconceptions

- **"A NetworkPolicy blocks traffic once it exists."** It has no effect unless the cluster's network plugin implements NetworkPolicy. The docs state that creating one without such a controller "will have no effect."
- **"A namespace is an isolation boundary."** A namespace scopes names and selectors. Pods in `shop` accept and send everything until a policy selects them.
- **"Allowing the client on the database is enough."** Both sides must allow. Client to db needs egress permission on the client as well as ingress on the database.
- **"A new policy overrides the old one."** Policies are additive. The applicable rules form a union.
- **"Port 80 in an ingress rule matches the Service."** Ingress ports apply to the Pod's own ports, after the Service translates 80 to targetPort 8080.
- **"Deny-all egress still lets DNS work."** It does not. Name resolution needs an allow rule to the cluster DNS.
- **"A policy can target a Service by name."** NetworkPolicy selects Pods and namespaces by labels. The docs list targeting Services by name as not supported.

## Safe read-only observation

- `kubectl get networkpolicy -n shop`: lists the objects. Limit: it does not show whether the network plugin enforces them.
- `kubectl describe networkpolicy web-ingress -n shop`: shows how Kubernetes interpreted the selectors and ports, which the docs recommend when in doubt. Limit: it does not prove the traffic is blocked or allowed in practice.
- `kubectl get pods -n shop --show-labels`: confirms the labels that selectors use. Limit: it does not list which policies select a Pod.
- `kubectl get endpointslice -n shop -l kubernetes.io/service-name=web`: shows the Pod IPs and ports the Service sends to. Limit: it shows no policy decision.
- `kubectl get pods -n kube-system -l k8s-app=kube-dns`: finds the DNS Pods that a DNS egress rule must reach. Limit: the docs use this label for CoreDNS; other distributions can label differently, so check the kube-dns Service as well.

## Predict and transfer

1. A policy for `app=web` allows `role=frontend` on TCP 8080, and the Service maps 80 to 8080. Predict whether a frontend reaches the Service on port 80. Then predict what changes if the policy lists port 80 instead. (Yes, then no: the rule matches nothing.)
2. A namespace has a default-deny ingress policy (`podSelector: {}`, `policyTypes: [Ingress]`), and you add a new Pod that no other policy selects. Predict its ingress and egress. (Ingress is denied; egress is still open, because no policy lists Egress.)
3. client-egress is applied and allows only `app: web`. db-ingress allows `role: frontend` on 5432. Predict whether client to db succeeds and which gate stops it. (It stops at client egress, because db is not web.)
4. Your cluster's plugin does not implement NetworkPolicy. Predict what `kubectl apply` reports and what the probe shows. (The apply succeeds; traffic is unchanged.)

## Assumptions and limits

- The figure is an authored fixture. It routes a Service-addressed probe to a single endpoint, web-7c9d4-x2kq8; a real Service spreads connections across Ready endpoints.
- The DNS lookup is a separate gate on the client's egress, evaluated before the Service gate. Search domains, resolver caching and resolver configuration are omitted.
- Egress ports: the API reference calls them destination ports and does not say whether a Service port is translated before the check. The fixture compares egress against the Pod port, 8080. Plugins may differ, so treat this as a simplification to verify on your cluster.
- Ingress ports are compared as the Pod receives them, the targetPort. This follows the API reference and the Service documentation.
- Not modeled: `ipBlock`, named ports, `endPort`, IPv6, `hostNetwork`, reply traffic (implicitly allowed for allowed connections), the rule that traffic from a Pod's own node is always allowed to an isolated Pod, explicit deny, and logging.
- Existing connections: whether a policy change affects a connection already open is implementation-defined. The figure does not show it.
- Propagation: a new Pod may start before the plugin applies its isolation, and nodes can briefly disagree. The figure applies every change at once.
- A probe is one request through ordered gates. It is not a reachability matrix or a policy query tool.

## Authoritative sources

- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/): isolation per direction, additivity, both-ends rule, default policies, the DNS caution, Pod lifecycle, and limits. Documentation reviewed 2026-10-12.
- [NetworkPolicy API reference](https://kubernetes.io/docs/reference/kubernetes-api/networking/network-policy-v1/): meanings of `ports` for ingress and egress, and the `policyTypes` defaults. Documentation reviewed 2026-10-12.
- [Service](https://kubernetes.io/docs/concepts/services-networking/service/): `port` and `targetPort`. Documentation reviewed 2026-10-12.
- [Debugging DNS Resolution](https://kubernetes.io/docs/tasks/administer-cluster/dns-debugging-resolution/): the `k8s-app=kube-dns` label and the kube-dns Service. Documentation reviewed 2026-10-12.
