## The big picture

Pods are replaceable: a ReplicaSet deletes and creates them, a readiness probe takes them in and out of service, and every new Pod gets a new name and IP. A client needs one address that does not change while the set of backends does. A Service provides that address and a selector. You set the selector, the ports and the type; the cluster decides which Pods are endpoints by continuously checking those Pods' labels and Ready condition. Pods can come and go without the Service's address moving.

Name lookup, HTTP host and path routing, and traffic rules are separate mechanisms: see [DNS and Ingress](/anatomy/dns-ingress/) and [NetworkPolicy](/anatomy/network-policy/).

## Who owns what

| Actor | Owns | Does not own |
|---|---|---|
| You or your tooling | The Service `selector`, `ports` and `type`; the Pod labels and readiness probe | Which Pods are endpoints at any moment |
| API server | Storing the Service; allocating its ClusterIP (and a node port for NodePort or LoadBalancer) | Choosing endpoints |
| kubelet | Running containers, running readiness probes, writing the Pod's Ready condition | The endpoint list |
| EndpointSlice controller | Recording every Pod that matches the selector in an EndpointSlice, with `conditions` (`ready`, `serving`, `terminating`) | Forwarding packets |
| kube-proxy (or another service proxy) | Programming each node's forwarding rules from EndpointSlices | Deciding readiness |
| ReplicaSet controller | Creating and deleting Pods to hold the replica count | The Service or its address |
| cloud-controller-manager | Provisioning an external load balancer for type LoadBalancer | Pod endpoints |

## How it works

1. You create Service `web` in namespace `shop`, with `selector: app: web` and port `80` mapped to `targetPort: 8080`. The API server stores it and allocates a ClusterIP. The ClusterIP is the Service's identity; it is not a Pod's IP.
2. The EndpointSlice controller watches Services and Pods. For each Pod whose labels match the selector, it records an endpoint in an EndpointSlice with conditions. `serving` follows the Pod's Ready condition. `terminating` is set when the Pod is deleted. `ready` is true only while the endpoint is serving and not terminating.
3. The kubelet runs the readiness probe and sets the Pod's Ready condition. Running is not enough: a Pod that is running but failing its probe is still recorded for the Service with `ready: false`, and it receives no traffic.
4. kube-proxy on each node watches EndpointSlices and programs forwarding rules for the ClusterIP. Proxies normally send only to ready endpoints. They fall back to serving-but-terminating endpoints only when every available endpoint is terminating, which helps avoid losing traffic during rolling updates.
5. A client sends to the ClusterIP on port 80. A rule chooses one ready endpoint, and the packet reaches the Pod on port 8080. The Service object does not make that choice; it describes the rule set. (The iptables mode picks at random by default. This fixture uses round robin.)
6. Pod churn changes the list, not the address. A replaced Pod has a new name and IP. Its old endpoint is removed, and the new one is recorded with `ready: false` until its readiness probe passes. Only then does it become a ready endpoint. The ClusterIP is unchanged.
7. If no Pod is both matching and Ready, there are no ready endpoints and nothing to forward to. The Service and its ClusterIP still exist.
8. Exposure adds paths, not endpoints. `NodePort` also allocates a node port from the default range 30000–32767, and every node forwards that port. `LoadBalancer` builds on the ClusterIP and node port, and asks the cloud provider for an external address through the cloud-controller-manager.

The Endpoints API is the older list of the same information. It is deprecated since Kubernetes v1.33, so learn EndpointSlices.

## YAML example

This is a fixture-sized manifest. The Service is what you apply. The Pod shows the template fields that matter here: its label, its container port and its readiness probe. The `status` block is what the cluster reports; it is never applied.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  type: ClusterIP            # no node port; the ClusterIP is the only address
  selector:
    app: web                 # Pods with this label are candidate endpoints
  ports:
  - name: http
    protocol: TCP
    port: 80                 # the port clients use on the ClusterIP
    targetPort: 8080         # the container port on the Pod
---
apiVersion: v1
kind: Pod
metadata:
  name: web-7c9d4-m4l7q      # a booth; a ReplicaSet names Pods like this
  namespace: shop
  labels:
    app: web                 # must equal the Service selector to be recorded
spec:
  containers:
  - name: web
    image: registry.example/web:1.4
    ports:
    - name: http
      containerPort: 8080
    readinessProbe:          # decides the Ready condition, and so the endpoint's ready
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 5
# observed by the cluster, never applied:
status:
  conditions:
  - type: Ready
    status: "True"
