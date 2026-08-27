# Processes and finite resources

A program stored on disk is passive. A **process** is one execution of that
program: instructions being scheduled, an address space holding data, open file
descriptors, an identity, and an environment. Starting the same program twice
creates two processes with separate process IDs and usually separate memory.

The operating system makes many processes appear to run at once. In reality,
the scheduler gives runnable processes slices of CPU time. Memory pages hold
their working data. File descriptors connect them to files, terminals, sockets,
and pipes. Every one of these resources is finite.

~~~text
program on disk
      │ exec
      ▼
 process ── CPU time
    ├────── memory pages
    ├────── file descriptors
    └────── identity + environment
~~~

This model makes operational symptoms less mysterious:

- CPU saturation means runnable work waits longer for a core.
- Memory pressure may trigger reclaim, swapping, or the out-of-memory killer.
- Slow storage or network I/O leaves processes blocked even when CPU is idle.
- Exhausted file descriptors prevent new files or connections from opening.

A process can be healthy from its own point of view while the service is not.
It may still be running but unable to reach a dependency, accept a socket, or
complete work before a timeout. That distinction later becomes the reason
Kubernetes separates process state from readiness and liveness.

## A useful debugging order

Start with the question “what resource must the process acquire next?” Check
whether it is runnable, sleeping, blocked on I/O, or repeatedly restarting.
Then connect the symptom to a constrained resource instead of treating load
average, memory use, or latency as isolated numbers.

The container and the pod do not replace this model. They add isolation,
metadata, and orchestration around processes that still consume host resources.
