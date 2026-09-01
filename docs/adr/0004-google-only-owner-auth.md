# ADR 0004: Google-only owner authentication

- **Status:** Accepted
- **Date:** 2026-09-01

## Context

The owner beta needs one durable OAuth identity so that private answers,
notes, review history, and readiness can be persisted safely. The initial
product plan named GitHub and Google, but the owner chose Google-only
authentication to keep the first deployment and credential surface small.

## Decision

Use Better Auth with the Google social provider only. Authorize the owner by a
stable provider subject in `OWNER_IDENTITIES` as `google:<subject>`; never use
an email address as the authorization key. The production callback is
`https://devops.hamardikan.com/api/auth/callback/google`.

The public application, environment examples, settings UI, private service
contract, and deployment workflow must not require GitHub OAuth values. A
future provider may be added only through a reviewed contract and migration
change.

## Consequences

- There is one OAuth application and one owner identity to configure.
- The owner beta has no provider-linking UI or implicit GitHub account path.
- The private deployment contract has four owner secrets: the Better Auth
  secret, Google client ID, Google client secret, and owner identity allowlist.
- Existing guest data remains memory-only; no migration is required for the
  first owner release.
