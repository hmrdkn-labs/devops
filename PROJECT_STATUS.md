# DevOps by hmrdkn-labs — project status

> **Last updated:** 2026-09-15 · This is the canonical running log. Update it
> whenever a phase completes, work starts, or a blocker changes.

## Read this first

**Stable learning workspace + question depth v15 is release-ready:** the
standard `/learn/*` experience no longer treats History, Reference, or Notes as
destinations. Study is the persistent workspace. Desktop keeps the unit outline,
720px learning stage, and 320px contextual panel in stable columns; narrower
screens use an overlay drawer and mobile uses a bottom sheet above the app dock.
Opening previous answers now preserves the URL, current question, draft answer,
page scroll, and learning-stage geometry. Reference material and private notes
open in the same contextual surface, and the legacy `?mode=reference` deep link
is retained as a compatibility entry into that panel. The whole-surface View
Transition/Web Animation swap, sidebar collapse/recentering, and automatic
smooth `scrollIntoView` behavior have been removed; motion is limited to small
local disclosure/feedback transitions. Answer-history metadata also has a
reserved loading state so async data does not insert a surprise block into the
question layout.

The content floor was raised at the same time: every published unit must now
have at least **three retrieval/application questions**. All **37 published
units** were expanded from two to three questions (**111 unit questions total**)
with an evidence-first scenario derived from that unit's existing guided
practice and objectives, rather than generic filler. These are mastery-affecting
content changes, so the 37 unit revisions advanced to revision 2 and preserve
the normal evidence-revalidation boundary. Local validation is green: content
contract, revision classification, Astro typecheck, **36 unit tests**, D1
checks, production build, `git diff --check`, and the full Playwright
desktop/tablet/mobile matrix with **57 passed / 18 intentional skips**. Visual QA
confirmed a fixed 720px learning stage with a separate 320px context column at
1440px and an opaque, bounded bottom sheet at 390px with no horizontal overflow.
**No implementation blocker; protected release and production verification are
the remaining steps.**

**Complete private answer history v14 is live and production-verified:**
previous explanations are now discoverable without weakening retrieval-first
learning. Study mode fetches answer metadata only, so an answered question shows
an **Answered before** cue, saved-attempt count, latest timestamp, and a
**Review previous answers** action while the previous wording stays hidden.
Reference mode now shows **every saved attempt**, newest first within each
question, labels the latest versus previous attempts, and preserves answers from
retired or changed question IDs under **Earlier content revisions** instead of
silently dropping them. The authenticated `/api/answers` endpoint also supports
`view=metadata`, which omits `answerMarkdown`; full history is fetched only when
the learner intentionally opens Reference/history. Successful persistence
refreshes both views. Local validation is green: Astro typecheck, **36 unit
tests**, D1 checks, production build, `git diff --check`, and the full Playwright
desktop/tablet/mobile matrix with **57 passed / 18 intentional skips**. Exact
public source `c4aa86c650fe1b35e94878a4d907fa5c0937318b` passed public CI run
`34950405036` and protected owner deployment run `34950598745`. Live signed-in
production QA on `kubernetes-manifests` confirmed the Study cue reports two
saved attempts, and Reference mode exposes both historical answers for the first
question plus the saved `spec` versus `status` explanation for the second.
**No implementation or deployment blocker.**

