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

## Worked case: Two executions, two different bottlenecks

A report service starts two workers from the same binary. The following is an authored Linux snapshot, not a measurement of your machine.

~~~text
PID  COMMAND  STATE  CPU-time change over 5s
410  report   R      +4.7s
411  report   D      +0.0s
storage write latency: elevated in the same interval
~~~

Worker 410 is receiving CPU time. Worker 411 is waiting in an uninterruptible state; the matching storage evidence supports an I/O hypothesis. The kernel owns scheduling and I/O completion, while the application owns the writes it issues. Read-only `ps -o pid,stat,time,comm -p 410,411` samples and the relevant device metrics distinguish the two demands. A later R sample would weaken the claim that 411 is continuously blocked; D is not proof of one particular disk failure.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
