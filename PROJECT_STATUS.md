# DevOps by hmrdkn-labs — project status

> **Last updated:** 2026-08-27 · This is the canonical running log. Update it
> whenever a phase completes, work starts, or a blocker changes.

## Read this first

**Bottom line:** the learning application is built, tested, and ready to run.
The production D1 database and protected Cloudflare deployment path are also
prepared. Release is paused at one external boundary: the private GitHub
environment's Cloudflare credential cannot access D1 (API error `7403`). The
attempt stopped before migration, Worker deployment, or DNS changes.

**One action unblocks the release:** update the private
`production-cloudflare` Cloudflare API token so it has D1 Edit, Workers Scripts
Edit, Workers Routes Edit, and Zone Read access for the same account that owns
`hmrdkn-devops`. Then rerun the protected **guest** workflow. Do not paste the
token into Git, logs, or chat.

**There are only two Cloudflare entries for this deployment:**
`CLOUDFLARE_API_TOKEN` is the single secret token used for both Worker and D1;
`CLOUDFLARE_ACCOUNT_ID` is the plain ID of the account that owns the database.
No additional Cloudflare token is required. The existing
`STATUS_INGEST_SECRET` belongs to a separate status workflow and does not need
to change for this release.

## Credential fix checklist

1. In Cloudflare **API Tokens**, create or edit the deployment token with
   **Account → D1 → Edit** and **Account → Workers Scripts → Edit**.
2. Add **Zone → Workers Routes → Edit** and **Zone → Zone → Read**, scoped to
   the `hamardikan.com` zone. Scope the account resource to the account that
   owns `hmrdkn-devops`; do not select all accounts/zones unless required.
3. In the private repository's `production-cloudflare` environment, update
   `CLOUDFLARE_API_TOKEN` and verify `CLOUDFLARE_ACCOUNT_ID` identifies that same
   Cloudflare account. GitHub encrypts environment secrets when set through
   the UI or `gh secret set`.
4. Rerun `deploy-devops-learning` in **guest** mode with the apply and route
   confirmations enabled. The workflow will apply migrations, deploy the
   Worker, and verify the public route without logging response bodies.

**Architecture decision:** no change is needed. The production path is the
Astro Cloudflare Worker directly; the incompatible Sites preview is optional
and is not part of production.

## Progress at a glance

`✅ Product` → `✅ App` → `✅ Content` → `✅ Private deployment boundary` →
`⛔ Guest release` → `⏳ Owner beta`

| Phase | Status | What it means |
| --- | --- | --- |
| Product contract | ✅ Complete | Learning flow, mastery, portability, privacy, and rollout rules are documented. |
| Learning app | ✅ Complete | Astro 7/Solid application, question-first study flow, review scheduling, notes, readiness, search, and export are implemented. |
| Initial content | ✅ Complete | 18 reviewed **From Process to Pod** units, 36 explain/predict prompts, and 90 cards are published. |
| Production boundary | ✅ Ready | D1 `hmrdkn-devops`, private Worker config, guarded workflow, validators, and rollback metadata are prepared. |
| Guest release | ⛔ Blocked | Run `33046394332` failed closed at D1 migration because the Cloudflare credential was not authorized for D1; no production traffic changed. |
| Owner beta | ⏳ Waiting | GitHub/Google OAuth secrets and the stable owner allowlist are not configured yet. |

**Repositories:** [public app](https://github.com/hmrdkn-labs/devops) · private
deployment boundary: `hamardikan/hamardikan-infra`

The public repository has independent history. The private KodeKloud
knowledge base was not copied into this repository, is not a build dependency,
and was not modified while this application was built.

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
  is on `main`; repository validation run `33046123635` completed successfully.
- **2026-08-27 — guest release attempted:** protected run `33046394332`
  stopped at D1 migration with Cloudflare API error code `7403` (the
  `production-cloudflare` credential cannot access the new D1 service). No
  Worker or DNS change was made.
- **2026-08-27 — blocker recorded privately:** `hamardikan-infra` commit
  `519578e` adds the D1 capability requirement and metadata-only failed-run
  evidence; no credential values were changed.
- **2026-08-27 — blocker change validated:** private CI run `33046829376`
  completed successfully after the capability-contract and evidence update.
- **Current:** deployment is paused on that credential-scope/account-match
  blocker. Application code last changed in `498489e`; subsequent public
  commits are status-only updates. The retry should pin the latest approved
  public SHA after the credential fix.

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
- Private repository validation run `33046123635` completed successfully
- Guest deployment attempt `33046394332` failed closed before D1 migration
  because the Cloudflare credential was not authorized for D1
- Metadata-only failed-run evidence is recorded in the private infrastructure
  repository; no secret or response body was recorded

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

### 2. Cloudflare D1 authorization blocks the protected guest deployment

The private `hamardikan/hamardikan-infra` repository now has the service
contract and guarded workflow committed on `main`. Its local validators and
the Worker dry-run pass, and its repository CI gate passed. The first protected
guest run failed closed before any migration or Worker deployment because the
`production-cloudflare` credential could not access the new D1 service
(Cloudflare API code `7403`).

The following production work therefore remains:

- update the private environment with a Cloudflare API token that is authorized
  for D1 edit plus Worker script/route operations, and verify its account ID
  matches the D1 account;
- rerun the protected guest release for the immutable public commit;
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

1. Update/verify the `production-cloudflare` token scope and account ID through
   the private secret boundary; do not place values in Git, logs, or chat.
2. Rerun the protected **guest** release for the immutable public commit;
   apply the D1 migration and Worker deployment through that workflow.
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