**Component ownership + private explanation history v13 is live:**
Kubernetes visuals can now carry a portable component responsibility map in
canonical YAML: exact component name, architectural location, responsibility,
what it acts on, and a smallest useful proof command. The same map renders in
both reference visuals and KCNA Learn-first/feedback surfaces. Core Kubernetes
units now distinguish control-plane versus worker-node work and name concrete
controllers such as **Deployment controller (kube-controller-manager)** and
**ReplicaSet controller (kube-controller-manager)** instead of collapsing them
into a generic "controller" label. The Resources checkpoint also teaches the
handoff from ReplicaSet controller → scheduler → kubelet and separates API
acceptance from kubelet/runtime execution evidence. Separately, owner answers
were already stored in D1 `private_answer` rows but had no read path. A new
authenticated `/api/answers` endpoint now returns only the current owner's
unit-scoped history. Fresh Study retrieval still hides prior explanations; once
the learner reveals an attempt, saved explanations become available for
comparison, and Reference mode shows the latest private explanation per
question. Guest state remains memory-only and private answers remain excluded
from public search and public artifacts; production returns `401` for an
unauthenticated `/api/answers` request. The architecture walkthrough also makes
the coordination boundary explicit: controllers, scheduler, and kubelet use
`kube-apiserver`; the API server persists state to `etcd`; kubelet delegates
container execution to the runtime. Local validation is green: content
contract, Astro typecheck, **36 unit tests**, D1 checks, production build,
`git diff --check`, and the full Playwright desktop/tablet/mobile matrix with
**57 passed / 18 intentional skips**. Exact public source
`a3da77be80ea396c5690d99eba9e72b6dcb1e490` passed public CI run
`34946364119` and protected owner deployment run `34946592186`. Production
health reports status `ok`, D1 `ready`, and content manifest SHA
`26ff83a311513605b5482f1e19e465a39b7108d8e634b72e19f4d58a50940aff`.
Live production QA confirmed the architecture component map and corrected API
request path. **No implementation or deployment blocker.**

**Study-flow continuity v12 is live:** the standard `/learn/*`
question-first experience now treats question changes, Study ↔ Reference, and
Learn-first ↔ retrieval as one continuous learning surface instead of mounting
unrelated blocks with entry-only fades. Supporting browsers use the
same-document View Transitions API; other browsers use a restrained 80 ms exit
+ 160 ms Web Animations crossfade. Desktop Reference mode now collapses the
context rail smoothly while the learning surface recenters, and mobile keeps a
single-column transition. Forward/back direction is subtle, focus returns to
the answer field after question or Learn-first transitions, and the active
surface is aligned back into view without changing persistence or mastery
semantics. `prefers-reduced-motion` bypasses the motion while preserving the
same state and focus behavior. New browser regressions cover next-question
focus, Learn-first return focus, Study/Reference URL state, one persistent
learning surface, and reduced-motion behavior. Local QA is green: Astro
typecheck, **36 unit tests**, D1 checks, production build, `git diff --check`,
and the full Playwright desktop/tablet/mobile matrix with **54 passed / 18
intentional skips**. A real local browser pass on `container-lifecycle`
confirmed Study → Reference → Study layout continuity in both directions,
including the Web Animations fallback used by that browser. Exact public source
`9faccf5cd9d0523ef059156fb6fcfa2e5173b249` passed public CI run
`34942113889` and protected owner deployment run `34942342513`. Production
health reports status `ok`, D1 `ready`, and content manifest SHA
`5844708533a0b634ce26b1028d38184e377b85ad9a7b5b6a36bfda4900d2d85a`.
A live production inspection of `container-lifecycle` confirms one persistent
`study-surface` with `view-transition-name: study-surface`, animated grid
columns/gap, and opacity/transform rail transitions loaded on the deployed
page. **No implementation or deployment blocker.**

**Reference visual learning v11 is live:** the visual teaching
layer is no longer limited to KCNA exercises. All **37 published reference
units** now carry a framework-independent `visuals.yaml` sidecar with an
immutable visual ID, kind, eyebrow, title, ordered lines, and a teaching point.
The same step-through visual engine used by the KCNA player is now rendered at
the top of both Learn-first reading and direct Reference mode, before the
canonical Markdown lesson. This keeps the source portable while giving Linux,
networking, containers, Kubernetes, delivery, architecture, and operations
references an explicit causal/state/ownership model. The content compiler,
runtime catalog, manifest, raw exports, and downloadable archive include the
new sidecars, and published-unit validation fails if a reference visual is
missing. Reference visuals are classified as enrichment, so they do not alter
Recall/Application/Retained evidence or FSRS state. Local validation is green
for content, Astro typecheck, 36 unit tests, D1 checks, production build, and
the reference-mode browser contracts on desktop/tablet/mobile. The final
Playwright matrix is green, including an explicit 390px regression for the
networking reference's long inline technical URL. Rendered Chromium QA on
`kubernetes-networking-request-path` confirmed the intended hierarchy: visual
model first, explanatory prose/code second, guided practice and recall below.
Exact source `da80f7a51fbe766b821e19af5c828fe11bc94b92` passed public CI run
`34940394772` and protected owner deployment run `34940606974`. Independent
production verification reports D1 `ready`, content manifest SHA
`5844708533a0b634ce26b1028d38184e377b85ad9a7b5b6a36bfda4900d2d85a`, and the
live 390px Reference page remains exactly 390px wide while its visual advances
from step 1/6 to 2/6. **No implementation or deployment blocker.**

