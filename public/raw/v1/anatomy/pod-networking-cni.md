## The big picture

Kubernetes requires that every Pod gets its own cluster-wide IP address, that Pods reach each other without NAT, and that containers inside one Pod share that address and reach each other on `localhost`. The Kubernetes API declares this model. It does not build the packet path on each node. The **container runtime** creates the Pod's network namespace and calls the node's **CNI plugin**. The plugin wires an interface into that namespace, assigns the address, and works with the cluster's network implementation so that Pod IPs route between nodes. The kubelet drives the sequence through the runtime, but it does not configure the network itself: since Kubernetes 1.24 the kubelet no longer manages CNI plugins.

So the question for this page is: when a Pod has an IP, who gave it that IP, what must exist before a request reaches it, and which component owns the failure when a request does not arrive?

Four owners answer that. The CNI plugin provides Pod connectivity. kube-proxy forwards Service addresses to ready endpoints. A NetworkPolicy object states intent, and only the installed network implementation enforces it. The kubelet starts containers only after the sandbox has networking.

Pod IPs are ephemeral. A replacement Pod is a new object with a new UID and, in general, a new IP. That is why clients address a Service rather than a Pod IP.

The figure is an **authored fixture**, not a cluster recording. It has two nodes, `node-a` (10.244.1.0/24) and `node-b` (10.244.2.0/24), and two Pods: `client` on node-a and `api` on node-b. Pod names and identities such as `u2` are readable stand-ins for real UIDs. Addresses are assigned in order from each node's fixture range. Nothing is sent to a real cluster, and no button submits a Kubernetes request.

## Who owns what

- **The workload controller** that owns `api` (a Deployment or ReplicaSet, not drawn) creates the replacement Pod object from its template. It does not touch networking.
- **kube-scheduler** sets `spec.nodeName`. That is assignment only: the Pod is bound, but it has no sandbox, no address and no containers yet.
- **kubelet on the node** asks the runtime for a Pod sandbox through the Container Runtime Interface, starts the containers once the sandbox is ready, reports `status.podIP` and the conditions, and runs the readiness probe.
- **Container runtime** creates the sandbox's network namespace and invokes the CNI plugin that the node is configured to use.
- **CNI plugin and its IPAM** (IP address management) create the interface, allocate an address from the node's range, and configure the routes the implementation needs. Commonly the interface is one end of a veth pair whose other end attaches to a bridge or the node's dataplane.
- **kube-proxy** programs the node's forwarding for Service addresses, using Service and EndpointSlice objects. It is one implementation of Service proxying. It does not create interfaces, assign Pod addresses or route Pod-to-Pod traffic.
- **The network implementation** routes Pod IPs between nodes and, where it supports NetworkPolicy, enforces policy objects. The API server stores a NetworkPolicy but does not filter packets.

## How it works

### Start state

`client` runs on node-a with address `10.244.1.4`. `api` runs on node-b with address `10.244.2.7`. Both are Ready. The CNI plugin on each node gave its Pod the address during sandbox setup. The fixture has no Service request and no NetworkPolicy yet.

### The Pod setup path

A new Pod crosses six boundaries, and each boundary has one owner:

| Stage | What is true | Owner of the step |
| --- | --- | --- |
| created | Pod object exists; no `nodeName`, no sandbox, no address | Workload controller |
| bound | `spec.nodeName` is set; still no sandbox and no address | kube-scheduler |
| sandbox | The runtime created the Pod sandbox (network namespace); no address yet | kubelet through CRI |
| networked | The CNI plugin wired the sandbox and allocated the Pod IP; `PodReadyToStartContainers` is True | Container runtime calling CNI ADD |
| running | Containers started in the shared namespace; phase Running; `podIP` reported; Ready is still False | kubelet and runtime |
| ready | Readiness probe passed; the Ready condition is True and the EndpointSlice serves the endpoint | kubelet, then the EndpointSlice controller |

Assignment is not Running, and Running is not Ready. A bound Pod has no network. A networked Pod has an address that nothing listens on until its containers start. A Running Pod can receive a direct request to its IP, yet it is not a Service endpoint until it is Ready.

