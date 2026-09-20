# Learning experience audit and improvement plan

2026-09-21 · **Research complete → direction approved → implementation in progress**

The user approved the recommendations and execution order, selected the beaver
direction, and authorized Sol Medium (otherwise Luna Max) as implementation
writer after Extra High compatibility failed. The findings below describe the
audit baseline. See PROJECT_STATUS.md for current implementation and verification
state, and [the beaver exploration](BEAVER-CHARACTER-EXPLORATION.md) for generated
candidates. Proposed gates are not claimed as passed until verified.

## Decision in one minute

The product has useful learning mechanisms, but it still feels like a technical
reference application with several learning tools attached. Its biggest gap
against the published Brilliant and Duolingo learning patterns is not missing
features: it is the work the learner must do to choose a mode, find the relevant
explanation, interpret progress, and recover from a mistake.

**Recommended direction:** a welcoming technical learning notebook, with one
clear next action, a first-class reader, short concept-to-practice sequences,
and trustworthy progress. Use warm paper and cobalt actions in light mode,
slate and soft blue in dark mode, with a restrained original animal character.
Keep the technical depth, typed explanations, history, portable content, and
existing architecture.

Do not start another whole-app rewrite. Finish the reader/progress contract,
prototype one excellent Scheduling sequence, test it against the current
experience, then propagate the standard. This plan refines
[the existing journey plan](LEARNER-JOURNEY-REDESIGN.md); it does not replace the
Learn / Review / Practice / Library navigation or authorize deployment.

## 1. Evidence and limits

Reviewed the live KCNA page, local branch `fix/kcna-study-first-progress`, product
and design documentation, content inventory, study/progress components, MCQ
feedback, visual guides, and mental-model implementation. Browser inspection
covered desktop 1440×900 and mobile 390×844, including the read-first route and
an intentionally incorrect Scheduling answer in the local guest session.

The local reader fixes are **not deployed**. The local desktop reader is about
761px wide; the mobile sheet is about 374px wide in a 390px viewport. These are
real improvements over the supplied screenshot. They do not yet make reading
the primary activity. No owner answers, credentials, or production learning
records were changed. Saved-progress behavior here is a code review, not a new
authenticated end-to-end test.

The competitor comparison uses official public descriptions and design
rationales, not a hands-on audit of authenticated paid products. Duolingo's 2022
path article is historical design rationale, not evidence of every current
screen. This is a heuristic audit, not a participant study or demonstrated
improvement in retention. Existing passing test counts in PROJECT_STATUS.md
belong to the earlier implementation, not this planning exercise.

### Current inventory

| Asset | Count | Interpretation |
| --- | ---: | --- |
| Canonical units | 40 | 32 are on the KCNA path |
| Unit questions | 189 | Free-text/self-check learning prompts across the corpus |
| Review cards | 252 | Separate from unit questions and MCQs |
| Reference visuals | 52 | Mostly authored explanatory sequences, not 52 simulations |
| KCNA MCQs | 63 | 34 concept, 17 scenario, 12 kubectl; not an exam-equivalent coverage claim |
| Interactive lessons | 4 | 52 exercises in total |
| Interactive mental models | 3 | Stronger inspect/predict/change-condition pattern |
| Learner curriculum | 13 modules / 105 steps | 116 source entries retained separately for traceability |

Counts establish scale, not instructional quality. All inventory was scanned;
the content assessment below samples priority units rather than certifying all
technical claims in the corpus.

## 2. What to learn from Brilliant and Duolingo

