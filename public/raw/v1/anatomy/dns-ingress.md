## The big picture

Pods are replaceable. They are created, replaced and rescheduled, and each gets its own IP address, so a client cannot hard-code where an application lives. Kubernetes gives clients two stable handles. A **name** resolves through cluster DNS to a **Service** address (its ClusterIP). The Service forwards traffic to the Pods that are currently **Ready**. A name answer alone proves neither that a Pod exists nor that one is ready.

External HTTP needs one more layer. A browser resolves a public hostname through public DNS, not cluster DNS. That address must be listened on by an **ingress controller**, and the controller routes requests using an **Ingress** object (or a Gateway API route) that it implements. Creating the Ingress object alone does nothing.

The figure is a switchboard for one namespace, an original teaching fixture rather than a recording of a cluster. A drawer at the left stands for the client Pod's resolver trying name candidates in order; a lit notch marks the candidate that answered. The centre panels are Services; the web panel forwards only to Ready jacks. The two right-hand bins are Pods, lit when Ready. The gate at the front is the edge controller, with three lamps: the controller is running, a rule exists for the requested host, and the TLS secret is present. The card is the request. It moves only as far as its checks allowed.

Fixture contents: namespace `shop` holds a client Pod, Service `web` (ClusterIP port 80, targetPort 8080, selector `app: web`) and two Pods, `web-7c9d4-k2xqp` and `web-7c9d4-w8mvn`. Namespace `billing` holds Service `ledger`. An edge controller runs for ingress class `edge-proxy`.

## Who owns what

- **Application team** writes the Service (selector, ports) and the Ingress (host, path, backend, TLS block). Pods carry the labels that the selector matches.
- **kubelet** writes each Pod's resolver configuration (search domains and `ndots`) and runs readiness probes, whose result sets a Pod's Ready condition.
- **Cluster DNS**, commonly CoreDNS, answers Service and Pod names. It does not proxy each HTTP request.
- **EndpointSlice controller** keeps the Service's EndpointSlices listing Pod addresses and readiness.
- **Data plane**, such as kube-proxy or an eBPF implementation, steers traffic sent to a ClusterIP toward one eligible endpoint.
- **Ingress controller** (or Gateway controller) reads the routing objects and programs a proxy or load balancer. Only a controller that implements the object's class acts on it.
- **Cluster operator** installs and runs that controller and its IngressClass or GatewayClass.
- **Domain owner** manages the public DNS records. Those records are outside the cluster.

## How it works

**Inside the cluster.** The client Pod asks for `web`. Its resolver configuration lists the search domains `shop.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5`. A name with fewer than five dots is first tried with each search domain appended, and the bare name comes last. The first candidate, `web.shop.svc.cluster.local`, has a record, so the answer is the ClusterIP of Service `web`. The drawer lights notch 1, and the card moves to the Service panel.

Short names reach only the client's namespace path. `ledger` from shop tries `ledger.shop.svc.cluster.local`, `ledger.svc.cluster.local`, `ledger.cluster.local` and finally `ledger.`, and none matches, because `ledger` lives in billing. `ledger.billing` gets its namespace from the query: the first expansion, `ledger.billing.shop.svc.cluster.local`, misses and `ledger.billing.svc.cluster.local` answers. The absolute form `ledger.billing.svc.cluster.local.` ends with a dot, so it is not expanded at all.

The name answer is the Service's ClusterIP, which exists whether or not any Pod is Ready. The data plane then forwards a connection for `10.96.20.10:80` to one endpoint in the ready set, and the Service port 80 maps to targetPort 8080 on that Pod. An empty ready set leaves nothing to receive the connection, even though the name still resolves.

**From outside.** Six checks run in order, and the card stops at the first failure:

