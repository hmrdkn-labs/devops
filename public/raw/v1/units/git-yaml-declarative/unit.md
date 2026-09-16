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

## Worked case: Git and the API can hold competing desired values

This case intentionally has no GitOps reconciler. Symbolic commit c7 identifies the reviewed input; it is not a runnable repository command.

~~~text
Git c7: spec.replicas = 3
live Deployment: spec.replicas = 5
live Deployment: status.replicas = 5
owned Pods: 5 running
GitOps agent: absent
~~~

The controller's direct input is the API spec, so five is the active desired count. Git does not execute deployments by existing. Read the reviewed file and live API object to expose drift, then follow the project's chosen authority and review workflow. `kubectl apply --dry-run=server -f candidate.yaml` exercises server validation/admission without persisting the candidate; it requires API access and does not prove workload health. With a GitOps agent, inspect that agent's source/reconciliation status before claiming repository state will win.

These are authored inputs and predicted interpretations, not observations of a live environment. Use the read-only evidence named above to test the claim at the relevant boundary.
