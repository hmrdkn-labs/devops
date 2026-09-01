# DevOps by hmrdkn-labs — project status

> **Last updated:** 2026-09-01 · This is the canonical running log. Update it
> whenever a phase completes, work starts, or a blocker changes.

## Read this first

**Bottom line:** the learning application is built, tested, and deployed on
the production Cloudflare Worker. The protected guest release completed
successfully after the deployment token was added to GitHub. The public route,
D1 health, manifest, raw Markdown, and study pages are live and verified.

The visual reset is now live on the public app: the content contract, routes,
learning behavior, and privacy boundaries stayed unchanged while the
interface moved from a marketing-like notebook page to a focused study
workspace. The design contract is in [`DESIGN.md`](DESIGN.md), and the
implementation record is in [`docs/UI-REDESIGN-PLAN.md`](docs/UI-REDESIGN-PLAN.md).
The release passed local typecheck, content checks, unit tests, D1 tests,
desktop/mobile E2E and accessibility checks, production build, and protected
route verification.

The Google-only owner rollout is live. The Google OAuth client,
`BETTER_AUTH_SECRET`, and stable owner allowlist are stored in the private
deployment environment; protected run `33464102323` deployed public commit
`0e63a2e` and passed the Worker, D1, manifest, and auth-route checks. The first
allowlisted Google sign-in was verified in the browser and opened the private
dashboard. The next milestone is the owner-beta success gate, not a deployment
blocker. Do not paste credentials or provider subjects into Git, logs, or chat.

**There are only two Cloudflare entries for this deployment:**
`CLOUDFLARE_API_TOKEN` is the single secret token used for both Worker and D1;
`CLOUDFLARE_ACCOUNT_ID` is the plain ID of the account that owns the database.
No additional Cloudflare token is required. The existing
`STATUS_INGEST_SECRET` belongs to a separate status workflow and does not need
to change for this release.

**Which token is it?** In Cloudflare, the deployment token should be a
dedicated API token for this application (for example,
`hmrdkn-devops-deploy`) with the permissions in the checklist below. In
GitHub, that token is stored as the `CLOUDFLARE_API_TOKEN` secret under
`hamardikan/hamardikan-infra` → `production-cloudflare`. The local Wrangler
OAuth login is not the GitHub deployment token, and the token value cannot be
read back from GitHub.

**Token inventory checked before creation (2026-08-28):** the visible User API
Tokens were named for staging, homelab infrastructure, tunnels, or build
services. None matched the DevOps deployment boundary with D1 access, so the
dedicated Account API Token described below was created. No token value was
viewed or recorded.

## Credential and deployment record

1. ✅ Completed: the dedicated Cloudflare deployment token was created with
   **Account → D1 → Edit** and **Account → Workers Scripts → Edit**.
2. ✅ Completed: it includes **Zone → Workers Routes → Edit** and
   **Zone → Zone → Read**, scoped to the `hamardikan.com` zone and the account
   that owns `hmrdkn-devops`.
