# Namespaces and control groups

A Linux container is not a small virtual machine. Its workload remains a set of
host-kernel processes. The illusion of a separate system comes mainly from two
kernel mechanisms with different jobs.

**Namespaces** change what a process can see. A PID namespace gives it a scoped
process tree; a network namespace gives it interfaces, routes, and sockets; a
mount namespace gives it a distinct view of mounted filesystems. Other
namespaces isolate hostnames, users, and IPC resources.

**Control groups**, or cgroups, organize processes for resource accounting and
control. They can limit or weight CPU, constrain memory, and account for I/O.
They answer “how much may this group consume?” rather than “what can it see?”

~~~text
same Linux kernel
├─ namespace view A ─ processes in cgroup A
└─ namespace view B ─ processes in cgroup B
~~~

This separation matters in incidents. A process can be isolated correctly but
throttled by a CPU limit. It can see only its own process namespace yet still
trigger a cgroup memory limit and be killed. Conversely, a generous cgroup
limit does not grant access to another network namespace.

## Isolation has a boundary

Namespaced processes share the host kernel. Kernel vulnerabilities, overly
powerful capabilities, host mounts, or privileged mode can weaken isolation.
Container security therefore combines namespaces and cgroups with capabilities,
seccomp, mandatory access controls, and careful runtime configuration.

When Kubernetes applies requests and limits, a container runtime translates
those declarations into host-level process and cgroup configuration. The
abstraction is useful, but the underlying resource behavior remains Linux.