### Delete and replace: the address does not come back

Deleting `api` ends its sandbox. The runtime calls the CNI plugin to release the interface and address, so `10.244.2.7` is released. The UID `u2` never returns. The workload controller then creates a replacement, `u3`. The fixture binds it to node-b, so the path remains cross-node. The sandbox and the CNI ADD step give `u3` the next address from node-b's range, `10.244.2.8`. A client that cached `10.244.2.7` now reaches nothing, while a Service keeps a stable address and changes only its endpoints.

Real IPAM implementations may reuse a released address. The fixture never reuses one, and no workflow should depend on either behaviour.

### Two request paths

A **direct** request goes to the Pod IP. The packet crosses the client's interface, the node-a route to node-b's range, the node-b network implementation (where a NetworkPolicy would be checked), and finally the api listener. This path does not pass through kube-proxy and does not use NAT.

A **Service** request goes to the Service address `10.96.0.20:80`. kube-proxy on the source node (node-a) has a rule that maps the Service address to an endpoint. kube-proxy programs that rule from the EndpointSlice objects it watches. An EndpointSlice entry is serving only while its Pod's Ready condition is True, and the Service path uses only serving endpoints, so a Pod that is Running but not Ready is left out of the Service path. The figure checks the endpoint as a separate hop after the kube-proxy hop. That order is a fixture simplification: in a real node the rule already reflects the membership. After the rule chooses an endpoint, the request follows the same Pod-to-Pod path as the direct request.

The two paths differ in ownership. The direct path stops at the CNI route, the policy check or the listener. The Service path also depends on kube-proxy's rule and on EndpointSlice membership. Stopping kube-proxy breaks the Service path and leaves the direct path intact.

### A missing CNI plugin blocks new sandboxes

Removing the plugin from node-b does not change the Pod that already runs there, and the fixture does not model existing Pods as changed. It does stop new sandboxes on node-b. When the replacement reaches the networked step, the runtime cannot run CNI ADD. The Pod stays in sandbox with no address and no containers. Installing the plugin lets the next step wire the sandbox. A failed sandbox setup therefore prevents a Pod from starting, and Service selection cannot repair it.

### NetworkPolicy: intent and enforcement are separate

Creating `api-deny-ingress` stores a policy that selects `app: api` Pods for Ingress and allows no source. Its effect depends on the installed network implementation:

- If the CNI enforces NetworkPolicy, node-b drops the packet from node-a. The gate in the figure closes across the link.
- If the CNI does not enforce it, the object is accepted and has no effect. The gate is drawn as a ghost: the object exists, and traffic is unchanged.

Switching the installed CNI changes enforcement without touching the object. The Ready condition does not change either, because policy decides whether a packet is allowed, not whether a Pod is Ready.

### Reading the figure

Each interaction produces a ChangeReport with what changed, who acted, why, and what has not happened. The stage track shows the `api` Pod's position in the six boundaries. The node cards show each node's CNI plugin, kube-proxy and Pods. The request ledger names the first failing hop and its owner, and the hops after it are marked as not tested. The YAML panel shows the `api` Pod and the NetworkPolicy from the same model state, and it highlights the fields the last interaction read or changed. When the policy is created and `api` is Ready, the panel shows exactly the YAML example below.

Reduced motion shows the final pose at once. Offscreen or hidden-tab motion pauses. The page saves no progress and makes no network calls.

## YAML example

This is the document the panel shows once `api` is Ready and `api-deny-ingress` exists. The Pod is shown as the API returns it, with status fields. The `uid` is a fixture stand-in.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: api
  uid: u2   # fixture stand-in
  labels:
    app: api
spec:
  nodeName: node-b
  containers:
    - name: app
      image: registry.example.com/api:1.4
    - name: log-shipper
      image: registry.example.com/log-shipper:0.9