1. Public DNS points the requested host at the controller's address. Cluster DNS is not consulted.
2. A controller for the class is running and listening there. Without one, nothing answers.
3. The controller presents a certificate for the requested host from the TLS secret `shop-tls`. Ingress assumes TLS ends at the ingress point; traffic from the controller to the Service and its Pods is plaintext in that model. TLS comes before the Host rule because a real controller completes the handshake first: SNI chooses the certificate before the Host header is read. The fixture models only whether `shop-tls` is present. With `other.example.com`, the `tls` block does not cover the host, and the certificate the controller presents is controller-specific.
4. The controller finds an Ingress rule that matches the Host header and path. The fixture has one rule: `shop.example.com`, path `/` with `pathType: Prefix`, backend `web` on port 80. With no matching rule and no default backend, the controller returns its own default response, commonly a 404.
5. Service `web` exists. The controller routes to the Service named in the backend.
6. A Ready endpoint of `web` receives the request. How the controller reaches endpoints (through the Service address or the EndpointSlices) is controller-specific.

**Gateway API.** The Ingress API is generally available but frozen; it receives no new features. The Kubernetes project recommends Gateway API, a set of add-on kinds implemented as custom resources. A GatewayClass names the controller that manages a class of gateways, a Gateway defines a listener, and an HTTPRoute (or GRPCRoute) maps requests to backends such as Services. The same questions apply: which controller implements the class, which listener accepts the host, which route matches, and which endpoints receive the request.

## YAML example

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: 8080
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shop
  namespace: shop
spec:
  ingressClassName: edge-proxy
  tls:
    - hosts:
        - shop.example.com
      secretName: shop-tls
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

- `selector: app: web` decides which Pods can become endpoints. A Pod without that label is never a backend, even if it is Ready.
- `port: 80` is the port clients use at the ClusterIP; `targetPort: 8080` is the Pod port that receives forwarded traffic. Neither field starts a listener in the container.
- `ingressClassName: edge-proxy` names the class whose controller acts on this Ingress. Without a running controller for that class, the object has no effect.
- `tls.secretName: shop-tls` names the Secret the controller reads to terminate TLS for `shop.example.com`.
- `rules[0].host` and `path: /` with `pathType: Prefix` decide which requests match. The requested Host must match exactly, since this is not a wildcard.
- `backend.service.name: web` and `port.number: 80` name the Service and Service port the controller forwards to.

The Pod template, readiness probes and the application listener are outside this manifest. They determine Ready and whether port 8080 answers.

## Try these changes

1. Set **Name the client asks for** to `ledger`, then press **Resolve name from client Pod**. No candidate matches, and the card stays in the drawer. Change the name to `ledger.billing` and press again: the second candidate answers, and the card reaches the billing Service.
2. Untick both **Ready** boxes behind Service web, then press **Send in-cluster request**. The name still answers `10.96.20.10`, but the card stops at the Service because the ready set is empty. The result separates name resolution from reachability.
3. Untick **Secret shop-tls present** and press **Send external HTTP request**. The card stops at the gate at the TLS check, before the rule and Service checks; Service web and the Pods are never reached. What the client sees at the gate is controller-specific. Restore the secret, then untick **Edge controller running**: public DNS still points at the address, but nothing listens there, so the card never enters the gate.
4. Set **Requested host** to `other.example.com` and send an external request. The Ingress object is still applied, but no rule matches the host. The fixture has no default backend, so the controller returns its own default response, commonly a 404.

## Misconceptions

- **"An Ingress object routes traffic by itself."** It is stored configuration. The docs say that only creating an Ingress resource has no effect; a controller that implements its class must watch it and program a proxy or load balancer.
- **"If the name resolves, the application is reachable."** The name resolves to the Service's ClusterIP. Forwarding needs a Ready endpoint, the listener on the target port, and a network path that policy allows. Name resolution proves only the first of those.
- **"A short name finds a Service in any namespace."** A short name expands through the client's search path, which starts with the client's own namespace. Other namespaces need the namespace in the name.
- **"TLS on the Ingress encrypts traffic all the way to the Pod."** The Ingress model terminates TLS at the ingress point. Traffic from there to the Service and its Pods is plaintext unless something else encrypts it.
- **"Ingress is where new routing features go."** The Ingress API is frozen, and the Kubernetes project recommends Gateway API for new routing work.

