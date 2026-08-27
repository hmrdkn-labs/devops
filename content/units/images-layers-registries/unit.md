# Container images, layers, and registries

An OCI image packages a root filesystem view and runtime configuration. Its
manifest points to a configuration object and an ordered list of content
layers. Each object is addressed by a cryptographic digest. Runtimes can reuse
unchanged layers across images and verify transferred content.

Layers record filesystem changes, not a sequence of virtual machines. Deleting
a large file in a later layer hides it from the final view but does not remove
the bytes from the earlier layer. Build context, ordering, and multi-stage
builds therefore affect size and exposure.

A **tag** is a convenient mutable name such as `api:1.4`. A **digest** names
specific content. Pulling by tag at two different times may return different
content; pulling the same digest identifies the same manifest content.

~~~text
repository:tag ──mutable lookup──▶ manifest@sha256:...
                                      ├─ config
                                      └─ layer digests
~~~

A registry stores and distributes these objects over an authenticated API. It
does not make the image trustworthy by itself. Provenance, signatures, scanning,
minimal contents, and controlled build inputs address different supply-chain
risks.

Kubernetes records an image reference in a Pod template. The node runtime pulls
and unpacks it, then adds a writable container layer. Persistent application
data should not rely on that ephemeral writable layer.
