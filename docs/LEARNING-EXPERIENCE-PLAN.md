# Learning experience acceptance plan

2026-09-16 · Audit → Plan → Rewrite → Acceptance → Merged → Deployed.

[PR #10](https://github.com/hmrdkn-labs/devops/pull/10) merged with commits
preserved at `fae8d045cfdb11c14fa6beb7224d7ddb7bcd7c6d`. All final-head CI jobs
passed in [run 35118173684](https://github.com/hmrdkn-labs/devops/actions/runs/35118173684).
Post-merge CI also passed for exact deployment source
`797fbfe59a90fa0b80fdf70b3b11c298048451f2`. Protected owner deployment
[run 35119970871](https://github.com/hamardikan/hamardikan-infra/actions/runs/35119970871)
successfully applied D1 migrations, deployed the Worker and route, restored the
existing Google owner secrets, and verified production health, manifest, and
auth. No implementation or deployment blocker.

## Authorized completion phase

The accepted baseline is preserved in `71dcecd` (content/generated), `be7e907`
(workspace/tests), and `9717375` (acceptance documentation) on
`feat/learning-curriculum-rewrite`. Complete the other 29 generic-template units
with independently authored explanations, concrete worked cases, observable
proof, useful portable visuals, and verified primary sources. Keep unit and
evidence IDs stable; classify mastery changes and regenerate their artifacts.

Review the two content cohorts independently before committing each cohort.
Reject the retired generated transfer-question boilerplate. Exercise every task
in all four interactive lessons; retain focused responsive, focus, reduced-motion,
network recovery, and privacy contracts. Run the settled check/build/revision
gate against both `origin/main` and the accepted baseline, then the full browser
matrix. Passing these checks establishes contract integrity and observed usable
interactions; learner efficacy remains unmeasured.

Push the feature branch after gates, open a descriptive PR, complete parent
review and GitHub checks, then merge with commits preserved when allowed. Do not
force, bypass repository rules, or deploy production. The existing private
protected application-release workflow is a subsequent release step.

## Current phase

Improve the existing portable curriculum and Astro/Solid workspace without an architecture migration. Preserve the uncommitted Scheduling depth pass. KodeKloud coverage was indexed; selected upstream behavior was verified. This is not a full proprietary lesson audit.

1. Audit learner journeys and prioritize broken or misleading interactions.
2. Implement mobile matching, verdict-first feedback, task focus/scroll, and context preserving retrieval state.
3. Repair notes races and review retry handling without losing text or advancing twice.
4. Run focused regressions during implementation, then the full local gate and manual browser acceptance after product changes settle.

## Done criteria

- All 18 Cluster Behavior tasks support answering, checking, advancement, and completion. Mobile matching labels and selected answers remain visible and usable.
- Context preserves question, draft, URL, question geometry, and scroll. Reference maps do not bury prose in a narrow sidebar; visual counters remain on one line.
- Late notes loads cannot discard edits. Save/reopen works; failed saves and corrections leave recoverable text.
- Review errors retain the current card; retry succeeds; pending saves cannot advance twice. Revision conflicts refresh with an explicit message.
- Next/Retry leave the task heading visible and useful keyboard focus. Feedback presents verdict before details. Context names and keyboard behavior match final panel semantics.
- Inspect 320/390/768/1024/1440px, light/dark, and reduced motion. Standard automated projects remain 390×844, 1024×768, and 1440×900; focused tests add narrower widths.

## Verification

Focused Playwright journeys first. Final gate: `npm run check`, `npm run build`, `npm run revision:check`, full Playwright matrix, and manual inspection of changed initial/matching/feedback/reference/notes/error/completion states. Build precedes revision checking because revision checking reads the regenerated manifest. Screenshots are inspection evidence, not golden assertions. Guest server uses unbound `wrangler.e2e.jsonc`; owner journeys mock APIs. Rebuild the shared server after product edits to avoid stale dist. Record actual results and limitations in PROJECT_STATUS.md.

## Findings and priorities

| Priority | Evidence | Learner pain | Repair and acceptance |
| --- | --- | --- | --- |
| P1 | Source audit: notes GET writes directly into editable state | Late loading replaces newly written notes | Loading/edit sequence protection; delayed-load regression |
| P1 | Source audit: review POST can reject before busy resets | Card becomes stuck after network loss | Catch/finally, visible retry, stable event payload/key after uncertain saves |
| P1 | Mobile browser review of matching | Long responsibility choices are clipped | Responsive readable selected-response text; check 320/390px |
| P1 | Browser/source audit of context | Tools can obscure retrieval or lose draft/position | Preserve question/draft/URL/geometry/scroll; keyboard close semantics |
| P2 | Production read-only reference sidebar review | Entire eight-component map precedes prose in narrow context | Compact/optional map presentation; manual sidebar acceptance |
| P2 | Production reference counter | `1 / 7` wraps across three lines | Counter does not wrap at context width |
| P2 | Existing test inventory | Green counts hide unvisited Scheduling tasks | Traverse all 18 Cluster Behavior tasks and inspect dense mobile states |
| P2 | Browser feedback/task review | Verdict and next task are difficult to find | Verdict before details; Next/Retry heading visible and focus useful |
| P2 | Public KCNA prose | Stale unit counts misrepresent available material | Derive route counts from canonical path data |

## Workstreams and handoff

| Workstream | Owner/model | Status | Acceptance |
| --- | --- | --- | --- |
| Product interactions and layout | experience_audit · Sol Medium | Locally accepted | State-preserving context, readable mobile controls, resilient network journeys |
| Content rewrite and source caveats | content_audit · Sol Medium | Implemented | Eight targeted replacements; preserve Scheduling corpus and independently authored source claims |
| Plan/status and regression tests | qa_plan · Sol Medium | Automated acceptance complete | Focused failures first, complete task traversal, truthful final evidence |
| Review and browser acceptance | Parent · Astra | Bounded local acceptance complete | Inspect all changed states and reject remaining usability regressions |

Product agents own product/content files; QA owns tests and plan/status documentation. Coordinate changed names and selectors before final tests. Preserve unrelated dirty work and prior Scheduling additions.

## Surface scope

- Study: retrieval heading and draft stay primary; immediate reveal remains usable while saving; corrections survive save failures and delayed completion.
- Lesson: all task kinds work through completion; matching and ordering remain usable at narrow widths; feedback first states correctness, then causal detail; Next/Retry reset focus and scroll usefully.
- MCQ: options explain rationale after checking; correction does not inflate initial score; keyboard retry/advance/restart works; motion is optional.
- Review: neutral unrevealed ratings; successful rating advances once; failed/uncertain rating retains the card and event identity; failed queue refresh does not masquerade as an empty queue.
- Reference/context: lookup does not create recall evidence; long technical literals fit; maps/counters adapt to panel width; history remains explicitly closed during fresh recall.
- Navigation/KCNA browsing: discoverable checkpoint/session/quiz routes, current canonical counts, accessible touch targets, clear active location, no horizontal overflow.

## Content and design rules

The bounded content pass replaces generic material in Kubernetes architecture
components, control loop, Deployments/rollouts, labels/ReplicaSets, manifests,
networking request path, scheduling/placement, and Services/DNS/Ingress. These
eight existing units advance to revision 4; the new Scheduling companion remains
revision 1. The other 29 generic-template units remain backlog rather than being
represented as redesigned. This is a bounded reliability/content pass with no
architecture migration. The parent reviewer confirmed bounded local browser
acceptance after the final matching/table repairs.

Rewrite the eight audit-selected generic sections as explanations built around a concrete trigger, mechanism, boundary, and observable evidence. The content agent's replacement list is the implementation checklist; retain IDs and evidence contracts. Preserve Scheduling's 8 questions, 15 review cards, 4 visuals, 2 practices, 18 Cluster Behavior interactions and 47-MCQ corpus unless an explicit content correction requires a documented count change. Keep caveats for direct node assignment, affinity execution semantics, taint effects, requests/limits and policy scope, Static/mirror Pod ownership, custom schedulers, profiles/plugins, and storage topology. Indexed course titles indicate provenance; selected upstream verification supports behavioral claims, not exhaustive course parity.

Use the established compact developer workspace: display type at most 40px, restrained spacing, readable prose measure, visible focus indicators, 44px mobile control targets, and native controls with readable response text. Context should open in place without moving the retrieval column. Keep short counters unbroken and allow long code literals to wrap or scroll within their own surface. Respect reduced motion in task transitions and playback; never require animation to understand an answer. Test light and dark colors rather than assuming shared tokens guarantee contrast.

## Recorded acceptance evidence

Completion-phase settled gates pass content/type/D1/build and revision checks
against `origin/main` and accepted baseline `9717375`. Unit tests: 77 passes,
comprising 37 existing behavior tests and 40 per-unit retired-boilerplate
regressions. Final browser matrix: 88 passes / 38 intentional skips, 126 cases,
41.6s. All 52 exercises reach checking/completion; the new traversal caught an
adjacent ordered-task transition failure repaired by atomic task-state updates.
Rendered landmark checks cover KCNA, MCQ and lesson routes in all viewports.
All 40 generated units pass 320px/1440px retrieval/reference smoke, including
expanded reference models and contained tables. Independent canonical review,
peer corrections, regeneration and final-source gates are complete. Parent
browser review confirms new mobile model playback and the repaired
Cloud-Native trace→arrange transition. Overflowing reference code has named
keyboard-focusable regions and verified ArrowRight scrolling with visible focus.
The bounded
baseline evidence below remains historical and does not measure learner efficacy.

Final settled build: content checks, production build, Astro typecheck (0
errors/warnings), 37 unit tests, D1 checks, and revision classification pass.
Final full Playwright matrix: **80 passed / 31 intentional skips**, 111 cases,
33.9s. Intentional skips limit full traversal/network contracts to their relevant
projects and mobile-only checks to mobile; they do not suppress failing cases.
The run includes actual KCNA→MCQ clicks at desktop, 768px, and mobile. A transient
404 observed during iterative rebuilding did not reproduce against the settled
server; stable click navigation passed. Its exact cause was not established.
No stale test failures remain. Server session `90283` serves the
settled guest build with manifest prefix `8dcb7debe9da`.

Parent browser review confirms: 390px dark reference opens with prose and
collapsed models, visual Next counter works, Escape returns opener focus, and
Study Next presents the focused new heading at 84px with an empty draft. At
320px light there is no document overflow; at 1440px light opening Reference
preserves the answer draft. At 768px MCQ wrong feedback shows selected/expected
answers, correction preserves initial-score honesty, and Retry/Next focus the
visible heading. Final manual review confirms selected matching responses wrap
below native selects at 390px. The desktop architecture two-column table fits
its 289px context (previously 362px and clipped). At 320px, Scheduling's wider
three-column table uses a 255px labelled/focusable wrapper around the 560px table:
ArrowRight scrolls it, the affordance is visible, and the document does not
overflow. Mobile dark, desktop/tablet light, wrong ordering/MCQ feedback, Retry,
and Next were inspected. Owner persistence tests use mocked APIs; no production
real-owner E2E was performed. These are bounded usability observations, not a
claim of learner efficacy or completion of the 29 remaining generic templates.

## Release follow-up

This phase finishes with a local reviewed diff and acceptance evidence. If release follows, use the existing protected Worker workflow, build/classify the exact source, verify health/manifest and changed guest routes, and record the immutable commit/deployment run. Rollback uses the established previous Worker deployment; any migration would require separate review, but no schema migration is planned here. Preserve public/private provenance separation and do not publish third-party lesson material or owner data.

## Future backlog

The remaining 29 units and purposeful portable visual models are now authorized
in the completion phase above. Real learner efficacy measurement remains future
work. Passing UI tests establishes usable interactions and preserved state, not
learning effectiveness.
