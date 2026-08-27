# Project status and handoff

Status captured on **2026-08-27**. This file is the canonical running log for
the project: update it at every meaningful completion, handoff, blocker, or
change of deployment phase.

## Current state

- Public repository: <https://github.com/hmrdkn-labs/devops>
- Latest public application commit: `498489e`
- Product phase: owner-beta application implemented and verified locally
- Deployment phase: **protected guest release dispatch pending**
- Production status: **D1 provisioned; Worker and DNS not deployed yet**
- Production D1: database `hmrdkn-devops` (resource ID is retained only in
  private infrastructure)
- Public curriculum: 18 reviewed **From Process to Pod** units, 36
  explain-or-predict questions, and 90 review cards
- Target domain: <https://devops.hamardikan.com> (not connected yet)

The repository has clean, independent history. The private KodeKloud knowledge
base was not copied into this repository, is not a build dependency, and was
not modified while this application was built.

## Progress log

- **2026-08-27 — resumed deployment work:** the agreed Astro-on-Cloudflare
  Worker route remains the production architecture; the incompatible Sites
  preview is optional and not on the production path.
- **2026-08-27 — provisioned D1:** created the empty APAC database
  `hmrdkn-devops`; its UUID is deliberately kept out of this public log.
- **2026-08-27 — prepared private boundary:** added the private service
  contract, Worker configuration, guarded deployment workflow, evidence
  template, environment references, and validators in a local clone of
  `hamardikan/hamardikan-infra`.
- **2026-08-27 — validated deployment artifact:** Wrangler dry-run passed with
  the Cloudflare Worker entrypoint, D1 binding, 210 static assets, and the
  generated client/server output.
- **2026-08-27 — private wiring pushed:** `hamardikan-infra` commit `47178cd`
  is on `main`; its repository validation run `33046123635` is still in
  progress.
- **Current:** the guest release is ready to dispatch after that CI gate. The
  intended immutable public source is the latest pushed commit on
  `hmrdkn-labs/devops`.

## Completed

- Portable GFM units with YAML sidecars for metadata, questions, cards,
  sources, and guided practice
- Schema validation, graph checks, prerequisite-cycle detection, immutable IDs,
  revision classification, and mastery-affecting hash checks
- Deterministic public manifest, reference catalog, exact-search index, Atom
  feed, `llms.txt`, `llms-full.txt`, raw Markdown, and downloadable content ZIP
- Astro 7 application with Solid islands and the Cloudflare adapter
- Question-first learning flow, critical-point checks, guest sessions, notes,
  mixed FSRS reviews, readiness projections, dashboard, settings, and export
- Better Auth integration for allowlisted GitHub and Google identities
- D1 schema and migration for authentication, attempts, reviews, evidence,
  private answers, notes, revision acknowledgements, and idempotency
- Public routes and APIs described in the product plan
- MIT licensing for code, CC BY-SA 4.0 for prose/diagrams, independence and
  trademark notices, contribution guidance, security policy, and ADRs
- CI that validates content, types, tests, builds, browser flows, accessibility,
  release classification, deterministic generated files, and absence of public
  production secrets/deployment capabilities
- Private-infrastructure contract and protected workflow prepared for the
  `devops.hamardikan.com` Worker route; local validators and Worker dry-run pass
- Empty production D1 resource provisioned for the `DB` binding

## Verification at the stopping point

The following completed successfully from a clean dependency install:

```text
npm ci
npm run check       # 18 units, 1 path, 90 cards; 19 unit/privacy tests
npm run build
npm run test:e2e    # 6/6 desktop and mobile browser tests
npm audit           # 0 vulnerabilities
```

Additional checks passed for an empty D1 migration, indexed due-review query,
duplicate-submission idempotency, guest privacy, accessibility, and a stable
content-archive checksum across repeated builds. The private infrastructure
validator suite and a Wrangler Worker dry-run also pass; no production Worker
deployment has been claimed from those static checks.

## Exact blockers

### 1. The optional Sites host is incompatible with this Astro artifact

A Sites preview project was connected, but its deployment failed because the
host requires `dist/server/index.js`. Astro's supported Cloudflare adapter
correctly emits `dist/server/entry.mjs`. Changing the application to Vinext or
OpenNext solely to satisfy that preview host would violate the agreed Astro
architecture.

This does **not** block the planned production route. Production should use the
Astro Cloudflare Worker artifact directly. The failed Sites preview is not
production and has no custom domain attached.

### 2. The protected production deployment is prepared but not dispatched

The private `hamardikan/hamardikan-infra` repository now has the service
contract and guarded workflow committed on `main`. Its local validators and
the Worker dry-run pass; the corresponding repository CI gate is still
running, and no production deployment has been dispatched.

The following production work therefore remains:

- complete the private repository CI gate;
- dispatch the protected guest release for an immutable public commit;
- apply this repository's D1 migrations and bind it to the Worker as `DB`;
- deploy the exact approved public commit;
- connect `devops.hamardikan.com` as the Worker custom domain;
- verify health, content-manifest SHA, public pages, raw Markdown, search, auth,
  and the rollback target.

### 3. Owner OAuth credentials do not exist in the deployment boundary

The application code is ready, but production still needs GitHub and Google
OAuth applications, provider client IDs/secrets, `BETTER_AUTH_SECRET`, and the
stable provider-ID allowlist. Creating those provider applications requires
the site owner to own/approve the persistent provider configuration. Until
those values are present, the public guest experience can run, but owner login
and persistent learning state cannot.

Use these callbacks:

```text
https://devops.hamardikan.com/api/auth/callback/github
https://devops.hamardikan.com/api/auth/callback/google
```

## Deliberately not complete yet

- The owner-beta success gate (ten real focus sessions over seven days,
  scheduled recall, one revision revalidation, and a validated export)
- Expansion from 18 units toward the 70–100-unit pre-KCNA curriculum
- Restore, ranked retrieval, digest email, optional public profile,
  diagnostics, and freshness monitoring
- Formal executable lab provisioning and a lab CLI
- Container deployment and the later D1-to-PostgreSQL migration

These are later plan increments, not regressions in the current owner-beta
implementation.

## Safe resume order

1. Complete the private repository CI gate for commit `47178cd`.
2. Dispatch the protected **guest** release for the latest approved public
   commit; apply the D1 migration and Worker deployment through that workflow.
3. Verify the public health endpoint, manifest SHA, routes, raw Markdown,
   search, and custom-domain response, then record metadata-only evidence and
   the previous Worker version privately.
4. Create and configure the two OAuth applications, then store all credentials
   only in the private deployment boundary; owner mode remains blocked until
   those secrets and the stable provider-ID allowlist exist.
5. Deploy owner mode, run the owner-beta success gate, and only then expand the
   curriculum.

Do not place Cloudflare resource IDs, OAuth credentials, owner provider IDs, or
production deployment permissions in this public repository.
