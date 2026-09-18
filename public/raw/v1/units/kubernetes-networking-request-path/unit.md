# Kubernetes networking request path

Kubernetes networking becomes manageable when you stop treating "networking" as one component.

Four responsibilities are commonly involved:

1. **Pod connectivity** — a CNI-compatible network implementation gives Pods usable network interfaces and routes/connectivity according to the cluster design.
2. **Service discovery and selection** — DNS gives a stable name; a Service selects matching backends; EndpointSlices hold concrete endpoint addresses and readiness information.
3. **Service forwarding** — kube-proxy or another dataplane programs how traffic for a Service address reaches eligible endpoints.
4. **North-south HTTP routing and policy** — an Ingress/Gateway implementation handles configured external routing; NetworkPolicy can restrict allowed Pod traffic when the network implementation enforces it.

## CNI is an interface; the installed network is an implementation

The **Container Network Interface (CNI)** defines how a runtime integration calls
network plugins to configure a container network namespace. In a typical
Kubernetes cluster, the CRI runtime invokes the configured CNI plugin while
creating the Pod sandbox. The plugin and related node agents establish interfaces,
addresses, and the connectivity needed by the implementation. The kubelet is not
itself an overlay packet-forwarding service.

```text
scheduler assigns Pod -> kubelet asks runtime to create Pod sandbox
  -> runtime's network integration invokes CNI plugin
  -> interfaces/IPAM/routes are configured -> containers use Pod networking
traffic then follows the installed network's routing/overlay/dataplane
```

**IPAM** is IP-address management: selecting and tracking addresses without
collisions. Implementations can use routed Pod networks, overlays that encapsulate
traffic between nodes, or cloud-network integration. Networking and policy may
come from the same product or different compatible components.

The course's Weave example is a concrete overlay-network implementation to
recognize, not a Kubernetes requirement or a recommendation to install an old
demo version. Product support and version compatibility change. The durable
skill is distinguishing the interface, address management, routing/encapsulation,
and enforcement responsibilities. Use the selected implementation's current
documentation before choosing or operating it.

A failed sandbox/network setup can prevent a Pod from starting. Inspect Pod
events and the installed node network agents before changing Service selectors:
Service selection cannot repair a missing Pod interface. Later, a usable Pod
interface still does not prove inter-node connectivity or application success.

## Why Pod IPs matter

Assigning only node IP addresses would force every application replica to share a node-level identity and require extra port mapping or proxy indirection for all Pod-to-Pod communication. The Kubernetes networking model instead gives each Pod its own network identity within the cluster network model.

That does not make Pod IPs durable. A replacement Pod may receive a different IP. Stable discovery therefore lives one layer above the Pod through Services and DNS.

## Trace one in-cluster request

Assume a client Pod calls `http://catalog.default.svc.cluster.local:8080`.

```text
client Pod
  -> DNS lookup through cluster DNS
  -> Service name resolves to a stable Service address
  -> Service dataplane matches that destination
  -> one ready endpoint from EndpointSlice is selected
  -> cluster network carries packets to the destination Pod IP
  -> application process listening on targetPort handles the request
  -> response returns to the client
```

Several things can break independently:

- DNS may fail even while the Service and endpoints are correct.
- A Service selector may match zero Pods.
- Pods may match but be unready, leaving no usable endpoints.
- `port` and `targetPort` may disagree with the process listener.
- NetworkPolicy may deny the flow.
- The application may accept TCP but return an HTTP error.

## External HTTP adds another routing layer

Ingress and Gateway API resources describe HTTP/TLS routing intent. A controller or managed integration translates that intent into a proxy or load balancer configuration. The API object itself is not the live proxy.

```text
external client
  -> DNS / public address
  -> load balancer or ingress/gateway dataplane
  -> host/path rule
  -> Service
  -> ready endpoint
  -> Pod
```

The exact implementation matters. A cloud load balancer may target nodes, Pod IPs, or another proxy depending on the controller and configuration.

## NetworkPolicy is allowed-connectivity intent

NetworkPolicy selects Pods and describes allowed ingress and/or egress flows. Policies only have effect when the cluster network implementation supports enforcement. A namespace boundary alone is not a network firewall.

When debugging, inspect from stable intent toward concrete execution: DNS result → Service → EndpointSlice → Pod IP/readiness → policy → listener → real request.