**KCNA visual learning v10 is live:** every one of the **45 KCNA
interactive exercises** now has a reusable visual teaching layer in both its
assisted Learn-first path and its post-attempt feedback. Existing portable YAML
`visual` arrays remain the source of truth; the Solid player now renders them as
step-through causal presentations with an active stage, progress rail,
Back/Next, Play/Pause, and Replay controls. One-line arrow chains are expanded
into progressive frames instead of being shown as static ASCII. Motion remains
instructional and restrained, and `prefers-reduced-motion` disables transition
animation without removing the step controls. The layout is responsive on
desktop/tablet/mobile and does not change Encountered/Recall/Application or
FSRS semantics. KCNA content validation now fails if either the Learn-first or
feedback visual is missing, so future exercises cannot silently regress to
text-only teaching. Local validation is green: 77-file typecheck, 35 unit tests,
D1 checks, production build, `git diff --check`, and the full Playwright matrix
with **48 passed / 18 intentional skips**. Rendered Chromium QA covered light
desktop, light 390px mobile, and dark wrong-answer feedback. Exact public source
`5605c0e79b80e8aed1bc22c80ee72e45ed2153e6` passed public CI run
`34936146938` and protected owner deployment run `34936298059`. Independent
production probes returned 200 for home, KCNA, all four lesson routes, and
health; D1 reports `ready` with manifest SHA
`af3dbc9b742471bf19ae3983eeaa9f314fb7e774fc9183b6a8cdcc2295d0aaf7`.
A live guest browser check opened the Resources lesson, entered Learn-first,
confirmed the 4-step visual walkthrough and Back/Play/Next/Replay controls,
advanced from step 1/4 to 2/4, then returned to retrieval and intentionally
submitted a wrong answer. The feedback rendered a separate 4-step causal model,
the learner/expected answers, option rationales, Try again, and Continue while
explicitly keeping the session memory-only. **No implementation or deployment
blocker.** Next step is real-use evaluation of whether the visual guidance
improves understanding and recall across all four checkpoints.

**KCNA interactive curriculum v9 is live:** the interactive lesson
model now covers all four KCNA checkpoints instead of only the Resources pilot.
`content/lessons/` contains four portable checkpoint lessons with **45 total
interactions**: 11 for Kubernetes Fundamentals, 12 for Kubernetes Resources, 11
for Cluster Behavior, and 11 for Cloud-Native Context. The three new lessons
reuse the same renderer-independent primitives, assistance rules, feedback
model, private evidence endpoint, and Encountered/Recall/Application semantics;
they do not create Retained evidence or bypass FSRS. The immersive player is now
checkpoint-agnostic, and `/kcna` discovers lesson launchers from the lesson
catalog rather than hard-coding Resources. New browser contracts verify all four
launchers, checkpoint titles, safe exit anchors, exercise counts, and responsive
overflow behavior. Exact public source
`503cc958c3ee9caf976e541e0cd6fa42bc96caed` passed public CI run
`34927502284` and protected owner deployment run `34927892274`. Independent
production probes returned 200 for home, KCNA, all four lesson routes, and
health; D1 reports `ready` with manifest SHA
`af3dbc9b742471bf19ae3983eeaa9f314fb7e774fc9183b6a8cdcc2295d0aaf7`.
A live guest browser check confirmed all four checkpoint launchers, opened the
Fundamentals, Cluster Behavior, and Cloud-Native Context players with the
correct checkpoint titles, exercise counts, and safe exit anchors, and submitted
an intentionally wrong Fundamentals answer. The UI exposed the learner answer,
expected answer, causal explanation, option-by-option rationale, Try again, and
Continue while explicitly keeping the guest session memory-only. Local content
validation reports **4 interactive lessons / 45 lesson exercises**; 76-file
typecheck, 35 unit tests, D1 checks, production build, `git diff --check`, and
the full Playwright matrix pass with **47 passed and 16 intentional skips**
across desktop, tablet, and mobile. **No implementation or deployment blocker.**
Next step is real-use evaluation across all four checkpoints.

