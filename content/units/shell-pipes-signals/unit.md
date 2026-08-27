# Shells, pipes, exit status, and signals

A shell reads a command line, expands it, configures file descriptors, and asks
the operating system to start processes. It is not the command itself. This is
why quoting, redirection, and variable expansion happen before many programs
receive their arguments.

Processes conventionally start with three descriptors: standard input,
standard output, and standard error. A pipeline connects one process's standard
output to the next process's standard input. It moves bytes; it does not know
whether those bytes are rows, JSON, log lines, or errors.

~~~sh
journalctl -u api --since today |
  grep 'timeout' |
  sort |
  uniq -c
~~~

Each process exits with a numeric status. Zero conventionally means success;
non-zero communicates a category of failure. Scripts should check the status
that represents the operation they care about. In a pipeline, shell settings
such as `pipefail` affect whether an earlier failure is visible.

## Signals are requests delivered by the kernel

`SIGTERM` asks a process to terminate and can be handled so the application
stops accepting work, finishes in-flight operations, and flushes state.
`SIGKILL` cannot be caught or deferred; it is the last resort. A graceful
shutdown therefore needs both an application signal handler and enough time
before forced termination.

This becomes crucial in containers. The main process receives orchestrator
termination signals. A wrapper shell that fails to forward signals can make an
otherwise correct application look uncooperative.

Use pipelines for observable, bounded transformations. For automation, quote
variables, make error handling explicit, and avoid parsing human-oriented
output when a structured interface exists.
