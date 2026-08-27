# Ports, sockets, and DNS

An IP address gets a packet to a network interface. A transport protocol and
port identify the receiving endpoint on that host. A process asks the kernel
to create a socket, binds it to an address and port, and listens for incoming
connections or datagrams.

Binding to `127.0.0.1` accepts only local traffic. Binding to an interface
address accepts traffic delivered there. Binding to a wildcard address asks the
kernel to listen on all suitable local addresses. “The port is open” is
therefore incomplete: inspect the protocol, address, network namespace, and
owning process.

TCP identifies a connection by source address, source port, destination
address, and destination port. Many clients can connect to one server port
because their source endpoints differ.

## DNS gives records, not reachability

DNS maps a name to records such as A or AAAA addresses. Resolution may succeed
while the connection fails because the route, firewall, listener, TLS identity,
or application is wrong. It may fail while direct IP connectivity still works.

In Kubernetes, cluster DNS turns Service names into stable virtual addresses.
It also publishes records for other selected resources. The DNS answer is only
the beginning of the packet path; kube-proxy or another data plane still has to
steer traffic to a ready endpoint.

Debug in layers: resolve the name, inspect the returned address, test the
transport endpoint, then validate the application protocol. Skipping straight
to “DNS is broken” hides which layer actually failed.
