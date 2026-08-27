# Container runtime and lifecycle

An image is input. A container is a runtime-created environment for one or more
processes. The runtime prepares namespaces, cgroups, mounts, credentials, and a
writable filesystem layer, then starts the configured process.

Creation and start are distinct. A stopped container can keep metadata and its
writable layer, but it has no running main process. Removal deletes that runtime
object; it does not delete the immutable image or external volumes.

The configured entry process becomes PID 1 inside the container's PID
namespace. When it exits, the container stops and exposes its exit status. A
restart policy or orchestrator may create another execution, but it does not
resume the old process memory.

Standard output and standard error are the default container log interface.
Applications should emit useful structured events there and put durable data in
an explicit storage system. Treating the writable layer as a database ties data
to one replaceable runtime object.

## Shutdown is part of correctness

A runtime asks the main process to stop, waits for a grace period, then may
force termination. The process must receive and handle the signal, stop taking
new work, drain, and exit. Shell-form entrypoints or custom wrappers can
interfere with forwarding and child reaping.

The useful debugging chain is: inspect configured command, current process,
recent state transition, exit code, termination signal or reason, and restart
policy. “The container crashed” is a label; the exit evidence is the diagnosis
starting point.
