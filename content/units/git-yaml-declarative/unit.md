# Git, YAML, and declarative intent

Git records snapshots and the history connecting them. A commit identifies a
specific tree plus metadata and parent commits. Branch names are movable
references to commits. This makes configuration reviewable and revertible, but
Git does not prove that the configuration is valid or deployed.

YAML is a data serialization language. Indentation describes structure, and
scalars can be strings, numbers, booleans, or null values. Valid YAML only means
the document can be parsed. The receiving API's schema decides whether fields
exist, types are accepted, and combinations make sense.

Declarative configuration states the result you want. A controller compares
observed state with desired state and takes repeated actions to reduce the
difference. The document is not a one-time script; it becomes durable input to
a reconciliation loop.

~~~text
Git commit → reviewed desired state → API validation
                                  → controller reconciliation
                                  → observed state
~~~

Prefer small, explainable commits. Validate syntax and schema before merge.
Review generated diffs rather than trusting a template tool. Never place
plaintext credentials in a repository merely because a Kubernetes object is
named Secret; encoding is not encryption.

The same source can be portable Markdown or YAML while deployment adapters stay
platform-specific. Keeping content and intent framework-independent makes later
renderers and infrastructure migrations tractable.