**Interaction smoothness v8 is live:** exact public source
`2190646705e5f25638de6bde224a888a63f6ed64` passed public CI run
`34924053087` and protected owner deployment run `34924211727`. The app remains
Astro + Solid + Cloudflare/D1, but learner-facing state changes no longer wait for persistence.
Question-first reveal, lesson checking, Learn-first, and recall rating update the
UI immediately while authenticated writes finish in the background. Async
responses are snapshot/sequence guarded so an older request cannot overwrite the
status of a later question or correction attempt. Feedback, hints, model
comparisons, MCQ transitions, buttons, options, and progress bars now use a
restrained 120–180 ms motion system; reduced-motion still collapses it. Lesson
feedback is positioned before persistence returns, and question changes use
stable focus plus a short enter transition. A new Playwright regression test
holds `/api/attempt` open and proves the model answer is visible before the
network write completes. Local `npm run ci`, D1 checks, `git diff --check`, and
the full Playwright matrix pass: **43 passed with 14 intentional skips** across
desktop, tablet, and mobile. Independent production probes returned 200 for
home, KCNA, the Resources lesson, KCNA practice, and health; D1 reports `ready`
with manifest SHA `33f23e2e5ba81f573b435a45fd52b70539b1fcadbdb8444842010d2e421af450`.
A live guest browser check reloaded the deployed Resources lesson, selected a
wrong answer, and immediately exposed the learner answer, expected answer,
causal explanation, Try again, and Continue controls without writing mastery
evidence. **No implementation or deployment blocker.** Next step is real-use
evaluation of interaction feel before expanding the motion system further.

**Feedback clarity release is live:** exact public source
`8afba99be47ce582f430b47cbc8e65ec2194207f` passed public CI run
`34755696607` and protected owner deployment run `34755814811`.
Every scored KCNA lesson interaction now gives an explicit verdict, identifies
the learner's answer and the expected model, marks correct/incorrect rows or
positions, explains the mechanism, and offers a correction attempt. Ordering
tasks show the learner and expected sequences side by side; connect and manifest
tasks show the expected value per missed row. KCNA MCQs now distinguish Correct,
Not quite, and Corrected, label selected/missed options in words, and preserve
the first-attempt score after retry. Standard question-first units now summarize
the learner's own critical-point check and list missing ideas after rating. The
ambiguous reconciliation trace was rewritten as intent → failure → compare →
replace → observe, and its lesson revision advanced to 2. Browser-first QA
verified wrong-answer and correction journeys; the full Playwright matrix is
**42 passed with 12 intentional skips** across desktop, tablet, and mobile.
Content validation, 76-file typecheck, 35 unit tests, D1 checks, revision checks,
production build, accessibility, and overflow checks pass. **No blocker:** next
step is real-use evaluation of whether each correction is understandable without
outside help. Independent production probes returned 200 for home, KCNA, MCQ,
lesson, raw lesson YAML, health, and owner-auth routes. D1 reports `ready` with
manifest SHA `33f23e2e5ba81f573b435a45fd52b70539b1fcadbdb8444842010d2e421af450`
and lesson revision 2. A live guest browser attempt visibly confirmed Not quite,
the learner answer, expected answer, option labels, causal explanation, and Try
again without writing mastery evidence.

