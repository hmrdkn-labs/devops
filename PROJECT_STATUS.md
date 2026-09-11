# DevOps by hmrdkn-labs — project status

> **Last updated:** 2026-09-11 · This is the canonical running log. Update it
> whenever a phase completes, work starts, or a blocker changes.

## Read this first

**Learning-progress v5 is release-ready locally:** learning completion and
understanding are now deliberately separate signals. Units track durable
`Not started → In progress → Learned → Completed` task progress from answered
questions, an explicit lesson-read marker, and guided-practice completion,
while understanding remains evidence-derived as `Introduced → Understands
basics → Can apply → Strong / retained`, with `Needs refresh` when content
revalidation invalidates current evidence. Stable task IDs preserve completion
across content revisions; revalidation may lower understanding without
pretending the learner never completed the material. `/kcna` exposes both
signals per unit plus completion/understanding summaries, study pages expose a
compact two-axis status rail and explicit lesson/practice controls, and learner
export v2 includes task-progress records. Guest completion remains memory-only.
Local content/type/unit/D1/build checks pass, including revision-carry tests;
the browser matrix passes with **25 tests and 2 intentional skips** across
desktop, tablet, and mobile. This release is currently awaiting the protected
production deployment.

**Learning-experience v4 is live:** exact public source
`abc2d69bc950507ed2b8b72fe6ee586b485a6959` passed public CI run
`34581879391` and protected owner deployment run `34582116074`. KCNA now opens
with one focused session action, KCNA-only due
reviews hand off to the next learning unit, checkpoints expose state, unit rows
show mastery state, readiness explains all four evidence dimensions, and the
workspace surfaces weak objectives from current evidence plus Hard/Again
history. Study units keep forced retrieval as the default but add directional
hints, an explicit Learn-first path that records Encountered evidence only,
Reference mode with no recall evidence, a correction-to-private-notes prompt,
and a clear next-unit action. Local content/type/unit/D1 checks and production
build pass; the expanded browser matrix passes with **25 tests and 2 intentional
skips** across desktop, tablet, and mobile. Independent production probes
verified `/kcna/`, `/learn/ip-subnets/`, `/review?path=kcna`, D1 health, and the
auth session route; the live study page contains the Hint, Learn-first, and
Reference controls. D1 reports `ready` with manifest SHA
`a88c46986674e9d91dd7d2bfdd6332bbe1ce07dfbc1d545887072b7ef3a27e0b`.

**Bottom line:** the dedicated KCNA focus workspace is live on the production
Cloudflare Worker from exact public source
`0cf0d32cb122ede36d8bd5c4ecfacdd6de04c951`. Public CI run `34459708536` is
green, and protected owner deployment run `34459923972` rebuilt that exact SHA,
applied D1 migrations, deployed the Worker, restored owner secrets, and passed
its production checks.

**KCNA focus workspace is live:** `/kcna` isolates the existing
29-unit KCNA path into four study checkpoints—Kubernetes Fundamentals,
Kubernetes Resources, Cluster Behavior, and Cloud-Native Context—without
duplicating canonical Markdown. It also surfaces the two quiz companions,
filters the readiness widget to `path:kcna`, makes KCNA a first-class primary
navigation destination, and gives mapped learning units a direct return link
to the KCNA focus space. Local content/type/unit/D1/build checks pass, the
expanded browser matrix passes with 22 tests and 2 intentional skips, and
independent live probes return 200 for `/kcna/`, `/paths/kcna/`, the Kubernetes
Resources review unit, `/api/health`, and `/api/auth/get-session`. D1 reports
`ready` with manifest SHA
`a88c46986674e9d91dd7d2bfdd6332bbe1ce07dfbc1d545887072b7ef3a27e0b`.

The accepted compact developer-learning workspace is now production: a `<H>`
monogram/wordmark, restrained terminal-green identity, 40px display-title
ceiling, flatter ruled surfaces, dense KCNA/library/search/map rows, and a
question-first study layout. The representative KCNA question is visible
before scrolling on desktop and 375px mobile. Browser QA covers 1440×1000,
768×1024, and 375×812 in light and dark themes with captured evidence,
overflow checks, mobile 44px touch-target checks, type-scale guards, and the
expanded accessibility sweep.