| Learner task | Our observed experience | Useful benchmark | Proposed adaptation |
| --- | --- | --- | --- |
| Know where to start | A next-step CTA exists, but source metadata and several learning surfaces still need interpretation | Duolingo's guided path reduces lesson-selection work; Brilliant orders foundations before applications | One resume action with the next skill and a credible activity duration; full outline remains browsable |
| Learn something unfamiliar | Read-first opens a context panel while a large recall question remains beside it | Brilliant mixes explanation and hands-on problems inside the lesson | Reader becomes the main surface; introduce one concrete case, let the learner inspect it, then try |
| Know what to do after an error | MCQ correct/incorrect labels and rationales are good; deeper explanations and review navigation can fragment the session | Brilliant describes hints, step explanations, and additional practice after a failed check | Explain the selected misconception immediately, show the relevant concept in place, then offer a different transfer question |
| Understand progress | Unit completion, understanding, checkpoint status, and memory-only state compete | Duolingo integrates practice into a path; Brilliant distinguishes activity from mastery in progress guidance | Show lesson position and next action first; disclose evidence details without implying reading proves mastery |
| Feel a coherent identity | Similar dark-green cards, tiny muted labels, repeated rounded containers, sparse purposeful illustration | Duolingo's craft work emphasizes purposeful hierarchy, typography, spacing, and consistent visual rules | Semantic colors, fewer nested containers, readable type, consistent diagrams, one original character used sparingly |

