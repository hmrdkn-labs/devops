# HTTP requests and TLS identity

HTTP is an application protocol. A request identifies a method, target, and
authority and carries headers plus an optional body. A response returns a status
code, headers, and an optional body. The transport may be TCP or QUIC, but an
HTTP failure should still be distinguished from DNS and transport failures.

The `Host` header in HTTP/1.1, or the `:authority` pseudo-header in later
versions, lets one address serve multiple named applications. A reverse proxy
can terminate the client connection, choose an upstream from that authority and
path, and create a separate upstream request.

TLS protects the connection by negotiating encryption and authenticating
identities through certificates. A client normally verifies that the
certificate chains to a trusted authority, is valid for the current time, and
covers the requested hostname. Encryption without correct identity validation
can still connect securely to the wrong party.

~~~text
name → IP → transport connection → TLS identity → HTTP request → application
~~~

Each arrow is a separate checkpoint. A `502` response proves that an HTTP
intermediary answered, not that its upstream worked. A certificate hostname
error proves transport was established far enough for TLS negotiation, not that
DNS is necessarily correct.

In Kubernetes, Ingress or Gateway implementations commonly route HTTP by host
and path. The API object describes intent; a controller and data-plane proxy
must implement it. Always identify where TLS terminates and whether traffic is
encrypted again to the backend.
