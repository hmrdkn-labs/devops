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