3. ✅ Completed: the private repository's `production-cloudflare` environment
   contains `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; only secret
   names/timestamps were inspected, never values. GitHub encrypts environment
   secrets when set through the UI or `gh secret set`.
4. ✅ Completed: `deploy-devops-learning` ran in **guest** mode with the apply
   and route confirmations enabled. It applied migrations, deployed the
   Worker, and verified the public route without logging response bodies.

**Architecture decision:** no change is needed. The production path is the
Astro Cloudflare Worker directly; the incompatible Sites preview is optional
and is not part of production.

## Progress at a glance

`✅ Product` → `✅ App` → `✅ Content` → `✅ Private deployment boundary` →
`✅ Guest release` → `✅ Owner release` → `✅ UI reset` → `🔄 Owner beta gate`

| Phase | Status | What it means |
| --- | --- | --- |
| Product contract | ✅ Complete | Learning flow, mastery, portability, privacy, and rollout rules are documented. |
| Learning app | ✅ Complete | Astro 7/Solid application, question-first study flow, review scheduling, notes, readiness, search, and export are implemented. |
| Initial content | ✅ Complete | 18 reviewed **From Process to Pod** units, 36 explain/predict prompts, and 90 cards are published. |
| Production boundary | ✅ Ready | D1 `hmrdkn-devops`, private Worker config, guarded workflow, validators, and rollback metadata are prepared. |
| Guest release | ✅ Complete | Run `33137237808` applied D1 migrations, deployed the Worker and route, and passed all public health/content checks for public commit `45e3209`. |
| Owner beta | 🔄 In progress | Google-only release is deployed and the first allowlisted sign-in works; the ten-session success gate and scheduled-recall evidence remain. |
| UI reset | ✅ Complete | Design contract and redesign plan are written; foundation, shared shell, homepage focus prompt, focused study/review workspace, responsive surfaces, and accessibility fixes are deployed in protected run `33487216904` for source `190e0e5`. |

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
- **2026-08-28 — Cloudflare token inventory checked:** no existing visible
  token matches the DevOps Worker + D1 deployment boundary; a dedicated
  Account API Token is required.
- **2026-08-28 — dedicated token created:** the owner created
  `hmrdkn-devops-deploy` with account-level D1 Edit and Workers Scripts Edit,
  plus `hamardikan.com`-scoped Workers Routes Edit and Zone Read. The token
  value was never viewed or recorded here.
- **2026-08-28 — token form reverified:** the dedicated form was recreated
  after the browser session ended and the same two-policy configuration was
  confirmed. That separate draft remains open at the final review step and is
  still not submitted; it is not needed now that the active token is installed
  in GitHub.
- **2026-08-28 — permission audit:** re-mapped every Cloudflare operation in
  the private workflow and Worker config. The current four scopes are the
  strict deployment minimum: account-level D1 Edit and Workers Scripts Edit,
  plus `hamardikan.com`-scoped Workers Routes Edit and Zone Read. Account
  Settings Read is not required because the workflow supplies the account ID;
  Cloudflare's generic Workers Builds template includes it for broader
  compatibility, but this release does not use that template. No KV, R2, DNS,
  user, Pages, Containers, AI, or observability-management permission is used.
- **2026-08-28 — future deployment scope reviewed:** R2 and DNS Write remain
  intentionally outside this application token. R2 is needed only when a
  future Worker binds or manages an R2 bucket; the current `assets.directory`
  upload is part of the Worker deployment. DNS Write is needed only when a
  workflow creates or changes DNS records; the current route uses the Workers
  Routes API. If the portfolio later needs those capabilities, create a
  separately scoped infrastructure token—or explicitly broaden this token
  after review—rather than silently increasing the app token's blast radius.
- **2026-08-28 — shared-environment audit:** the same private
  `production-cloudflare` environment currently serves the DevOps Worker, the
  status Worker, and metadata-only route inventory. The status Worker uses
  Durable Objects and static assets, but no R2 or KV binding; its DNS-mutation
  workflow is deliberately fail-closed. Therefore the four current scopes
  cover all existing Cloudflare workflows. A future shared infrastructure
  token may add `Workers R2 Storage: Write` and zone-scoped `DNS: Write`, but
  only together with an explicit workflow/approval change and a review of the
  larger blast radius.
- **2026-08-28 — deployment credential installed:** GitHub environment
  `production-cloudflare` now contains `CLOUDFLARE_API_TOKEN` and
  `CLOUDFLARE_ACCOUNT_ID`; only secret names/timestamps were inspected, never
  values.
- **2026-08-28 — first guest release:** run `33137097525` successfully applied
  D1 migrations and deployed the Worker, but its immediate health probe saw a
  transient 5xx during route propagation. No rollback or secret exposure
  occurred.
- **2026-08-28 — guest release verified:** retry run `33137237808` passed in
  full for public commit `45e320963dc4a491d61fb67ab0cd9620df3fc740`.
  `/api/health` returned `status=ok`, `database=ready`, and the expected
  manifest SHA; public pages, raw Markdown, search, map, and references also
  passed. The guest release is complete.
- **Current:** the public guest site and Google-only owner login are live at
  `https://devops.hamardikan.com`. The remaining owner-beta work is the
  success gate; the deployed application is source commit `0e63a2e` and this
  status log records the verification.