Sources: [Brilliant learning paths](https://brilliant.org/help/features/what-are-learning-paths/),
[lesson structure](https://brilliant.org/help/schools-and-educators/how-brilliant-fits-into-a-math-lesson/),
[feedback and differentiation](https://brilliant.org/help/schools-and-educators/differentiation-guide/),
[progress interpretation](https://brilliant.org/help/features/parent-progress-dashboards-on-brilliant/),
[Duolingo path rationale, 2022](https://blog.duolingo.com/new-duolingo-home-screen-design/),
and [Duolingo visual-system craft](https://blog.duolingo.com/core-tabs-redesign/).

Borrow guided progression and feedback, not their entire commercial product:
no hearts that punish mistakes, forced streaks, leaderboards, cartoon clutter,
or AI grading. Do not copy either company's character, illustrations, or UI
verbatim. An adult DevOps tool should remain excellent for YAML, commands,
diagrams, and focused reading.

## 3. Findings, in priority order

### P0 — Read-first has an incomplete exit path

In `StudyFlow.tsx`, **Mark lesson read** is inside `finished()`, after all
retrieval questions. The Reference panel has the article but no equivalent
read-completion or continue-to-practice action. Opening it records an encounter,
not lesson completion. `KcnaFocusClient.tsx` chooses the next mode from
`completion.lessonCompleted`, so reading first does not by itself make the
recommended action advance.

Make an explicit **I've read this → Try the concept** action available in the
main reader. Record reading separately from recall success. Never mark a lesson
read simply because someone opened it, scrolled to its end, or watched a visual.
Offer **Already familiar? Try first** without making novice learners invent an
answer to something they have not learned.

### P0 — Curriculum granularity exceeds activity granularity

Several distinct source-aligned lesson rows open the same broad article from
the top. Security repeatedly opens `kubernetes-security-access`; Observability
opens `cloud-native-observability-signals`; Delivery opens
`cloud-native-delivery-gitops`. Row labels suggest different lessons while the
destination and unit-level badges are shared.

Map each meaningful learner step to a specific section/activity and objective
set. Reuse canonical material without duplicating it. Show existing unit
evidence as **Prior practice available**, not as proof that every new step is
complete. Keep old unit/question IDs and history intact; do not reset progress
to fit a new outline. Define migration behavior before changing persistence.

Source video durations are currently rendered in the curriculum beside our
own activities. Label these **Source video** in references, or replace the
learner-facing estimate with a separately authored reading/practice duration.

### P1 — Reading still competes with recall

The wider local reader is helpful, but desktop still presents a question rail,
large question/textarea, and reader concurrently. On mobile, repeated panel
headings, tabs, evidence explanations, and collapsed visual tools consume much
of the initial viewport before the lesson starts.

When reading, make the article the main content. Keep the draft mounted but
visually out of the way. Use the side panel for History, Notes, and brief lookup,
not for the primary lesson. Switching Read / Practice happens inside the same
workspace and preserves draft, scroll position, and focus return. The initial
server-rendered state must match `?mode=reference`; current inspection saw a
disabled recall shell before hydration opened the reader.

### P1 — An expert reasoning framework is used as the first novice task

The initial domain-map unit asks why “a Kubernetes Service forwards traffic” is
incomplete shorthand, then introduces control, execution, workload, and proof
layers. This is useful synthesis after examples, but a demanding first task for
someone who has not learned Services or controllers.

Keep an optional short course orientation. Make the first learning success a
concrete example: distinguish an image from a running container, or identify
what changes when a process stops. Reintroduce the cross-layer framework after
the learner has components to attach it to. Experienced learners can skip
ahead; do not require all users to repeat basics.

### P1 — Coverage is broad, but practice is uneven

Scheduling is no longer missing: its review unit has 10 prompts, 17 cards,
5 visuals, and roughly 2,660 whitespace-delimited words. By contrast, the
current module filter exposes only 3 Security MCQs, 3 Service Mesh MCQs, and
2 Storage MCQs. Those counts do not measure all questions in the units, but
they reveal thin varied refresher coverage for broad modules.

Audit **objective → explanation → example → misconception → independent
check → later review**, not just question counts. Three bespoke unit questions
remain the minimum contract; use 4–6 or more where distinct objectives warrant
it. A ten-question unit may need smaller teaching segments rather than more
questions in one sitting.

### P1 — Feedback is improved, but recovery is inconsistent

The sampled MCQ clearly identifies the selected incorrect answer, the correct
answer, and a reason. Preserve this. Automatically expose why the chosen wrong
option fails; make other distractors optional. Related reading should open in
the workspace, not navigate away from a memory-only session. A second attempt
after seeing the answer is assisted practice, not independent mastery.

For ordering tasks, explain the first violated dependency and show the correct
relationship, not only a final sequence. For typed explanations, keep rubric
self-check and saved before/after wording; never label ungraded prose “correct.”
For diagrams, highlight the actor and observable consequence of the choice.

### P2 — Visual hierarchy and motion lack differentiated roles

Green currently means brand, action, selection, progress, and success. Many
containers have similar borders, radius, and background. Metadata can be very
small: the local workspace status is approximately 9.92px. The result is quiet
but not easy to scan; adding gradients or more animation would not solve it.

Use space and type before adding another card. Make one primary action obvious.
Reserve motion for explaining change or preserving context. This audit did not
record frame timings, so reported “teleporting” remains a performance/interaction
measurement task, not a proven framework bottleneck.

## 4. Target experience: one workspace, a clear learning loop

**Resume → Understand → Try → Explain → Review later**

| Surface | Primary content and action | Secondary access |
| --- | --- | --- |
| Learn / KCNA | “Continue: choose where a Pod can run · about 6 minutes” | Module outline; compact saved-progress details |
| Read | One objective, concrete example, readable article and inline model → **Try it** | Recall-first option; sources and optional depth |
| Practice | One task → **Check** → specific feedback → **Continue** | Hint, relevant lesson excerpt, History, Notes |
| Explain | Own words → model answer and checklist → honest self-rating | Previous wording on demand; correction note |
| Review | Due item → reveal → Again / Hard / Good / Easy | Short rating guidance, queue/error/save status |
| Library | Fast lookup and complete reference documents | Search, maps, source catalog, Markdown exports |

Desktop: a readable central column around 65–75 characters, wider only for
diagrams/code; optional outline and contextual panel without squeezing three
equally prominent tasks together. Mobile: one content column, readable main
lesson rather than a nested primary-reading drawer, and a stable action area
that never covers content or the software keyboard. History/Notes may use a
sheet with predictable close/focus restoration.

Use body text around 16–18px, secondary labels around 14px, generous line
spacing, sentence-case controls, and mono only for code/compact technical data.
Readable tables need sensible mobile alternatives, not only “swipe sideways.”
Keep technical disclosure copy, but move repeated “evidence” explanations into
one understandable progress help surface.

Show **Read**, **Practiced**, and **Review due** as separate signals; detailed
Encountered/Recalled/Applied/Retained evidence remains available. Do not claim
that a session percentage predicts exam success. Loading, unavailable, guest,
and no saved evidence must be visually distinct; show last successful save and
retry locally without erasing the learner's answer.

## 5. Content quality and interactive teaching

### Priority coverage work

| Area | Keep | Improve |
| --- | --- | --- |
| Fundamentals | Strong component/ownership explanations | Short concrete first lesson; image/process/container/Pod comparisons before broad synthesis |
| Resources | Expanded operational material and command scenarios | Explicit selector/template labels, quota vs limits, scale vs rollout, namespaces, client-side vs server-side apply; varied transfer checks |
| Scheduling | Existing deep reference and broad practice | Break into placement, filtering/preferences, resource fit, special scheduling; attach each course step to the right section |
| Security / Storage / Mesh | Broad independently authored references | Smaller worked examples and objective-level practice coverage, not one broad article reopened repeatedly |
| Observability / Delivery | Cross-layer reasoning and proof examples | Teach one incident/release through successive decisions before introducing all terminology |

Each short sequence should include a practical goal, minimal prerequisite,
one worked example, an inspectable model where useful, a misconception-specific
check, and a different application case. Explanation-first and retrieval-first
are legitimate routes, not “easy” and “real” learning. Keep the complete
Markdown reference available independently of the interactive sequence.

### First prototype: why is this Pod Pending?

1. Show three nodes with labels, available requested capacity, and one taint.
2. Show a Pod request and ask which nodes are eligible, before revealing why.
3. Let the learner change one constraint; show eligibility before ranking.
4. Explain hard constraints versus preferences, and why a toleration permits
   placement but does not attract the Pod to that node.
5. Trace scheduler decision → API binding → node kubelet/runtime execution.
6. Show a representative event/status and say what it proves and cannot prove.
7. Give a new Pod/node situation, then ask for a short own-words explanation.
8. Add a later retrieval item; do not treat replaying the visual as recall.

Use an explicitly simplified teaching model, not a claim to reproduce every
scheduler plugin or scoring rule. Label authored command output as illustrative.
Check semantics against [Kubernetes node assignment documentation](https://kubernetes.io/docs/concepts/scheduling-eviction/assign-pod-node/).

Apply the same standard to request-path diagrams: an EndpointSlice is data used
to configure/discover endpoints, not a packet-forwarding hop. Visually separate
control watches/rules from the packet path. The official
[virtual IP reference](https://kubernetes.io/docs/reference/networking/virtual-ips/)
is the relevant source. Review simplified arrow sequences for this ambiguity.

Existing reference visuals reveal explanatory text step-by-step. Keep those
when sequence is the point; do not relabel them simulations. Use the stronger
mental-model pattern for topics where manipulating a condition exposes cause
and effect. Dragging must retain button/keyboard alternatives and clear labels;
even Brilliant documents discoverability problems in its interactives.
[Brilliant interactive guidance](https://brilliant.org/help/features/how-do-i-use-interactives-on-brilliant/)

For authoring, record coverage and misconceptions in portable sidecars. Public
material stays original; personal screenshots inform gaps, not public copied
quizzes. Preserve immutable IDs, revision classifications, historical events,
and accurate version/source verification. New lessons must not silently grant
or invalidate mastery across unrelated objectives.

## 6. Visual identity and accessible color direction

### Recommended: paper, cobalt, slate

Warm backgrounds make the reference feel less like an admin console. Blue owns
action/selection; green is reserved for correctness. Dark mode gets a slate
foundation instead of tinting every surface green. This is a design proposal,
not a claim that one hue is universally easier to learn with.

| Semantic role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F7F5F0` | `#151C24` |
| Main surface | `#FFFFFF` | `#1D2732` |
| Primary text | `#202B33` | `#F1F3F5` |
| Secondary text | `#52616B` | `#B2BEC9` |
| Primary action | `#2358C4` | `#A9C2FF` |
| Text on action | `#FFFFFF` | `#142238` |
| Correct | `#23745A` | `#82CEAF` |
| Caution / assisted | `#8A5400` | `#E5B96B` |
| Incorrect | `#B34436` | `#FFB3A7` |
| Required control boundary | `#788690` | `#778793` |

Use soft blue `#EAF0FC` for selected light surfaces and a restrained apricot
decorative accent where appropriate. These are not additional competing primary
actions. Honor the user's theme preference. Define hovered, pressed, focused,
disabled, selected, saving, and failed states before applying the palette.

Calculated opaque sRGB contrast ratios for the proposed pairs:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Primary text / canvas | 13.25:1 | 15.43:1 |
| Secondary text / main surface | 6.40:1 | 8.00:1 |
| Action text / action fill | 6.43:1 | 9.01:1 |
| Correct text / main surface | 5.65:1 | 8.21:1 |
| Caution text / main surface | 6.27:1 | 8.27:1 |
| Incorrect text / main surface | 5.53:1 | 8.83:1 |
| Control boundary / main surface | 3.74:1 | 4.08:1 |

These calculations are **not a site-wide accessibility certification**. Test
actual combinations, opacity, overlays, focus rings, and selected backgrounds.
WCAG AA ordinary text requires 4.5:1, large text 3:1; relevant non-text component
boundaries need 3:1. Decorative dividers are a different case.
[Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

Do not depend on red versus green: show “Your answer,” “Correct,” “Needs work,”
icons, and position/shape differences. Diagrams need named components, labeled
connections, and distinct solid/dashed control/data paths. Check protanopia,
deuteranopia, tritanopia, and grayscale views; those simulations supplement,
not replace, accessibility and user testing.
[Use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html),
[Carbon status indicators](https://carbondesignsystem.com/patterns/status-indicator-pattern/)

Use semantic tokens rather than scattered hex values. Radix's role-based scales
are a useful organization reference; adopting the package is unnecessary, and
its APCA guidance does not replace the WCAG checks above.
[Radix scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)

Alternatives considered: warm evergreen preserves continuity but still makes
brand versus correct harder to separate; ink/ochre is distinctive and editorial
but needs careful dark text on bright actions. Paper/cobalt is the recommended
prototype, not an already approved replacement.

### Character proposal using the requested skill

The app already has an `<H>` monogram. The opportunity is a more memorable,
friendly character, not filling an absent logo slot. Applied the context and
proposal stages of the linked
[ip-as-logo skill](https://github.com/s1dashu/ip-as-logo-skill/blob/main/SKILL.md).

- **A — Beaver:** builds and repairs systems — rounded body with one broad paddle tail. Recommended product metaphor.
- **B — Otter:** curious experimentation — compact round head with one broad muzzle region.
- **C — Tortoise:** durable, steady understanding — one broad rounded shell silhouette, without small shell markings.

Propose **six independent square candidates**, two per direction: A1/B1/C1
emerging lower-left and A2/B2/C2 lower-right. Each uses 4–7 large shapes, exactly
two character color families and one solid gently muted chromatic background,
and aims to remain recognizable at 32×32. No owl, Docker-like whale, or Tux-like
penguin. Retain the wordmark and keep character use to welcome, helpful hints,
and completion—not every card or error message.

The skill calls for agreement on this six-image proposal before generation.
No mascot images were generated or installed in this planning pass. At that
stage, verify a supported top-tier image model, generate each candidate once,
preserve every result, and report prompt/colors/dimensions/paths. Do not silently
filter, reroll, or substitute an SVG mascot.

## 7. Interaction and motion standard

- A click changes local pressed/selected state immediately. Saving has a distinct
  pending/saved/failed indication; optimistic presentation is not a false save.
- Use short, interruptible transitions only when they explain a change, roughly
  150–180ms as a starting point to test. Avoid repeated page/card entrance motion,
  global height animation, large crossfades, and involuntary scroll-to-top.
- Keep the question and action position predictable without forcing a giant
  empty fixed-height card. After feedback, move focus once to the feedback heading
  without unexpectedly opening the mobile keyboard.
- Reveal relevant feedback close to the choice. Keep the next action reachable
  and prevent header/footer/action bars from covering text or focus.
- Preserve drafts and cursor positions through context tools, local stage changes,
  failed requests, and retry. Reduced motion removes movement, not information.

Frequent interaction should not pay an animation tax. This follows the
purposeful-motion distinction in
[You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations).
Measure frame/interaction behavior during implementation; do not blame Astro or
Solid for every client-state, hydration, layout, or network problem.

## 8. Delivery sequence and review gates

All waves below are proposed implementation work, not performed by this audit.
Keep commits focused and independently reviewable. The parent remains planner
and reviewer; use the user's requested writer model when delegation is working.
Requested Extra High review workers could not start in this session because of
model compatibility; no substitute model or implementation was silently used.

| Wave | Work and proposed commit boundary | Exit condition |
| --- | --- | --- |
| 1 — Complete the learning contract | First-class read surface, explicit read completion, in-place practice/history, initial-mode rendering | New learner can read and start practice without answering first; old answers and recall evidence preserved |
| 2 — Make curriculum truthful | Section/activity targets, honest step vs unit badges, own duration estimates, migration tests | Distinct lesson rows land on relevant material; existing unit evidence remains visible without falsely completing new steps |
| 3 — Prove one learning sequence | Scheduling prototype, original worked examples, misconception feedback, independent transfer checks | Owner can explain placement versus execution and complete a changed scenario without UI coaching |
| 4 — Apply the visual system | Semantic palette/type/layout states; approved character assets in a separate commit | Both themes, keyboard, reduced motion, and mobile checks pass on real task screens |
| 5 — Propagate with coverage review | Fundamentals/Resources pilots, then weaker refresher modules and remaining lessons | Objective coverage matrix and technical review completed; canonical portability intact |
| 6 — Release deliberately | Final usability/browser regression, status, meaningful commits, PR/CI and protected release | Exact release source verified; rollback retained; no production secrets in public CI |

Dependencies: wave 2 mapping decisions inform wave 3; palette prototypes may run
alongside waves 1–3, but do not spread them to every route before the main
workflow is accepted. Each later module reuses the proven pattern without
forcing every topic to have a simulation. No framework migration, auth rewrite,
new grading service, or production data reset is needed.

## 9. Acceptance: test tasks, not screenshots alone

Record the current baseline first. Use three journeys: first-time fundamentals,
returning Scheduling learner, and Resources mistake recovery. A small formative
round of five representative learners is a practical start, not statistical
proof of superiority over Brilliant or Duolingo.

Proposed usability gates:

1. At least four of five find the relevant lesson and identify the next action
   without coaching; aim for under 10 seconds from the KCNA page.
2. Read → practice takes one clear action. History opens in one action and
   returns to the same draft and position. Nobody must guess whether reading
   counted as recall or whether an answer was saved.
3. A wrong answer exposes why it is wrong and a helpful next action without
   leaving the session. Distinct transfer questions distinguish understanding
   from copying the revealed answer.
4. Compare task completion, navigation detours, observed hesitation, and a
   1–7 task-ease response; target median ease at least 6. Record failures, not
   just completion clicks.
5. Follow up with a changed scenario and later-date retrieval. Report observed
   results, not inferred learning efficacy from animations or time on page.

Engineering/accessibility gates for implementation:

- 320, 390, 768, 1024, and 1440px layouts; 200% zoom; keyboard-only navigation;
  screen-reader names/state; mobile keyboard; reduced motion; both themes.
- No page-level horizontal overflow; intentional code/table overflow remains
  accessible. Controls target at least 44px where practical, with no obstructed
  focus or conflicting sticky bars.
- Deep link renders the intended mode without recall-to-reader layout flashing.
  Check disabled/hydrating, slow network, unauthorized, empty, and failed-save
  states. Retry is idempotent and never clears work or advances falsely.
- Character/diagram meaning survives small size and grayscale. Actual color
  combinations meet contrast requirements; status is never color-only.
- Existing IDs/history export reconstructs; reading does not award recall;
  assisted retry does not become independent success; retired evidence remains.
- Codify successful real-browser tasks into Playwright, then run full content,
  revision, auth/privacy, D1, and browser gates once the implementation settles.

**Next recommended artifact:** one responsive Scheduling prototype with the
new Read → Try → Explain loop and palette, plus the reader/progress contract
repair. Validate that before expanding the rest of the interface.