**Interactive Lesson Player pilot is live:** exact public source
`85d61fae6da76c34509e132840147d10ede55d6e` passed public CI run
`34750388714` and protected owner deployment run `34750501484`. The single
**KCNA → Kubernetes Resources** vertical slice now has a portable
12-step lesson, immersive `/lesson/kcna-kubernetes-resources` player, focused
KCNA launcher, and a private owner evidence endpoint. It supports choose,
arrange, connect, command-builder, terminal-inspection, manifest-fill, trace,
predict-state, spot-bug, and explain interactions. Assistance, reveal, wrong
answers, and Learn-first create Encountered evidence only; a clean correct
attempt may create Recall or Application evidence. Completion is tracked
separately, and lesson activity never manufactures Retained/FSRS evidence.

Browser-first QA covered a complete 12-step dark desktop journey, 1024×768
light, and 390×844 light/dark—including a complete mobile journey. It found and
fixed a clipped smooth-scroll transition and a pre-hydration tap race. Those
behaviors are now encoded in Playwright with keyboard, focus, touch-target,
overflow, theme, reduced-motion, safe-exit, assistance-payload, and serious /
critical axe checks. A clean Worker-runtime run also exposed a Wrangler 4.126
proxy crash and production trailing-slash behavior; Wrangler is now pinned to
4.131.1 and the Worker-native contracts pass. The full matrix is **41 passed
with 10 intentional skips**;
content validation, 76-file typecheck, 35 unit tests, real local D1 tests, and
the production build also pass. Independent production probes returned 200 for
the KCNA launcher, lesson, raw lesson YAML, manifest, health, owner-auth session,
and auth configuration routes. D1 reports `ready` with manifest SHA
`cc9d4bb2f664e2fa1fba540359a33887751b7c86084d55e4fd5b6660c065f2d6`,
and unauthenticated lesson persistence returns 401. A live browser run completed
the first interaction, inspected its causal feedback, and advanced to step 2/12.
**There is no implementation or deployment blocker.** This pilot is now
superseded by the four-checkpoint v9 rollout above; the next milestone is
real-use evaluation of the complete KCNA interactive curriculum.

**KCNA MCQ refresher v7 is live:** exact public source
`9566794ca8b4834e1a686ef09b9457420eb0864a` passed public CI run
`34590530006` and protected owner deployment run `34620453123`.
`/practice/kcna` adds a portable YAML-backed bank of **26 independently authored questions** across Fundamentals,
Resources, Cluster Behavior, and Cloud-Native Context. The bank includes **9
kubectl command questions** and **7 multi-select questions**. Quick sessions use
12 questions (three per checkpoint), while the full bank remains available on
demand. Checking an answer explains **every option**, including distractors,
and links back to the relevant canonical learning units. MCQ sessions are
memory-only and deliberately do not write FSRS/readiness evidence. The KCNA
focus workspace now exposes the MCQ bank directly. The content compiler validates
practice-set IDs, answer-option integrity, certification mapping, and unit links,
and publishes the practice set in the manifest/raw archive. Local content,
type, unit, D1, build, desktop/tablet/mobile interaction, accessibility, and
overflow checks pass; the browser matrix has **28 passed and 2 intentional
skips**. A separate existing study hydration race was also fixed by keeping
Hint/Learn-first controls disabled until their client handlers are attached.
Independent production probes returned 200 for home, KCNA, the MCQ route, the
raw practice YAML, and the owner auth-session route. D1 reports `ready` with
manifest SHA `e3f93027e121e9f2ca0a01b8a500089982b5b7492ca8ec91e0369fa593d1ce3b`,
and the live manifest advertises `kcna-mcq` with 26 questions.

**Learning-product UI v6 is live:** exact public source
`a9ebfe1a9f8ca9384cccbbef5ba2a48205ffcfc3` passed public CI run
`34588219031` and protected owner deployment run `34588405704`. The release keeps
the terminal-green identity and portable content contract while moving the
primary learning surfaces toward proven Duolingo/Brilliant interaction
patterns: one dominant next action, clearer progression, tactile question and
checkpoint surfaces, stronger state hierarchy, and a persistent four-item
mobile learning dock. KCNA now shows an explicit learned-path meter and a more
prominent Today's Session card; study units expose the Retrieval → Explain →
Practice loop and a clearer question-stage treatment. Long-form/reference
content remains visually quieter, and no canonical Markdown, mastery/evidence
logic, or guest-persistence boundary changed. Local content/type/unit/D1/build
checks pass, and the full browser matrix passes with **25 tests and 2
intentional skips** across desktop, tablet, and mobile, including WCAG contrast,
44px touch targets, initial-question visibility, and horizontal-overflow guards.
Independent production probes returned 200 for home, KCNA, the Kubernetes
Resources quiz companion, KCNA-scoped review, auth session, and health; D1 is
ready with the unchanged canonical manifest SHA. A rendered 375×812 production
check confirmed the new KCNA session surface and persistent mobile learning dock.

