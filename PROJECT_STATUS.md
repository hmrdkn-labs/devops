# Project status and handoff

Status captured on **2026-08-27**. Work was intentionally stopped before any
production infrastructure or DNS change.

## Current state

- Public repository: <https://github.com/hmrdkn-labs/devops>
- Last implementation commit before this handoff: `9cc0c72`
- Product phase: owner-beta application implemented and verified locally
- Production status: **not deployed**
- Public curriculum: 18 reviewed **From Process to Pod** units, 36
  explain-or-predict questions, and 90 review cards
- Target domain: <https://devops.hamardikan.com> (not connected yet)

The repository has clean, independent history. The private KodeKloud knowledge
base was not copied into this repository, is not a build dependency, and was
not modified while this application was built.

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
content-archive checksum across repeated builds.

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

### 2. The private production boundary is not implemented yet

The private `hamardikan/hamardikan-infra` repository exists, but it was not
cloned or changed during the stopped deployment phase. At the stopping point,
its GitHub repository had no Actions secrets or variables configured.

The following production work therefore remains:

- create the production D1 database and apply this repository's migrations;
- bind it to the Worker as `DB`;
- add the Worker configuration and protected release workflow in the private
  infrastructure repository;
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

1. Start in the private infrastructure repository and read its local
   contributor/agent instructions before changing it.
2. Create D1, record the resource binding privately, and apply the migration
   from this repository.
3. Create and configure the two OAuth applications, then store all credentials
   only in the private deployment boundary.
4. Add a protected workflow that checks out an immutable public commit, runs
   the full validation suite, builds the Astro Worker, and fails closed when a
   release is misclassified.
5. Deploy to Cloudflare, attach the custom domain, run the verification list in
   [`docs/deployment.md`](docs/deployment.md), and record the previous Worker
   version for rollback.
6. Complete the owner-beta success gate before expanding the curriculum.

Do not place Cloudflare resource IDs, OAuth credentials, owner provider IDs, or
production deployment permissions in this public repository.
