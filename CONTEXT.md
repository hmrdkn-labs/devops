# Project context

## Mission

DevOps by hmrdkn-labs turns portable Markdown knowledge into durable
understanding. The project optimizes for retrieval, explanation, application,
and later retention—not page completion.

## Canonical terms

- **Learning Unit**: the smallest independently versioned teaching object.
- **Objective**: an immutable, namespaced capability inside a unit.
- **Question**: an explain, predict, objective, or scenario prompt answered
  before lesson reveal.
- **Card**: an FSRS-scheduled short, prompt, or scenario review object.
- **Evidence**: a timestamped projection derived from append-only attempts and
  review events.
- **Mastery**: `Encountered → Recalled → Applied → Retained`.
- **Readiness**: a time-sensitive, weighted score; never a certification claim.
- **Focus path**: the learner's one active guided sequence.
- **Technical map**: a secondary prerequisite view; not a second curriculum.
- **Reference**: source metadata and a link, not mirrored third-party content.
- **Canonical content**: GFM plus YAML sidecars under `content/`.

Canonical technical vocabulary is English. Explanations may add translations
later, but identifiers, commands, API names, and certification mappings remain
English and stable.

## Non-negotiable boundaries

1. Private course collections never enter this repository or its build graph.
2. Learner answers and notes are private, authorization-scoped, and excluded
   from analytics, public search, semantic search, profiles, and logs.
3. Guests never persist learning state.
4. No AI answer grading and no naive string-similarity grading.
5. Canonical content contains no MDX, framework component, or provider binding.
6. History is append-only. Revision changes alter projections, not past events.
7. Certification mappings are advisory and backed by an updateable registry.
8. V1 contains guided Markdown practice, not provisioned executable labs.

## Decision records

- [ADR 0001: portable canonical content](docs/adr/0001-portable-content.md)
- [ADR 0002: mastery evidence](docs/adr/0002-mastery-evidence.md)
- [ADR 0003: Cloudflare and D1 boundary](docs/adr/0003-cloudflare-d1-boundary.md)