```

In a real cluster you would write the Pod template inside a Deployment, not a bare Pod; the bare Pod here is the fixture's booth.

## Try these changes

1. **Fail one probe.** Uncheck "Readiness probe passes" on `web-7c9d4-m4l7q`. Expected: that Pod keeps its name and stays recorded with `ready=false`, the ready endpoints drop to two, and the ClusterIP plate does not change. Repeated requests now reach only the other two booths.
2. **Change the selector only.** Set the Service selector to `app=web-next`. Expected: all three Pods stay Ready, but none carries the new label, so none is recorded. The ready endpoints drop to zero and a request is not forwarded. The desk number is unchanged.
3. **Delete one Pod.** Press Delete Pod on `web-7c9d4-r9t2z`. Expected: the old name stops being an endpoint at once (a real deletion first marks it terminating; see Assumptions), and `web-7c9d4-p7w4d` appears as NotReady and recorded with `ready=false`. Pass its probe to make it a ready endpoint. The new name is fresh; the booth and the Service address are reused.
4. **Relabel one Pod.** Uncheck "Label app=web" on one Pod. Expected: that Pod is still Ready but is no longer recorded in the EndpointSlice. This was a label change, not a readiness change, and the ChangeReport says which one it was.
5. **Change the type.** Choose `NodePort`, then `LoadBalancer`. Expected: a node port `30080` is added and the endpoints are unchanged. For `LoadBalancer` the external address stays pending, because this fixture has no cloud controller.

## Misconceptions

- **"A running Pod receives Service traffic."** Only ready endpoints do. Running is a container state; Ready is the condition that the endpoint's `ready` is derived from.
- **"Changing the selector or replacing Pods changes the Service's IP."** The ClusterIP belongs to the Service object. Pod churn and selector changes update the endpoints and the rules, not the address.
- **"An empty roster means the Service is broken or missing."** The Service exists and keeps its ClusterIP. It has no endpoints to forward to until a matching Pod is Ready.
- **"Endpoints is where to look now."** Endpoints is deprecated since v1.33. EndpointSlices are the current mechanism and what kube-proxy reads.
- **"NodePort and LoadBalancer route HTTP by host or path."** A Service forwards at the transport level. HTTP routing belongs to Ingress or the Gateway API; see [DNS and Ingress](/anatomy/dns-ingress/).
- **"Relabelling a Pod out of the roster is harmless to its ReplicaSet."** A label change can also take a Pod out of its ReplicaSet's selector. The ReplicaSet then creates a replacement. This fixture does not model that, so the figure will not show the extra Pod.

## Safe read-only observation

```bash
kubectl -n shop get service web -o wide
kubectl -n shop get endpointslices -l kubernetes.io/service-name=web -o yaml
kubectl -n shop get pods -l app=web -o wide
```

- The first command shows the type, the ClusterIP and the ports. It proves the address exists; it does not prove any Pod is ready.
- The second shows the EndpointSlice objects the controller wrote, including each endpoint's `conditions`. It shows what the control plane recorded, not what the node rules currently forward.
- The third shows the Pods' READY column, which is container readiness. It does not show which Services record a Pod.

Do not treat `curl` from a client Pod as a read-only check: it sends a request.

## Predict and transfer

All three `web` Pods start failing their readiness probe at the same time. Predict: the EndpointSlice still records all three Pods, each with `ready: false`, so no ready endpoint remains and new requests to `web:80` have nowhere to go. The ClusterIP and the Service name are unchanged, and the Pods still exist. Traffic returns when a Pod passes its probe, without any change to the Service. A label change on the same Pods would be a different cause with the same symptom, so check the Ready condition and the labels separately.

## Assumptions and limits

- The fixture's three Pods, the ClusterIP `10.96.40.12` and the port mapping are illustrative. Real ClusterIPs come from the cluster's service range.
- The round-robin choice stands in for kube-proxy's choice. Real modes (iptables, IPVS, nftables) pick differently.
- The probe checkboxes simulate probe results. Real probes have timing, thresholds and retries.
- Deleting a Pod removes it from the endpoints at once. Real deletion first marks the endpoint `terminating`, and proxies may still use it when no serving endpoint remains.
- Not modelled: the ReplicaSet reacting to a relabelled Pod, node placement, NetworkPolicy, DNS name resolution and the mapping from name to ClusterIP.
- The physical layout is explanatory. No desk, board or dial exists in Kubernetes.
- The documentation was reviewed on 2026-10-12. This is a documentation review, not a live cluster.

## Authoritative sources

- [Kubernetes: Service](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Kubernetes: EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [Kubernetes: Virtual IPs and Service Proxies](https://kubernetes.io/docs/reference/networking/virtual-ips/)
- [Kubernetes: Pod Lifecycle (readiness)](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Kubernetes: ReplicaSet (isolating Pods from a ReplicaSet)](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