## Safe read-only observation

```sh
kubectl get svc web -n shop -o wide
kubectl get endpointslices -n shop -l kubernetes.io/service-name=web
kubectl get pods -n shop -l app=web -o wide
kubectl get ingress shop -n shop
kubectl describe ingress shop -n shop
kubectl get ingressclass edge-proxy -o yaml
```

**Limit:** `get svc` shows the ClusterIP and ports but not whether any Pod is Ready; the EndpointSlice and Pod READY columns show that. An empty ADDRESS on the Ingress does not prove that no controller exists, because the address is written only after a controller updates the status and the behaviour is controller-specific. Each command is a snapshot, and none of them sends a request or tests DNS from the client. Running `nslookup` inside the client Pod uses `kubectl exec`, which runs a process in the container; use it only where you are authorized, and treat its result as a test rather than a read. This page has not run any of these commands against a live cluster.

## Predict and transfer

Service `web` exists in shop with both Pods Ready, the controller runs for `edge-proxy`, and the Ingress applies a rule for `shop.example.com` to `web:80`. Now delete the Service but leave the Ingress and the controller in place. **Prediction:** the name `web.shop` stops answering, and the external request reaches the controller, matches the rule, and then stops at the backend check. The fixture has no Service `web` to route through, so the request does not reach the Pods, even though they still run and are Ready.

Second prediction: restore the Service and set both Pods to Not Ready. The name still answers, the controller still matches the rule, and the request stops at the Ready-endpoint check. The Service and Ingress are correct; readiness is the blocker.

Continue with [Service endpoints](/anatomy/service-endpoints/) to see what a Service name resolves to and why, and with [Network policy](/anatomy/network-policy/) for why traffic can still be blocked after routing succeeds. The unit links below cover the underlying objectives; exploring this object does not record mastery.

## Assumptions and limits

- The fixture has one client Pod, one backend Service with two Pods, one billing Service, and one edge controller with one rule. IP addresses are fixture values: 10.96.x for ClusterIPs, 10.244.x for Pod IPs, and 203.0.113.10 from the documentation range for the edge.
- The data plane chooses the first Ready endpoint in name order. A real data plane may choose differently and may change its choice.
- The search-path order follows the documented search list and `ndots` behaviour. Resolver libraries differ in retry details, and caching, TTLs and negative caching are not modelled.
- TLS is checked before host matching, as a real controller does: SNI selects the certificate before the Host header is read. The fixture models only whether Secret `shop-tls` is present; per-host certificate selection and any default certificate a controller serves are not modelled.
- Path precedence, annotations, default backends, IngressClass parameters, Gateway listeners and controller-specific behaviour are not modelled.
- NetworkPolicy, the application's listener on 8080 and HTTP responses are not simulated. Ready is a switch, not a probe.
- The fixture does not run commands, persist learner data or claim live verification. The review date records documentation review, not cluster observation.

## Authoritative sources

Public documentation review: **2026-10-12**. This date records documentation review, not cluster observation.

- [Kubernetes: DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/) — record types, namespace-scoped names, the resolver search list and `ndots`, and the Pod DNS policy default.
- [Kubernetes: Service](https://kubernetes.io/docs/concepts/services-networking/service/) — selectors, `port` and `targetPort`, ClusterIP as the default type, and EndpointSlices.
- [Kubernetes: Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) — the controller prerequisite, rules and path types, TLS termination at the ingress point, and the frozen API.
- [Kubernetes: Gateway API](https://kubernetes.io/docs/concepts/services-networking/gateway/) — the resource model and the recommended successor to Ingress.
