# ADR 0001: Portable canonical content

- Status: accepted
- Date: 2026-08-27

## Context

The curriculum will change frequently and must outlive any current web
framework, hosting provider, database, or future container migration.

## Decision

Canonical units are standalone GitHub-Flavored Markdown with YAML sidecars.
They use immutable namespaced IDs, integer revisions, aliases, applicable
versions, prerequisite edges, certification mappings, author/reviewer fields,
and verification dates. Astro consumes compiled data but cannot appear in the
canonical files. Raw files, a versioned manifest, and an archive are public.

Third-party material is represented only by reviewed metadata and links.
Original teaching text, questions, examples, and diagrams are written for this
project. Private source collections are outside the repository and build graph.

## Consequences

Any renderer can consume the corpus. Content changes require schema validation
and regenerated artifacts. Features that require embedded components must be
modeled as portable data or remain application-only.