The visual reset is now live on the public app: the content contract, routes,
learning behavior, and privacy boundaries stayed unchanged while the
interface moved from a marketing-like notebook page to a focused study
workspace. The design contract is in [`DESIGN.md`](DESIGN.md), and the
implementation record is in [`docs/UI-REDESIGN-PLAN.md`](docs/UI-REDESIGN-PLAN.md).
The release passed local typecheck, content checks, unit tests, D1 tests,
desktop/mobile E2E and accessibility checks, production build, and protected
route verification.

The detailed **KCNA Learning Path** is now live in production.
It reuses portable prerequisite/foundation units and adds **19 independently
written KCNA-specific units**: 17 detailed topical units plus two compact quiz
companions for Kubernetes Fundamentals and Kubernetes Resources. The review
pages add 30-second scans, ownership maps, common MCQ traps, command cues, and
fast reasoning checks while linking back to the deeper units. The guided KCNA
path now contains **29 units**. The canonical corpus is **37 units, 2 paths,
74 question-first prompts, 37 guided practices, and 191 FSRS cards**. Content
validation, typecheck, 19 unit/privacy tests, D1 checks, production build,
revision classification, `git diff --check`, and all 6 desktop/mobile
E2E/accessibility tests pass. Public commit
`423fab951459a29d7033d6adece2e12ddf40e084` was deployed through protected
owner run `34452917734`; the KCNA path, both quiz-companion pages, raw
Markdown, search, references, D1 health, and manifest SHA were verified live.

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
5. ✅ Completed: protected **owner** run `34452917734` deployed exact public
   commit `423fab951459a29d7033d6adece2e12ddf40e084`, applied D1 migrations,
   preserved Google owner authentication, and verified the KCNA production
   content and manifest without logging secret values.
6. ✅ Completed: UI v3 exact source
   `205044b85a30b3fc6561a7b81531e18f720563ad` passed public CI run
   `34456854247` and protected owner deployment run `34457036278`. Independent
   live probes returned 200 for home, KCNA, study, review, library, search, map,
   references, and the auth session route; D1 reports `ready`, and the live
   content archive SHA-256 is
   `93e876b1f24b7f69b4918be8e3362a21b4431029dc928d6d2792c729aa7f5f1a`.
7. ✅ Completed: KCNA focus exact source
   `0cf0d32cb122ede36d8bd5c4ecfacdd6de04c951` passed public CI run
   `34459708536` and protected owner deployment run `34459923972`. Independent
   live probes verified the dedicated KCNA workspace, plain KCNA path,
   representative KCNA review unit, D1 health, and auth session route.
8. ✅ Completed: adaptive KCNA learning exact source
   `abc2d69bc950507ed2b8b72fe6ee586b485a6959` passed public CI run
   `34581879391` and protected owner deployment run `34582116074`. The release
   adds focused KCNA sessions, path-scoped reviews, checkpoint/mastery states,
   explainable readiness and weak spots, Study/Reference modes, directional
   hints, Learn-first Encountered-only evidence, private correction capture,
   and next-unit handoff. Independent live probes verified the new KCNA and
   study surfaces plus D1 and auth health.

**Architecture decision:** no change is needed. The production path is the
Astro Cloudflare Worker directly; the incompatible Sites preview is optional
and is not part of production.

## Progress at a glance

`✅ Product` → `✅ App` → `✅ Content` → `✅ Private deployment boundary` →
`✅ Guest release` → `✅ Owner release` → `✅ UI reset` → `✅ Detailed KCNA source` →
`✅ KCNA protected release` → `✅ UI v3 release` → `✅ KCNA focus workspace` →
`✅ Adaptive learning v4` → `🟡 Learning progress v5 release` → `🔄 Owner beta gate`

