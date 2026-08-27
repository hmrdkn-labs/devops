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
