# DevOps by hmrdkn-labs — project status

> **Last updated:** 2026-09-17 · This is the canonical running log. Update it
> whenever a phase completes, work starts, or a blocker changes.

## Read this first

**Current work: learner journey simplification.** Research and the feature/access
map are recorded in [the redesign plan](docs/LEARNER-JOURNEY-REDESIGN.md).
The implementation on `feat/learning-journey-ux` provides a concrete Start/Continue
action, consistent Learn / Review / Practice / Library navigation, and disclosed
study tools. Plan commit: `533456a`; code commits: `c8c5136` (guided navigation
and path), `d93e3ea` (focused tasks and mobile feedback), and `65ebdeb`
(model hydration race fix). The latest user request is to make this
release-ready and provide a preview before continuing to release.

Final local acceptance passed against settled code `65ebdeb`: `npm run ci`
with **82 Vitest tests**, zero Astro errors/warnings, content/D1 checks,
production build, and release manifest generation; revision checking against
`origin/main` and diff checking also passed. Release classification:
`application-or-schema`. The content manifest remains
`123f97da1eecfff2ff8eb6312465000e2057533617742dafad7b1d502bb9f0e8`.
A fresh full Playwright matrix passed **139 cases / 44 intentional skips**
(183 cases, 53.3 seconds). Coverage includes delayed model-island hydration,
due-review loading, mobile correct/wrong feedback focus and action-bar
non-overlap, repaired account-loading and Continue cases, and the prior
learning/privacy regressions. Manual browser inspection confirmed visible
390px dark Resources wrong-answer feedback above the actions and contextual
draft retention; generated desktop light Learn and dark Study screenshots were
also inspected. Other viewport checks, including 320px, are automated.
Real-owner persistence has not been tested end to end; no learner efficacy
claim is made. Release review is [PR #14](https://github.com/hmrdkn-labs/devops/pull/14)
on `feat/learning-journey-ux`, open and mergeable with a clean merge state at
candidate `5a9af11fce867037f90b7b218c3f534ce7e95fe7`.
[GitHub CI run 35202009687](https://github.com/hmrdkn-labs/devops/actions/runs/35202009687)
passed validation, browser, and no-production-secrets checks for that exact
candidate; browser checks finished `2026-09-17T08:56:06Z`. This receipt does not
establish CI for later documentation commits; accepted code remains `65ebdeb`.

A guest preview is running at [localhost:4321](http://localhost:4321/) on this
Mac using `wrangler.e2e.jsonc`, with no database or auth binding. Answers stay in
memory; this preview cannot verify real owner persistence. Follow the
[preview checklist](docs/PREVIEW-CHECKLIST.md). **Production is unchanged.**
Merge and protected production deployment remain after the user's preview and
the final-head release gates. The successful releases below are historical baselines.

**Latest interaction release: ordered lesson tasks now support direct drag and
drop.** Commit `ed036f9` adds a visible grab handle to `arrange`, `trace`, and
`command_builder` exercises, native desktop drag-and-drop, touch/pen pointer
reordering, live position announcements for assistive technology, and retains
the existing up/down buttons as the keyboard-accessible fallback. CI run
`35189729726` passed the full gate with **82/82 Vitest** and **98 Playwright
passes / 40 intentional skips** across desktop/tablet/mobile. Protected owner
deployment run `35190023766` deployed exact source
`ed036f9eb3cbca23527f822e1b40304fbd4a51b3`. Independent production verification
returned HTTP 200 for `/lesson/kcna-cluster-behavior/`, confirmed the drag handle
and Service-DNS ordering drag label are present, and `/api/health` reports `ok`
with D1 `ready`. **No blocker remains for this interaction release.**

**Current work: Interactive Mental Models v1 and the KCNA Scheduling enrichment
are committed, pushed, deployed, and live.** Mental-model commit `7a23322` and
Scheduling commit `3a34836` (`feat(kcna): deepen scheduling review`) are both on
`origin/main`. CI run `35188612945` passed for exact production source
`3a3483655e21b3032eb1377c62c76a36f75db13a`; protected owner deployment run
`35188946033` then deployed that source successfully. Production `/api/health`
reports `status=ok`, D1 `database=ready`, and manifest SHA
`123f97da1eecfff2ff8eb6312465000e2057533617742dafad7b1d502bb9f0e8`.
The 2026-09-17 Scheduling audit compared the public
companion against the private KodeKloud index and current Kubernetes docs, then
added the missing KCNA-level concepts: `PriorityClass` / `priorityClassName`,
priority-aware queue ordering and preemption, `QueueSort`, the broader scheduler
framework extension points (`PreFilter`, `Filter`, `PostFilter`, `PreScore`,
`Score`, `Reserve`, `Permit`, `PreBind`, `Bind`, `PostBind`), representative
plugins (`PrioritySort`, `NodeResourcesFit`, `NodeUnschedulable`, `NodeAffinity`,
`TaintToleration`, `ImageLocality`, `DefaultBinder`), and the RBAC/leader-election
boundary for custom schedulers. Manual assignment/Binding, labels/selectors,
taints/tolerations, node selectors/affinity, Resource Requirements, DaemonSets,
static Pods, multiple schedulers, and profiles were already covered and were
rechecked for completeness. Current corpus: **40 units, 49 KCNA MCQs, 232 cards,
3 mental models**. Settled verification is green: `npm run ci`, **82/82 Vitest**,
D1 checks, production build and release-manifest generation, `revision:check`,
and the full Playwright desktop/tablet/mobile matrix with **97 passed / 38
intentional skips**. Independent production checks return HTTP 200 for `/models/`,
`/models/pod-scheduling/`, `/models/kubernetes-reconciliation/`,
`/models/service-request-path/`, `/learn/kcna-scheduling-review/`, and
`/practice/kcna/`. The live Scheduling page contains `PriorityClass`,
`priorityClassName`, `QueueSort`, preemption, and `DefaultBinder`. **No
implementation or deployment blocker remains.**

**Audit → Plan → Rewrite → Acceptance → Merged → Deployed.**

[PR #10](https://github.com/hmrdkn-labs/devops/pull/10) merged with commits
preserved at `fae8d045cfdb11c14fa6beb7224d7ddb7bcd7c6d` on 2026-09-16.
Latest-head [CI run 35118173684](https://github.com/hmrdkn-labs/devops/actions/runs/35118173684)
passed validation, browser, and public-secret checks for `cd08d4d` before merge.
Post-merge CI also passed for exact deployment source
`797fbfe59a90fa0b80fdf70b3b11c298048451f2`. Protected owner deployment
[run 35119970871](https://github.com/hamardikan/hamardikan-infra/actions/runs/35119970871)
then rebuilt that immutable source, applied D1 migrations, deployed the Worker
and route, restored the existing Google owner secrets, and passed its production
health/manifest/auth checks.
All 29 remaining transfer templates, the Scheduling additions, learner-state
repairs, atomic lesson transitions, and keyboard-accessible reference regions
are accepted and live. **No implementation or deployment blocker.**

Final local gates: **77 unit tests / 88 browser passes / 38 intentional skips**,
content/type/D1/build and both revision baselines. Browser coverage includes all
52 lesson exercises and all 40 units at 320px/1440px. Owner persistence is mocked;
learner efficacy remains unmeasured. Independent live probes after deployment
returned 200 for `/`, `/kcna/`, the Kubernetes Resources lesson, KCNA practice,
review, references, and the auth-session route. `/api/health` reports `ok`, D1
`ready`, and manifest SHA
`435617b2795f2f12c2259ece57d736d25d94f81841cdea240228b20f56604e6a`, matching
the deployed public artifact.
Plan: `docs/LEARNING-EXPERIENCE-PLAN.md`. Stable guest server: port 4321, session
`12099`, manifest `435617b2795f`, no D1/auth binding.

## Historical bounded baseline (superseded by completion above)

**Historical bounded baseline: audit → plan → implementation → tests → local acceptance
complete; protected release pending.** Eight targeted content rewrites
and the learner-workspace reliability/layout repairs are implemented, preserving
the Scheduling additions. Final gates are green: production build, content and
revision checks, Astro diagnostics (0 errors/warnings), **37 unit tests**, D1
checks, and **80 Playwright passes / 31 intentional skips**. No current test or
implementation blocker. Parent manual acceptance confirms study, reference, MCQ,
focus/draft preservation, wrapping mobile matches, and readable/keyboard-scrollable
reference tables. Owner persistence journeys used mocked APIs; no production
real-owner E2E was performed. No commit/deployment for this combined diff. The remaining
29 generic-template units and learner efficacy work are future scope, not blockers.
Plan: `docs/LEARNING-EXPERIENCE-PLAN.md`. Guest server: port 4321, session `90283`,
manifest `8dcb7debe9da`, no D1/auth binding.

## 2026-09-16 learning experience verification log

Completion-phase independent review sampled process waits, permissions,
namespace/cgroup accounting, route selection/NAT hooks, TLS identity, container
recreation/storage, Kubernetes controller/runtime ownership, storage reclamation,
admission and telemetry scope against primary documentation. Authored fixtures
remain predictions rather than claims of live experiments. No migrations, APIs,
bindings, dependencies, or workflows changed. The final guest server was stopped
before rebuilding and restarted from the settled dist to avoid stale-build
navigation evidence. Owner persistence remains mocked; learner efficacy remains
unmeasured.

Parent manual acceptance confirms the new four-frame mobile container storage
model, retained-volume transition, readable worked case, and the repaired
Cloud-Native task 6→7 transition: five new rows, removed prior feedback, focused
visible heading, one main landmark. Overflowing reference code now has named
focusable regions; a 390px keyboard probe confirms ArrowRight scrolling and
visible focus. A dedicated regression covers this behavior.

Initial regressions reproduced aborted review saves sticking busy state and late
notes loads overwriting edits. Intermediate matrices exposed stale expectations
for newly collapsed teaching details and heading focus, plus real mobile matching
and desktop reference-table clipping. Tests now explicitly open teaching details
and retain their content assertions; product fixes preserve retry event identity,
corrections, selected responses, and table containment. Final complete matrix:
**80 passes / 31 skips**, 111 cases, 33.9s, including actual KCNA→MCQ clicks at
desktop/768px/mobile. No stale test failures remain. Prior intermediate runs are
superseded by this settled-build evidence.

## Historical release records

**KCNA Scheduling depth pass v22 was locally complete before the combined app
pass:** its earlier release-readiness assessment is historical; the current
combined diff requires the protected app-release workflow. The
Scheduling checkpoint used indexed KodeKloud KCNA coverage and verified selected
upstream behavior; this was not a full audit of every course lesson.
The previous corpus already taught resource feasibility, nodeSelector,
required/preferred affinity, taints/tolerations, topology spread, DaemonSet
basics, and Pending-event diagnosis, but it did not give enough explicit
coverage to manual/direct assignment, resource-policy scope, Static Pod
ownership, multiple schedulers, or scheduler profiles/plugins. Those are now
covered without mirroring proprietary lesson text or quiz questions.

**2026-09-17 follow-up audit/enrichment:** after rechecking the full Scheduling
module and the live scheduler-profile/multiple-scheduler coverage, the remaining
material gap was deeper scheduler execution rather than basic placement policy.
The companion now explicitly teaches `PriorityClass` / `priorityClassName`,
priority queue ordering and preemption, `QueueSort`, the scheduler framework
extension-point pipeline (`PreFilter`, `Filter`, `PostFilter`, `PreScore`,
`Score`, `Reserve`, `Permit`, `PreBind`, `Bind`, `PostBind`), representative
plugins (`PrioritySort`, `NodeResourcesFit`, `NodeUnschedulable`, `NodeAffinity`,
`TaintToleration`, `ImageLocality`, `DefaultBinder`), and the minimal RBAC plus
leader-election operating boundary for custom schedulers. The pass adds matching
questions, review cards, a framework visual, and KCNA MCQs rather than prose
alone. Resource Requirements was included in the audit and remains covered by
the existing resource-policy and scheduling-feasibility material. Current counts
are **40 units, 49 KCNA MCQs, 232 cards, and 3 mental models**. Settled verification
is green: `npm run ci`, **82/82 Vitest**, D1 checks, production build and
release-manifest generation, `revision:check`, and the full Playwright
desktop/tablet/mobile matrix with **97 passed / 38 intentional skips**.
Mental-model commit `7a23322` and Scheduling commit `3a34836` are both pushed to
`origin/main` and live. CI run `35188612945` passed for exact source
`3a3483655e21b3032eb1377c62c76a36f75db13a`; protected owner deployment run
`35188946033` succeeded. Independent production verification returned HTTP 200
for `/models/`, `/models/pod-scheduling/`, `/models/kubernetes-reconciliation/`,
`/models/service-request-path/`, `/learn/kcna-scheduling-review/`, and
`/practice/kcna/`; `/api/health` reports `ok`, D1 `ready`, manifest SHA
`123f97da1eecfff2ff8eb6312465000e2057533617742dafad7b1d502bb9f0e8`. The live
Scheduling page exposes `PriorityClass`, `priorityClassName`, `QueueSort`,
preemption, and `DefaultBinder`.

A new **KCNA Scheduling quiz companion** adds the full first-principles path
`unassigned Pod → filter → score → bind → kubelet/runtime`, explicit
`spec.nodeName` scheduler-bypass semantics, node-affinity execution semantics,
the three common taint effects, dedicated-node policy, requests versus limits,
LimitRange versus ResourceQuota, DaemonSet versus kubelet-owned Static Pods,
mirror Pods, `schedulerName`, multiple schedulers, and scheduler profiles and
plugins. It ships **8 retrieval/application questions, 15 review cards, 4
reference visuals, 2 guided practices, and 11 upstream/reference links**. The
Cluster Behavior interactive lesson grows from **11 to 18 interactions** with
seven Scheduling-specific exercises, and the KCNA refresher grows from **37 to
47 independently authored MCQs** with per-option rationale.

The KCNA path now contains **32 units** and the full public corpus contains
**40 units, 171 unit questions, 230 review cards, 47 KCNA MCQs, 4 interactive
lessons, and 52 lesson exercises**. Revision classification and the complete
local CI gate are green: content contracts, Astro typecheck, **37 unit tests**,
D1 migration/idempotency/evidence checks, production build, and release-manifest
generation all pass. The full Playwright desktop/tablet/mobile matrix is also
green with **63 passes / 18 intentional skips**. The first browser run correctly
exposed two stale acceptance counts (31→32 KCNA units and 11→18 Cluster Behavior
interactions); those assertions were updated and the full matrix then passed.
This v22 work is **not committed or deployed yet**. No implementation blocker.

**Kubernetes Resources assessment repair v21 is live:** the completed Resources
practice attempt is now treated as both learner evidence and a coverage audit of
the platform. The verified result is **63 questions, 45 correct, 18 incorrect,
71%**. Reviewing the 18 graded misses showed that the score was not simply “18
things already taught but forgotten”: **10 were clear/substantial coverage gaps,
3 were present but insufficiently drilled, 4 were genuine retrieval failures on
material already taught well, and 1 source item used a materially oversimplified
Pod-reachability model**. The private evidence record preserves that distinction
instead of treating every wrong answer as the same failure.

The public remediation adds a dedicated **Kubernetes resource operations and
defaults** unit covering ReplicaSet selector paths and adoption, legacy
ReplicationController selector defaulting, `kubectl get -A`, the `get all`
caveat, scaling, `set image`, rollout history/undo, the four initial namespaces,
classic client-side three-way apply versus Server-Side Apply field ownership,
workload replicas versus physical node capacity, and a corrected Kubernetes Pod
network model. It ships **8 retrieval/application questions, 12 review cards, 3
reference visuals, guided practice, and 9 new independently authored KCNA MCQs**.
The existing Kubernetes Resources interactive lesson remains **12 interactions**;
its selector, rollout, namespace, and command feedback was enriched rather than
adding another transition screen.

The public KCNA path now contains **31 units**; the full public corpus contains
**39 units, 215 review cards, 37 KCNA MCQs, 4 interactive lessons, and 45 lesson
exercises**. Local gates passed content/revision contracts, Astro typecheck,
**37 unit tests**, D1 checks, production build, and the full Playwright matrix
with **63 passes / 18 intentional skips**. Exact public source
`0cd6f1050959bc111301377d299b75e51694ac39` passed CI run `35080949371` and
protected owner deployment run `35081197406`. Independent production
verification confirmed health `ok`, D1 `ready`, manifest SHA
`c5560e24a818f5ead389f09e307d34ac2acb06d24d6dc07ee6d994549fb77f19`, the live
`/learn/kubernetes-resource-operations/` unit, KCNA path placement, the
**37-question** refresher, and the Resources lesson route. The private evidence
and coverage-diff commit is `8ea64149e8d84dcf9751c242bf14e9961f12240c`.
The learner later supplied the assessment's exact 18-item failed-result list;
it matched the screenshot-derived miss set and is recorded in private commit
`1b06ec43886307b17fac1019ef0d295204741a11`. That confirmation also records
three source-answer caveats rather than teaching them verbatim: Pod reachability,
the incomplete initial-namespace framing, and physical capacity versus merely
adding Pods. Unrelated private EKS work remains untouched. **No implementation
or deployment blocker.**

**Kubernetes object lexicon v20 is live:** the user-provided object reference is
now represented as an independently written, portable learning unit rather than
being dumped into the existing Resources quiz companion. The new
`fpp:kubernetes-object-lexicon` unit teaches object choice by responsibility,
scope, API group, and payload shape across workloads, networking, configuration,
storage, RBAC, and namespace policy. It modernizes the reference around
**EndpointSlice** for current Service backend state, keeps Ingress as a stable
but frozen API with Gateway as the newer extensible direction, distinguishes
ResourceQuota from LimitRange, and makes `kubectl api-resources` / `kubectl
explain` the authoritative discovery path instead of memorized YAML. It ships
with **6 retrieval/application questions, 10 review cards, guided practice, two
portable visuals, and 14 upstream Kubernetes references**.

The KCNA path now contains **30 units** and the full public corpus contains
**38 units, 203 review cards, 28 MCQs, 4 interactive lessons, and 45 lesson
exercises**. The existing KCNA Kubernetes Resources lesson remains exactly
**12 interactions**; its object-responsibility matching exercise was enriched
from four to eight objects (Pod, ReplicaSet, Deployment, Service, StatefulSet,
DaemonSet, ResourceQuota, LimitRange) instead of adding another screen. Local
validation passed content/revision contracts, Astro typecheck, **37 unit tests**,
D1 checks, production build, and the full Playwright matrix with **63 passes / 18
intentional skips**. Exact public source
`76864adf12c767c29e042163e1f1d940d48b9801` passed CI run `35077717201` and
protected owner deployment run `35078043286`. Independent production
verification confirmed health `ok`, D1 `ready`, manifest SHA
`4a12fdeac5edddee439f9db7874aeb7e44e6bd0539505915f22fabcaa512225d`, the live
`/learn/kubernetes-object-lexicon/` page, KCNA checkpoint placement, and the
Resources lesson route. The distilled private reference is committed separately
as `624253f0141be80370bec947f459e818fe9f10de`; pre-existing private EKS edits
remain untouched. **No implementation or deployment blocker.**

**Practice evidence → remediation loop v19 is live:** the private
`hamardikan/devops-knowledge-base` now treats owner practice screenshots as a
provenance-backed learning journal rather than loose files. The 2026-09-16 KCNA
Kubernetes Fundamentals attempt was processed as assessed recognition evidence:
**48 questions, 46 correct, 2 incorrect, 96%**. Forty-seven screenshots from
that completed attempt were tagged and reviewed, the aggregate result was
distilled into a private evidence report, and the two missed concepts were
promoted as independently authored remediation rather than copied quiz text.
The misses were `crictl` runtime-endpoint selection and the `nerdctl` versus
`ctr` tool boundary. The private evidence/provenance commit is
`cb4f345bdea193011d8015eda9007194a2a8632b`; raw third-party screenshots remain
Git-ignored and private. A new Kubernetes Resources batch is already being
captured separately and remains `new` until enough context/result evidence
exists to review it honestly.

The public Fundamentals companion advanced to revision 3 and now includes a
runtime-tooling reference section, a dedicated tooling visual, **two new
retrieval questions**, **two new review cards**, and **two original MCQs**. The
material teaches three supported `crictl` runtime endpoint configuration
surfaces (flag, environment variable, config file) and separates `crictl`
(CRI-focused troubleshooting), `ctr` (low-level containerd debugging), and
`nerdctl` (Docker-compatible containerd workflow). Upstream cri-tools and
containerd/nerdctl references were added and verified 2026-09-16. The public
practice bank now contains **28 MCQs** and the full corpus contains **193 review
cards**. Local validation passed content/revision contracts, Astro typecheck,
**37 unit tests**, D1 checks, production build, and **63 Playwright passes / 18
intentional skips**. Exact public source
`e65e6875d1e0deca04dc15ebe6ee6c75d37a9cc2` passed CI run `35069291558` and
protected owner deployment `35069507301`. Independent production verification
confirmed health `ok`, D1 `ready`, manifest SHA
`af8d2ac89c3ed2f9bea7f73eb8930ef38a7a302e3838cdc895bdaac3700729f9`, the live
Runtime Tooling section, and the new `crictl` practice material. **No
implementation or deployment blocker.**

**FSRS next-card advancement fix v18 is live:** the review queue no longer gets
stuck after rating a card that was originally scheduled under an older content
revision. The failure was a stale-revision boundary: `GET /api/review` returned
the revision stored in `fsrs_card`, while `POST /api/review` correctly rejected
that stale revision with `409 content_revision_changed`; the client then hid the
error, so the same card appeared frozen. Review reads now normalize still-valid
scheduled cards against current canonical content before returning them, derive
the current revision/type/unit metadata from the published unit, and count only
reviewable rows. After a successful rating the client immediately removes the
current card from the local queue, resets reveal state, refetches, and shows the
next due card. Revision conflicts and other failures now produce visible status
messages instead of silently stalling.

Regression coverage includes an API test for a stale scheduled row and a
desktop/tablet/mobile Playwright flow that serves card 1, rates it **Good**, and
asserts card 2 replaces it. The full local gate passed with **37 unit tests** and
**63 Playwright tests passed / 18 intentional skips**. Public CI initially
exposed an unrelated focus timing race: the lesson test tried to focus an option
before its Solid island had hydrated. The test now waits for the option to be
enabled and focused; product behavior and focus styling were not weakened.
Exact source `a00d84292232ce39d30804bb4d61024f400fcacb` passed public CI run
`35062915793` and protected owner deployment run `35063067488`. The deployment
verified the immutable checkout, D1 migrations, Worker/route, owner secrets,
public route, and manifest. Independent production health reports `ok`, D1
`ready`, and unchanged manifest SHA
`f155ce6116583331e4aa83fb614d4b67aedd0072cf038182864aa5fa7e822ac8`.
The available production browser session was guest on `/review`, so an
authenticated live rating was not replayed after deploy; the exact next-card
interaction is covered by the green browser regression above. **No implementation
or deployment blocker.**

**Review reveal-state fix v17 is live and production-verified:** the FSRS review
surface no longer looks like a rating has already been chosen. The generic
first rating button styling that gave **Again** a warning-colored border before
any learner action was removed, so Again/Hard/Good/Easy now start visually
neutral. The review card state label is also explicit: it says **Retrieve before
revealing** while the answer is hidden, then changes to **Answer revealed** once
the learner intentionally reveals it. A new Playwright regression mocks one due
card and verifies the answer is hidden initially, ratings are unavailable until
reveal, the state label changes correctly, and all four rating borders are
neutral across desktop/tablet/mobile.

Local validation is green: Astro typecheck, the targeted browser regression on
all three viewport projects, full `npm run ci`, and `git diff --check`. Exact
public source `670989546ad12961a5151c30222b11ad89614e27` passed public CI run
`35057464217` and protected owner deployment run `35057636190`. Independent
production browser verification on `/review?path=kcna` confirmed the answer is
hidden before reveal, **Reveal answer** is visible, the post-reveal label changes
to **Answer revealed**, all four rating buttons share the same neutral border,
and there is no horizontal overflow. Production health remains `ok`, D1 is
`ready`, and the content manifest is unchanged at
`f155ce6116583331e4aa83fb614d4b67aedd0072cf038182864aa5fa7e822ac8`.
**No implementation or deployment blocker.**

**KCNA critical retrieval depth v16 is live and production-verified:** the
three-question floor remains the corpus-wide minimum, but it is no longer the
target for high-value KCNA material. All **18 high-weight KCNA units** now have
**five bespoke retrieval/application questions each**, adding two targeted
prompts per unit around the actual objective boundaries: control-loop failure,
API object validity, component ownership, Pod identity, controller choice,
selector semantics, rollout/rollback, declarative drift, namespace scope,
Service/Ingress behavior, networking-policy enforcement, requests/probes,
scheduler constraints, storage topology/lifecycle, request security,
evidence-first troubleshooting, and release proof. The KCNA path now contains
**123 unit questions**; the complete 37-unit corpus contains **147**. These are
mastery-affecting changes, so only the affected 18 units advanced from revision
2 to **revision 3**, with metadata/questions/cards/visuals kept in lockstep and
the normal evidence-revalidation semantics preserved. Portable raw YAML,
manifest, and downloadable archive were regenerated.

Local gates are green: content contract, revision classification, Astro
typecheck, **36 unit tests**, D1 migration/idempotency/revalidation checks,
production build, `git diff --check`, and a final full Playwright
desktop/tablet/mobile matrix with **57 passed / 18 intentional skips**. An
earlier single tablet MCQ timeout was non-reproducible; the isolated test and
the complete rerun both passed. Exact public source
`3066124f11eebc5b68c78518d1b4607c9ecec046` passed public CI run
`35056666608` and protected owner deployment run `35056857616`. Production
health reports `ok`, D1 `ready`, and manifest SHA
`f155ce6116583331e4aa83fb614d4b67aedd0072cf038182864aa5fa7e822ac8`.
Independent live browser verification on `kubernetes-control-loop` confirmed
`1 of 5 · predict`, the expected title, and no horizontal overflow at 1440px.
**No implementation or deployment blocker.**

**Stable learning workspace + question depth v15 is live and production-verified:** the
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
Exact public source `c0d818922ddf96b7410f3394da8b44cfd56d12af` passed public
CI run `34953992027` and protected owner deployment run `34954222572`.
Production health reports `ok`, D1 `ready`, and content manifest SHA
`fb97821c5d272e44571e0ce716f29908571ad99c7d1f4625066207b4d4616838`.
Independent live browser QA on `kubernetes-manifests` confirmed `1 of 3`, an
unchanged production URL and zero scroll movement when Reference opens, exact
question geometry before/after the contextual reveal, and no horizontal
overflow at 1440px. **No implementation or deployment blocker.**

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
