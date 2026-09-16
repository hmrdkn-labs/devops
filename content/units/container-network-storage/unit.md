# Container networking and storage

A container normally receives its own network namespace. It has interfaces,
addresses, routes, sockets, and loopback distinct from the host. A virtual link
connects that namespace to a bridge, overlay, or other CNI-managed data plane.

A process listening inside the container does not automatically listen on the
host. Port publication installs forwarding or proxy behavior from a host
address and port to the container endpoint. In Kubernetes the pod network
usually provides direct pod addressing, and Services supply stable discovery
and load distribution instead of publishing every pod port on every node.

Storage has a similar boundary. The container writable layer is tied to that
runtime object. A **bind mount** exposes a chosen host path directly. A managed
**volume** gives storage an identity and lifecycle outside the container while
letting the runtime choose its host location.

~~~text
container process
├─ network namespace → virtual interface → network data plane
└─ mount namespace
   ├─ image + writable layer
   └─ explicit volume or bind mount
~~~

Host mounts can bypass the filesystem isolation expected by the image and
should be narrowly scoped. Likewise, host networking removes much of the
network-namespace boundary and creates port collisions.

Durability and availability are separate. A volume may survive container
replacement but still be attached to one failure domain. Kubernetes storage
classes and cloud volume topology later make that placement constraint
explicit.

## Worked case: One host endpoint, two different storage lifetimes

Assume a current Linux Docker Engine 28+ bridge setup, a retained named volume, and a marker not present in the image. Older Engine versions have documented localhost-publication caveats.

~~~text
host publication: 127.0.0.1:18080 → container TCP :8080
application bind: 0.0.0.0:8080 in container namespace
/data → named volume notes → marker-data
/tmp → container writable layer → marker-temp
~~~

The host's loopback endpoint provides the intended local entry path. Runtime networking supplies the forwarding; the namespace-local application socket accepts the resulting connection. Recreate the container while reattaching `notes`: marker-data remains and marker-temp disappears. Read port bindings and mount metadata before probing or removing anything. A volume attached to a different host is not automatically replicated; survival of container replacement is not proof of failure-domain availability.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