| Phase | Status | What it means |
| --- | --- | --- |
| Product contract | ✅ Complete | Learning flow, mastery, portability, privacy, and rollout rules are documented. |
| Learning app | ✅ Complete | Astro 7/Solid application, question-first study flow, review scheduling, notes, readiness, search, and export are implemented. |
| Initial content | ✅ Complete | 37 reviewed portable units, 2 paths, 74 explain/predict/scenario prompts, 37 guided practices, and 191 cards are generated. |
| Detailed KCNA module | ✅ Live | `/paths/kcna` sequences 29 units, including 17 detailed KCNA topical units plus 2 quiz companions, and is available through search, raw Markdown, `llms*`, manifest, feed, references, and the downloadable archive. |
| KCNA protected release | ✅ Complete | Public source `423fab9` was deployed in owner mode by protected run `34452917734`; the live path, review pages, raw exports, health, and manifest SHA were verified. |
| Production boundary | ✅ Ready | D1 `hmrdkn-devops`, private Worker config, guarded workflow, validators, and rollback metadata are prepared. |
| Guest release | ✅ Complete | Run `33137237808` applied D1 migrations, deployed the Worker and route, and passed all public health/content checks for public commit `45e3209`. |
| Owner beta | 🔄 In progress | Google-only release is deployed and the first allowlisted sign-in works; the ten-session success gate and scheduled-recall evidence remain. |
| UI reset | ✅ Complete | Design contract and redesign plan are written; foundation, shared shell, homepage focus prompt, focused study/review workspace, responsive surfaces, and accessibility fixes are deployed in protected run `33487216904` for source `190e0e5`. |
| UI v3 refinement | ✅ Live | New identity, restrained color system, compact type scale, flat browse surfaces, question-first viewport, and three-size light/dark browser evidence are live from source `205044b`; public CI `34456854247` and protected deploy `34457036278` passed. |
| KCNA focus workspace | ✅ Live | `/kcna` isolates the 29-unit certification path into four checkpoints, surfaces both quiz companions, filters readiness to KCNA, and keeps canonical Markdown shared. Public CI `34459708536`, protected owner deploy `34459923972`, and independent live probes all passed for exact source `0cf0d32`. |
| Adaptive learning v4 | ✅ Live | `/kcna` now chooses the next focused action, scopes review to KCNA, exposes checkpoint/mastery/weak-spot evidence, and supports Study, Hint, Learn-first, and Reference paths without faking recall. Public CI `34581879391`, protected owner deploy `34582116074`, and independent live probes passed for exact source `abc2d69`. |
| Learning progress v5 | 🟡 Release-ready | Completion is tracked independently from evidence-derived understanding, survives content revisions by stable task ID, and is included in learner export v2. Local checks, D1 migration/regression checks, build, and the 25-pass browser matrix are green; protected production deployment is next. |

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
- **2026-09-09 — KCNA path and Kubernetes Resources slice implemented:** added
  `/paths/kcna` and six independently written learning units for manifests/API
  objects, Pod lifecycle/ownership, labels/selectors/ReplicaSets, Deployment
  rollouts/rollbacks, `kubectl apply` versus live state, and namespaces/API
  scope. Each unit includes objectives, question-first model answers and
  critical points, a 60/20/20-style short/prompt/scenario card mix, guided
  practice, and official Kubernetes references. Generated raw Markdown,
  search, reference catalog, feed, `llms.txt`, `llms-full.txt`, manifest, and
  content archive now include the new path. Local `npm run check`, production
  build, revision classification, `git diff --check`, and 6/6 desktop/mobile
  E2E/accessibility tests pass.
- **2026-09-09 — detailed KCNA module completed for release:** expanded the
  guided path to 27 units by adding 11 KCNA-specific modules for the current
  exam-domain map, Kubernetes component/API request paths, networking,
  scheduling/placement, security/access boundaries, persistent-storage
  lifecycle, CI/CD and GitOps, release debugging, observability signals,
  cloud-native architecture principles, and the CNCF ecosystem/community.
  The overall portable corpus is now 35 units, 70 question-first prompts,
  35 guided practices, and 175 FSRS cards. Current KCNA weights and competency
  groupings were rechecked against the CNCF/Linux Foundation blueprint dated
  2026-09-09. Validation also exposed and fixed three duplicate global source
  IDs.