status:
  phase: Running
  podIP: 10.244.2.7
  conditions:
    - type: PodReadyToStartContainers
      status: "True"
    - type: Ready
      status: "True"
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-deny-ingress
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
```

- `spec.nodeName` is written by the scheduler. Once it is set, the kubelet on that node owns the Pod's lifecycle. It is not a placement guarantee for a replacement.
- `status.podIP` is the address allocated to the Pod. It is empty until the networking step completes.
- `PodReadyToStartContainers` is True after the sandbox and its network are configured. It is a separate condition from `Ready`.
- `Ready` is the readiness condition. The EndpointSlice serves the Pod only while it is True.
- `policyTypes: [Ingress]` with no `ingress` rules isolates `api` for Ingress: only traffic from the Pod's own node is still allowed. In the fixture, client traffic from node-a is not.

## Try these changes

1. **Replace, then step through setup.** Press **Delete api Pod**. Expect the ChangeReport to say `10.244.2.7` was released and no Pod holds it. Press **Step pod setup** six times. Expect: the replacement `u3` created with no `nodeName`, then bound to node-b, then a sandbox with no address, then `10.244.2.8` from node-b's range, then Running with `podIP` reported and Ready still False, then Ready.
2. **Remove the plugin, then try to network a Pod.** Delete the api Pod, step to sandbox, press **Remove CNI plugin from node-b**, and step again. Expect the step to fail with no address, and the stage track to stay at sandbox. Install the plugin and step again: the address is allocated and the Pod continues.
3. **Running is not Ready.** Delete and step until `u3` is Running but not Ready. Send a direct request to its IP: it reaches the listener. Send a Service request: it stops at the ready-endpoint hop, because a Pod that is not Ready is not a serving endpoint. Step once more to make it Ready and repeat the Service request.
4. **Stop kube-proxy on node-a.** Send a Service request and expect it to stop at the kube-proxy rule. Then send a direct request to the Pod IP and expect it to be delivered. The Pod network is intact; the Service forwarding is not.
5. **Create the policy with and without enforcement.** With **Installed CNI** set to *Enforces NetworkPolicy*, create `api-deny-ingress` and send a direct request: it stops at the NetworkPolicy hop, and the gate closes. Switch the installed CNI to *Does not enforce*. The object is unchanged, and the same request is delivered.

## Misconceptions

- **“kube-proxy gives Pods their IP addresses.”** No. The CNI plugin wires the sandbox and allocates the address. kube-proxy forwards Service addresses, and some clusters replace it with the network implementation's own proxy.
- **“The kubelet configures Pod networking.”** The kubelet asks the runtime for a sandbox. The runtime invokes the CNI plugin. Since Kubernetes 1.24 the kubelet does not manage CNI.
- **“A bound Pod already has networking.”** Binding is a scheduling decision. Networking happens in sandbox setup, after binding.
- **“The replacement is the old Pod with its old IP.”** A replacement is a new object with a new UID. Its address comes from a new allocation, and the old address stays released.
- **“Ready means the Pod can be reached.”** Ready decides EndpointSlice membership for Services. The fixture's direct Pod-IP path does not check Ready, but a listener must still exist.
- **“Creating a NetworkPolicy blocks traffic.”** The object is only intent. Enforcement needs a network implementation that supports NetworkPolicy. Without one, the object is accepted and has no effect.

## Safe read-only observation

In a cluster you are authorized to inspect, replace `demo`, `api` and `app=api` with your namespace, Pod name and label:

```sh
kubectl get pods -n demo -l app=api -o wide
kubectl get pod api -n demo -o jsonpath='{.metadata.uid}{"\n"}{.spec.nodeName}{"\n"}{.status.podIP}{"\n"}'
kubectl get endpointslices -n demo -l kubernetes.io/service-name=api -o yaml
kubectl get networkpolicy -n demo
kubectl describe pod api -n demo
```

Read `-o wide` for the node and IP each Pod was given. Read the Pod's `metadata.uid` to see the identity, and `status.conditions` for `PodReadyToStartContainers` and `Ready`. In the EndpointSlice, read each endpoint's `conditions.ready`. `kubectl describe pod` shows events, including sandbox or network setup failures.

**Limit:** these are independent snapshots, not an ordered trace. `-o wide` shows the address reported in status; it does not prove that a route from another node works. The EndpointSlice shows membership at one moment. `kubectl get networkpolicy` shows the stored object, not whether the installed CNI enforces it. To check enforcement, read the CNI's own documentation and its node-level status. The fixture does not run these commands and does not claim their output.

## Predict and transfer

Start with the figure's start state. Delete `api`, then predict before each step which owner acts and which field or address changes. Then predict the outcome of each request:

- While the replacement has no address, which hop stops a direct request, and which owner must act before that hop can pass? Does a Service request stop at the same hop?
- When `api` is Running but not Ready, which path can succeed, and why?
- With the CNI enforcing a policy, which node's implementation drops the packet? Does the decision depend on the source node's kube-proxy?

Now transfer the same reasoning to a real incident. A team reports that a Service is unreachable after a rollout, and that a direct request to one Pod IP works from a Pod on another node. Which hop has been ruled out, and which owners remain? A second team sees a new Pod stuck with no IP and an event that mentions network setup. Which owner should you inspect first, and why would changing the Service selector not help?

## Assumptions and limits

- The fixture's node ranges and addresses are illustrative. Real ranges depend on the cluster and the plugin. The Network Plugins page's example asks host-local IPAM to use the node's Pod CIDR (`"subnet": "usePodCidr"`), so the range is per node.
- Addresses are allocated sequentially in the fixture and released addresses are never reused. Real IPAM may reuse them.
- Inter-node routes are assumed to be programmed. The fixture does not model route, overlay or node-agent failures.
- Removing the CNI plugin affects new sandboxes only. Existing Pods keep their networking in the model, which is a simplification.
- Stopping kube-proxy removes Service rules on that node in the model. In a real cluster, existing rules may persist until they are next synchronized.
- The Service address `10.96.0.20` and its single endpoint are fixture values. Real Service addresses come from the API server's Service range, and a Service may have many endpoints.
- Readiness is a fixture event with no probe timing. The Ready condition decides EndpointSlice membership, as described in the EndpointSlice documentation.
- The request is a reachability check to one listener, not an HTTP call. The policy is one Ingress rule with no allowed sources. Egress isolation, namespaces and selectors other than `app: api` are not modelled.
- The packet paths are schematic. They show ownership, not a trace of real forwarding.
- A stop shows the first failing check in this model. In a real cluster, several components can be wrong at once; use the read-only observations to confirm each hop.

This page supports the course objectives [request-path boundaries](/learn/kubernetes-networking-request-path?mode=reference) (`fpp:kubernetes-networking-request-path/boundaries`) and [container network boundary](/learn/container-network-storage?mode=reference) (`fpp:container-network-storage/network-boundary`). Exploring this fixture does not record evidence for those objectives. For how Service addresses select ready endpoints, see [Services and endpoints](/anatomy/service-endpoints/). For policy semantics, see [NetworkPolicy](/anatomy/network-policy/).

## Authoritative sources

Public documentation review, 2026-10-12. This is a documentation review, not a live-cluster observation. Original explanation and apparatus; no course assets or copied proprietary questions.

- [Kubernetes: Services, Load Balancing, and Networking — the network model, CNI, kube-proxy, NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/)
- [Kubernetes: Cluster Networking — Pod-to-Pod addressing without NAT and CNI implementation](https://kubernetes.io/docs/concepts/cluster-administration/networking/)
- [Kubernetes: Network Plugins — CNI requirement and the runtime-managed plugin model](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/)
- [Kubernetes: Pods — shared network namespace and IP per Pod](https://kubernetes.io/docs/concepts/workloads/pods/)
- [Kubernetes: Pod Lifecycle — sandbox, PodReadyToStartContainers, UID replacement](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Kubernetes: Pod API reference — `spec.nodeName`, `status.podIP`, phase](https://kubernetes.io/docs/reference/kubernetes-api/core/pod-v1/)
- [Kubernetes: kube-proxy — Service forwarding on each node](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/)
- [Kubernetes: EndpointSlices — serving and ready conditions for Pod endpoints](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [Kubernetes: Network Policies — enforcement requirement, isolation and node traffic](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
