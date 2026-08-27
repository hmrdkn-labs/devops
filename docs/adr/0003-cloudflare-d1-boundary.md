# ADR 0003: Cloudflare and D1 are adapters

- Status: accepted
- Date: 2026-08-27

## Context

V1 benefits from one low-operations Worker and D1, but the intended home
infrastructure will become Kubernetes-based. Content and learning behavior must
not depend on Cloudflare-specific primitives.

## Decision

V1 uses one Astro Cloudflare Worker for prerendered assets, dynamic routes,
Better Auth, and APIs. D1 stores auth records, profiles, append-only events,
FSRS projections, evidence, answers, notes, and revision acknowledgements.
Review event insertion, scheduler projection, and evidence projection are one
atomic D1 batch. Astro Sessions/KV are disabled.

Cloudflare bindings and environment access stay in server adapters. Production
resource IDs, OAuth secrets, DNS, deployment, verification, and rollback are
owned by the private infrastructure repository.

## Consequences

Local guest study works without Cloudflare. A future container deployment swaps
the Astro adapter and migrates D1 to PostgreSQL. That migration and a production
container image are deliberately outside v1.
