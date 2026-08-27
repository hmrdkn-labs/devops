# ADR 0002: Mastery is evidence, not completion

- Status: accepted
- Date: 2026-08-27

## Context

Reading a page is weak evidence of understanding. A useful learning tool must
distinguish first exposure, unaided recall, practical application, and
successful retrieval on a later date. Content revisions can invalidate only a
subset of prior evidence.

## Decision

Store attempts and review events append-only. Project objective evidence for
`Encountered`, `Recalled`, `Applied`, and `Retained`; compute `readiness-v1` as
15/30/30/25 percent respectively and decay current evidence over time. Weight
critical path units twice. Use `ts-fsrs` at 90% requested retention by default,
adjustable between 85% and 95%.

Revision impact is derived from hashes:

- `editorial`: preserve all state;
- `enrichment`: preserve state and offer an optional revisit;
- `mastery_affecting`: preserve event history and require revalidation only for
  objectives whose hashes changed.

Self-ratings remain learner judgments. There is no AI grading or string-match
grading.

## Consequences

Readiness can decrease. Historical auditability is retained. The system must
test scheduling, timezones, stale evidence, objective hashes, and revision
classification rather than treating a unit as a boolean checkbox.