- **2026-09-09 — study-flow hydration race fixed:** the larger validation run
  exposed a browser race where a very fast guest could type into the
  server-rendered textarea before the Solid island hydrated, then lose that
  transient value. The answer input and reveal button now remain disabled
  until hydration completes. `npm run check`, production build,
  `npm run revision:check`, `git diff --check`, and all 6 desktop/mobile E2E
  and accessibility tests pass after the fix.
- **2026-09-10 — KCNA quiz companions added:** added compact, independently
  authored review units for the completed Kubernetes Fundamentals and
  Kubernetes Resources course modules. They summarize component ownership,
  container-runtime/CRI distinctions, Pods, ReplicaSets, Deployments,
  rollouts, API-object anatomy, declarative apply, namespaces, common quiz
  traps, and command cues, with original question-first prompts, FSRS cards,
  guided practice, official Kubernetes references, and links back to the
  relevant KodeKloud module pages for study context. The corpus now validates
  at 37 units, 2 paths, 74 prompts, 37 practices, and 191 cards; the KCNA path
  contains 29 units.
- **2026-09-10 — detailed KCNA release deployed:** public commit
  `423fab951459a29d7033d6adece2e12ddf40e084` was pushed to `hmrdkn-labs/devops`
  and deployed through protected owner run `34452917734`. The workflow passed
  exact-source build validation, D1 migration, Worker deployment, owner-secret
  installation, and production verification. Direct checks confirmed the KCNA
  path, both Kubernetes Fundamentals/Resources review pages, both raw Markdown
  pages, search, references, and `/api/health`; production reports D1 `ready`
  and manifest SHA `a88c46986674e9d91dd7d2bfdd6332bbe1ce07dfbc1d545887072b7ef3a27e0b`,
  matching the released source artifact.
- **2026-09-10 — UI v3 released:** replaced the remaining
  oversized/card-heavy visual treatment with the accepted compact workspace,
  `<H>` identity, restrained terminal-green action/state color, flat ruled
  browse surfaces, and a question-first study composition. The expanded
  Playwright matrix now checks 1440×1000, 768×1024, and 375×812 in both light
  and dark themes, captures six primary surfaces per viewport/theme, and
  enforces overflow, type-scale, initial-question visibility, and mobile
  touch-target contracts. The broader accessibility sweep also found and fixed
  a low-contrast metadata token and an invalid ARIA-labelled progress strip;
  final local verification passes with 19 browser checks and 2 intentional
  non-mobile skips. Public CI run `34456854247` is green for exact source
  `205044b85a30b3fc6561a7b81531e18f720563ad`, and protected owner run
  `34457036278` deployed it successfully. Independent production checks
  returned 200 for every primary route and owner-auth session endpoint; health
  reports D1 `ready` with manifest SHA
  `a88c46986674e9d91dd7d2bfdd6332bbe1ce07dfbc1d545887072b7ef3a27e0b`.

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
npm run check       # 37 units, 2 paths, 191 cards; 19 unit/privacy tests
npm run build       # generated the 29-unit /paths/kcna and portable exports
npm run revision:check
npm run test:e2e    # 19 passed, 2 intentional skips; desktop/tablet/mobile, light/dark
git diff --check
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
- Expansion from the current 37 units toward the broader 70–100-unit DevOps curriculum; the detailed KCNA-specific domain coverage is now implemented, while later content growth can deepen prerequisites and add post-KCNA paths without changing the content contract
- Restore, ranked retrieval, digest email, optional public profile,
  diagnostics, and freshness monitoring
- Formal executable lab provisioning and a lab CLI
- Container deployment and the later D1-to-PostgreSQL migration

These are later plan increments, not regressions in the current owner-beta
implementation.

## Safe resume order

1. Run the owner-beta success gate: ten real focus sessions over seven days,
   scheduled recall, one content revalidation, and a full export.
2. Review learning evidence from the beta, then deepen weak KCNA topics or
   begin the next certification path as a content-only increment.
3. Keep UI changes inside the v3 design contract and use the browser evidence
   matrix to catch hierarchy, accessibility, and responsive regressions.

Do not place Cloudflare resource IDs, OAuth credentials, owner provider IDs, or
production deployment permissions in this public repository.
