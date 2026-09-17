# Interactive Mental Models contract

These original YAML teaching fixtures work independently of the application.
They are exported under `/raw/v1/mental-models/` and in the content archive.
The manifest lists immutable IDs, revisions, linked canonical units/objectives,
and content hashes. The schema is defined in
`src/lib/content/mental-model-schema.ts`.

Every model must start with a concrete user-visible scenario and explicit
assumptions. Every step must include:

- the acting component, its physical/logical location, and its responsibility;
- the state before acting and a prediction with option-specific correction;
- the action and state after it, with labeled component edges;
- a read-only proof command, expected evidence, and the limit of that evidence;
- a failure condition, its consequence, and the smallest useful next check.

Locations and layers are separate: a component in the control plane can make a
placement decision, while a worker executes the workload. Service and endpoint
objects configure a possible route; the configured network implementation
carries application traffic. An API object is not itself an executor.

The examples are `authored-fixture`, not live cluster observations. Commands are
inspection suggestions, not commands executed by the application. Never imply
that an animation, a configuration query, or a passing test proves runtime
behavior beyond its scope. Name implementation assumptions such as kube-proxy
iptables mode and distinguish them from alternatives.

New models must link existing canonical unit/objective IDs, use unique local
component/step/option IDs, offer at least two transfer questions, and cite
primary sources. Content checking rejects broken references and malformed
prediction answers. Increment a model's integer revision when it changes;
these model fixtures do not independently grant persisted learner mastery.