**Learning-progress v5 is live:** exact public source
`8e63ad1d4a49fb41df49a8f2482527cc2e9e8e0f` passed public CI run
`34584535362` and protected owner deployment run `34584744823`. Learning
completion and understanding are now deliberately separate signals. Units track durable
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
desktop, tablet, and mobile. Independent production probes returned 200 for
`/api/health`, `/kcna/`, the KCNA Resources review unit, KCNA-scoped review,
and the auth-session route; the new progress endpoint correctly returned 401
without owner authentication. D1 reports `ready` with manifest SHA
`a88c46986674e9d91dd7d2bfdd6332bbe1ce07dfbc1d545887072b7ef3a27e0b`.

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
9. ✅ Completed: learning-progress v5 exact source
   `8e63ad1d4a49fb41df49a8f2482527cc2e9e8e0f` passed public CI run
   `34584535362` and protected owner deployment run `34584744823`. The release
   applied the `unit_task_progress` D1 migration, separates durable completion
   from evidence-derived understanding, preserves stable task completion across
   content revisions, exports the new progress records, and exposes both signals
   in KCNA and study surfaces. Independent probes verified D1 health, KCNA,
   study/review routes, auth, the new unit-progress authorization boundary, and
   the unchanged canonical content manifest.
10. ✅ Completed: KCNA Resources lesson exact source
    `85d61fae6da76c34509e132840147d10ede55d6e` passed public CI run
    `34750388714` and protected owner deployment run `34750501484`. The workflow
    rebuilt the immutable public source, applied D1 migrations, deployed the
    Worker, restored owner secrets, and passed its route/manifest/health checks.
    Independent probes and a live browser interaction then verified the lesson,
    raw artifact, 12-exercise manifest entry, D1 readiness, guest-write rejection,
    causal feedback, and step progression.

**Architecture decision:** no change is needed. The production path is the
Astro Cloudflare Worker directly; the incompatible Sites preview is optional
and is not part of production.

## Progress at a glance