- **2026-09-01 — Google-only owner decision:** at the owner's request, GitHub
  OAuth was removed from the owner-beta contract. A persistent Google Web OAuth
  client was created with the production callback, and the Google client
  values, `BETTER_AUTH_SECRET`, and `OWNER_IDENTITIES` were installed in the
  private `production-cloudflare` environment. Values are intentionally not
  recorded here. The protected owner release is the next action.
- **2026-09-01 — owner release verified:** protected rerun `33464102323`
  deployed public commit `0e63a2e7b63a2e5f4758d4557eb99beee61b046b` with the
  Google-only contract. D1 migrations, Worker deployment, secret installation,
  route checks, `/api/health`, and `/api/auth/get-session` passed. The first
  allowlisted Google sign-in reached the private dashboard; no credential or
  provider-subject value is recorded.
- **2026-09-01 — UI reset started:** preserved the question-first learning
  contract and all public routes while replacing the visual foundation with a
  neutral canvas, semantic light/dark tokens, calmer controls, active
  navigation, an accessible mobile menu, and a focused two-column study
  workspace. Added the durable design contract and implementation plan. Local
  `npm run check` and `npm run build` pass; deployment follows after the
  remaining review/browse polish and release verification.
- **2026-09-01 — UI reset released:** public commit `190e0e5f7aa1e3933e3ca0274ef4772d7d486935`
  passed `npm run ci` and six desktop/mobile E2E checks, including serious and
  critical accessibility gates. Protected owner run `33487216904` deployed the
  exact commit, applied D1 migrations, installed the existing Google-only
  owner secrets without logging values, and verified `/`, `/library`,
  `/search`, `/map`, `/references`, a learning route, raw Markdown,
  `/api/health`, and `/api/auth/get-session`.

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
- Better Auth integration for the allowlisted Google identity
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
- Guest deployment retry run `33137237808` completed successfully after the
  corrected Cloudflare token was installed; D1 migrations, Worker deployment,
  route binding, and public verification all passed
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
validator suite and a Wrangler Worker dry-run passed before release; protected
run `33137237808` now also verifies the production Worker and D1 health.

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

### 2. Resolved: Cloudflare D1 authorization

The private `hamardikan/hamardikan-infra` repository has the service contract
and guarded workflow committed on `main`. The original protected guest run
failed closed before migration because the old `production-cloudflare`
credential could not access D1 (Cloudflare API code `7403`). After the
dedicated token was installed, retry run `33137237808` applied the migrations,
deployed the exact public commit, bound the Worker route, and passed the full
public verification suite. No rollback was required.

The transient 5xx seen by run `33137097525` was route propagation immediately
after the first deploy; the subsequent retry returned healthy D1 and manifest
metadata.

### 3. No active deployment blocker: owner-beta success gate remains

The application code now uses Google OAuth only. The persistent Google Web
client and the four required private environment secrets
(`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`OWNER_IDENTITIES`) are configured. Protected run `33464102323` deployed the
exact public source and the first allowlisted Google sign-in reached the private
dashboard. There is no current deployment blocker; the remaining work is the
owner-beta success gate (real focus sessions, scheduled recall, a revalidation
check, and a parseable export) before expanding the corpus.

Use these callbacks:

```text
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

1. Run the owner-beta success gate: ten real focus sessions over seven days,
   scheduled recall, one content revalidation, and a full export.
2. Grow the independent curriculum toward the 70–100-unit pre-KCNA target.

Do not place Cloudflare resource IDs, OAuth credentials, owner provider IDs, or
production deployment permissions in this public repository.
