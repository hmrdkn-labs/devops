# Services, cluster DNS, and ingress

Pod IPs are routable identities but are replaceable. A Service selects a logical
set of Pods and gives clients a stable virtual IP and DNS name. EndpointSlice
objects record the concrete backend addresses and readiness information.

The data plane, commonly kube-proxy or an eBPF implementation, steers traffic
sent to the Service address toward one eligible endpoint. The Service object
does not create an application listener inside a Pod and does not repair an
incorrect selector.

Service types express exposure:

- `ClusterIP` is the cluster-internal default.
- `NodePort` opens a port on participating nodes.
- `LoadBalancer` asks an integration to provision or configure an external
  load balancer, often building on NodePort or direct pod routing.
- `ExternalName` returns a DNS alias and has no selector.

An Ingress describes HTTP and HTTPS routing by host and path. It does nothing
without an Ingress controller that watches the API and programs a proxy or load
balancer. Gateway API generalizes this model with explicit infrastructure and
route roles.

~~~text
client name → Service DNS → virtual Service address
                         → data plane → ready Pod endpoint
external HTTP → load balancer / ingress controller → Service → Pod
~~~

Debug each relationship: DNS record, Service port and targetPort, selector,
EndpointSlice membership, readiness, network policy, and actual application
listener.

## Read the port mapping rather than guessing from the image

Suppose `catalog` exposes Service `port: 80`, forwards to `targetPort: 8080`,
and selects `app: catalog`. A client uses the Service address on port 80;
the selected Pod process must actually listen on 8080. An image's `EXPOSE`
metadata or a Pod's `containerPort` declaration does not start a listener,
publish a port, or create a Service.

A normal ClusterIP Service has a stable virtual address; a headless Service
(`clusterIP: None`) lets DNS expose endpoint addresses instead of that virtual IP.
Clients and workload-specific discovery logic must account for the distinction.
Cluster DNS, commonly CoreDNS, answers Service-name queries; it does not proxy
each application HTTP request.

Read-only checks include `kubectl get service catalog -n sandbox`,
`kubectl get endpointslices -n sandbox -l kubernetes.io/service-name=catalog`,
and the Pod's readiness/events. A healthy endpoint list is configuration/state
evidence; a request from the intended client tests the exercised network path.

## Ingress, a gateway, and a service mesh are different boundaries

An Ingress/Gateway commonly handles entry traffic into the application system.
A service mesh commonly manages communication among participating workloads.
They may share proxy technology but have different scopes; Envoy can implement
an entry gateway or a workload-side proxy depending on where it is deployed.

For an Istio sidecar example:

```text
external browser -> gateway proxy -> catalog proxy -> catalog app
catalog app -> catalog proxy -> inventory proxy -> inventory app
mesh control plane -> configuration/certificates for participating proxies
```

The mesh control plane configures communication; proxies execute it. A route
change that sends 10% of requests to a canary version needs matching workload
labels, eligible endpoints, and proxy configuration. Creating the route object
alone does not prove the ratio or the request outcome. Verify traffic counters
and responses over a meaningful sample.

To understand a mesh demo, identify the control plane, the workloads enrolled
in its dataplane, the proxy placement, and the exact request being tested.
Compare that request before and after one policy/route change. Mutual TLS,
timeouts, or retries do not remove the need for application-level authorization
and safe retry semantics. Installing a mesh is optional; ordinary Kubernetes
Services and Pod networking work without it.