`✅ Product` → `✅ App` → `✅ Content` → `✅ Private deployment boundary` →
`✅ Guest release` → `✅ Owner release` → `✅ UI reset` → `✅ Detailed KCNA source` →
`✅ KCNA protected release` → `✅ UI v3 release` → `✅ KCNA focus workspace` →
`✅ Adaptive learning v4` → `✅ Learning progress v5` → `✅ UI v6 live` →
`✅ MCQ refresher v7 live` → `✅ Resources lesson live` → `✅ Feedback clarity live` → `🔄 Pilot evaluation` →
`🔄 Owner beta gate`

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
| Learning progress v5 | ✅ Live | Completion is tracked independently from evidence-derived understanding, survives content revisions by stable task ID, and is included in learner export v2. Public CI `34584535362`, protected owner deploy `34584744823`, and independent live probes passed for exact source `8e63ad1`. |
| Learning-product UI v6 | ✅ Live | Proven learning-product affordances are applied without changing content or evidence semantics: dominant next action, stronger checkpoint/question surfaces, learned-path progress, explicit learning-loop cues, tactile controls, and persistent mobile navigation. Exact source `a9ebfe1` passed public CI `34588219031`, protected owner deploy `34588405704`, and independent production probes plus rendered mobile verification. |
| KCNA MCQ refresher v7 | ✅ Live | `/practice/kcna` provides 26 original MCQs, including 9 kubectl command questions and 7 multi-select questions, with rationale for every option and canonical-unit review links. Session scores remain memory-only and do not alter mastery/readiness. Exact source `9566794` passed public CI `34590530006`, protected owner deploy `34620453123`, and independent production route/manifest/D1 probes. |
| KCNA Resources lesson pilot | ✅ Complete | The 12-exercise Resources pilot proved the portable lesson schema, evidence semantics, immersive player, browser contracts, and production boundary. It is now the retained second checkpoint inside the broader v9 rollout. |
| KCNA interactive curriculum v9 | ✅ Live | All four KCNA checkpoints now have portable interactive lessons: Fundamentals 11, Resources 12, Cluster Behavior 11, and Cloud-Native Context 11. Exact source `503cc95` passed public CI `34927502284`, protected owner deploy `34927892274`, independent production probes, and live guest browser verification of launchers, checkpoint identity, safe exits, and wrong-answer feedback. D1 is `ready` with manifest SHA `af3dbc9b742471bf19ae3983eeaa9f314fb7e774fc9183b6a8cdcc2295d0aaf7`. |
| KCNA visual learning v10 | ✅ Live | All 45 KCNA exercises now render portable Learn-first and feedback visuals as interactive step-through presentations with progressive causal frames, playback controls, responsive layouts, and reduced-motion support. Exact source `5605c0e` passed public CI `34936146938`, protected owner deploy `34936298059`, independent route/D1 probes, and a live guest Learn-first + wrong-answer visual check. Content validation requires both visual surfaces. |
| Feedback clarity | ✅ Live | Lesson primitives, KCNA MCQs, and question-first self-checks now expose actionable correct/incorrect detail and honest correction attempts. Exact source `8afba99` passed public CI `34755696607`, protected owner deploy `34755814811`, the 42-pass browser matrix, and a live guest wrong-answer check. |

