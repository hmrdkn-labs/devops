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
resume the old process memory. Starting the same Docker container retains its
writable layer; removing it and creating a replacement gives the replacement
a fresh layer unless data is supplied from explicit external storage.

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

## Worked case: Restarting a process differs from replacing its container

The case assumes ordinary Docker writable-layer storage, no automatic removal, no mounts and a marker absent from the image.

~~~text
container C1: /tmp/run-marker exists; memory cache warm
main process exits 2 → C1 stopped
docker start C1 → new process in existing C1
remove C1; create C2 from same image → new container object
~~~

After starting C1, the disk marker remains while cache memory is rebuilt. C2 has neither C1's marker nor its memory. Inspect the container ID, `docker inspect` state and mounts, and application logs to tell these boundaries apart. A restart policy can start another execution but cannot resume old memory. An external volume would alter the disk prediction; it would not preserve an in-process cache. The exit status directs investigation but does not identify why the application chose that status.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