**Repositories:** [public app](https://github.com/hmrdkn-labs/devops) · private
deployment boundary: `hamardikan/hamardikan-infra`

The public repository has independent history. The private KodeKloud
knowledge base was not copied into this repository, is not a build dependency,
and was not modified while this application was built.

## Progress log

- **2026-09-13 — feedback clarity released:** exact public source `8afba99`
  passed CI run `34755696607` and protected owner deployment run `34755814811`.
  Lesson choices, ordering, connections, manifest fields, free-response
  self-checks, and KCNA MCQs now explain exactly what the learner selected,
  what was expected, why, and how to retry without inflating first-attempt
  evidence. The reconciliation trace is explicit and versioned as lesson
  revision 2. Production routes, owner auth, D1 readiness, manifest SHA, and a
  real live guest wrong-answer flow were independently verified.
- **2026-09-13 — KCNA Resources lesson pilot released:** exact public source
  `85d61fa` passed CI run `34750388714` and protected owner deployment run
  `34750501484`. Independent production probes verified 200 responses for the
  launcher, lesson, raw YAML, manifest, health, auth configuration, and owner
  auth-session routes; D1 is ready, health and manifest agree on SHA
  `cc9d4bb2f664e2fa1fba540359a33887751b7c86084d55e4fd5b6660c065f2d6`,
  and guest persistence returns 401. A real production browser session entered
  through KCNA, answered the first task, inspected the complete causal feedback,
  and advanced to step 2/12.
- **2026-09-13 — KCNA Resources lesson pilot locally completed:** added the
  portable lesson contract and 12-step Resources lesson, immersive player,
  focused KCNA entry, private answer/completion/evidence persistence, revision
  validation, raw/archive/manifest output, and authoring documentation. Manual
  browser QA traversed the complete lesson on desktop and mobile and checked
  1024×768 plus 390×844 light/dark layouts. It drove fixes for transition
  positioning and pre-hydration taps before Playwright codified the journey.
  The final clean Worker-runtime gate also updated Wrangler from 4.126.0 to
  4.131.1 after reproducing a Miniflare proxy crash and aligned URL assertions
  with production trailing slashes. Content/type/unit/D1/build checks pass; the
  full browser matrix is 41 passed with 10 intentional skips. No other KCNA
  checkpoint was migrated in this pilot.
- **2026-09-11 — KCNA MCQ refresher v7 released:** exact source `9566794`
  passed public CI `34590530006` and protected owner deployment `34620453123`.
  Independent production probes verified `/practice/kcna`, the raw YAML practice
  set, owner auth-session route, and D1-ready health. The live manifest exposes
  `kcna-mcq` with 26 questions and manifest SHA
  `e3f93027e121e9f2ca0a01b8a500089982b5b7492ca8ec91e0369fa593d1ce3b`.
- **2026-09-11 — KCNA MCQ refresher v7 prepared:** added a portable 26-question
  practice set plus a dedicated `/practice/kcna` learning-product surface with
  Quick 12/all-bank modes, command recognition, select-all questions, per-option
  rationales, and canonical-unit review links. The practice schema is validated
  and included in raw/archive/manifest outputs without changing readiness or
  FSRS evidence. Browser QA passes with 28 tests and 2 intentional skips across
  desktop, tablet, and mobile. Mobile layout was tightened until the active
  question appears in the initial viewport, and an existing pre-hydration
  Hint/Learn-first tap race was fixed. Awaiting public CI and protected deploy.
- **2026-09-11 — learning-product UI v6 released:** exact source `a9ebfe1`
  passed public CI `34588219031` and protected owner deployment `34588405704`.
  Independent production probes verified the public KCNA/study/review/auth/health
  surfaces and D1 readiness, and a rendered 375×812 production check confirmed
  the new session card and persistent mobile learning dock.
- **2026-09-11 — learning-product UI v6 prepared:** refreshed the design
  contract and primary KCNA/study surfaces around proven learning-product
  patterns, added learned-path progress and a persistent mobile learning dock,
  and strengthened tactile/state hierarchy while preserving the existing
  content and evidence model. Local checks pass; browser QA is 25 passed / 2
  intentional skips across desktop, tablet, and mobile. Awaiting CI and
  protected owner deployment.
- **2026-09-11 — learning progress v5 released:** exact source `8e63ad1` adds
  durable question/lesson/practice completion alongside the existing
  evidence-derived understanding model. Public CI `34584535362` passed;
  protected owner deployment `34584744823` applied the D1 migration and
  promoted the Worker. Independent probes verified the new markers, D1-ready
  health, owner-auth route, and unauthenticated rejection of progress writes.
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

The current reference-visual + KCNA learning application completed the
following checks:

```text
npm run content:check  # 37 units, 2 paths, 26 MCQs, 4 lessons / 45 exercises, 191 cards
npm run typecheck      # 77 files; 0 errors, warnings, or hints
npm test               # 36 passed
npm run test:d1        # migration, idempotency, lesson evidence, and revalidation
npm run test:e2e       # full desktop/tablet/mobile matrix, including reference visuals
npm run build          # Cloudflare Worker production build + portable visual sidecars
git diff --check
```

Browser QA covers desktop/tablet/mobile, Learn-first, direct Reference mode,
visual stepping, long technical literals, keyboard/touch operation, reduced
motion, overflow, serious/critical accessibility violations, guest privacy,
answer privacy, completion separation, and revision/evidence behavior. Exact
source `da80f7a51fbe766b821e19af5c828fe11bc94b92` passed public CI
`34940394772` and protected owner deploy `34940606974`; independent live probes
verified health/D1, the reference visual interaction, and the 390px no-overflow
contract described at the top.

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

- Real-use evaluation of the full four-checkpoint interactive KCNA curriculum,
  including return-review behavior and evidence quality across the new lessons
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

1. Use all four checkpoint lessons across real study sessions and record
   friction, completion, understanding, and return-review behavior.
2. Continue the owner-beta success gate: ten real focus sessions over seven days,
   scheduled recall, one content revalidation, and a full export.
3. Review learning evidence from the beta, then deepen weak KCNA topics or
   begin the next certification path as a content-only increment.
4. Keep UI changes inside the v3 design contract and use the browser evidence
   matrix to catch hierarchy, accessibility, and responsive regressions.

Do not place Cloudflare resource IDs, OAuth credentials, owner provider IDs, or
production deployment permissions in this public repository.
