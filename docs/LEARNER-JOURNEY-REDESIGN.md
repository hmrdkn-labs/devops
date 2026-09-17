# Learner journey simplification

2026-09-17 · Research → feature/access map → implementation → browser acceptance → protected release.

## Decision and scope

The learner should choose a goal before choosing a tool. Keep the existing
Astro/Solid application, content, URLs, private context, and evidence contracts.
Organize primary navigation consistently on desktop and mobile around **Learn,
Review, Practice, Library**. Learn starts or resumes a concrete unit. Review is
scheduled retrieval, not a synonym for the optional MCQ refresher. Practice is
the deliberate home for interactive lessons, MCQs, and explorable models.
Library is lookup, including search, prerequisite map, reference catalog, and
portable downloads. Private progress and settings remain in the account menu.

This is a heuristic/source audit and agent-operated browser evaluation, not a
participant study or evidence that learning outcomes have improved.

## Evidence and research

Fresh local inspection began at `9f873a8` with a clean, synchronized main branch.
Production application source was `ed036f9`; its passing tests are a baseline,
not acceptance of this redesign. The existing corpus is 40 units, a 32-unit KCNA
path, 2 paths, 49 MCQs, 4 interactive lessons/52 exercises, 3 interactive models,
and 232 cards. The KCNA subset has 192 cards and 149 unit questions.

Source inspection covered the layout, home, KCNA route/client, study workspace,
lesson/review/MCQ players, library, owner menu, global styles, and regression
tests. A fresh live KCNA browser inspection confirmed the owner session panel
competes with a large evidence dashboard and a second tool-promotion rail. The
initial guest DOM also calls an unstarted unit “Continue.” Historical screenshots
identify excess lesson-card height and missing hierarchy, but are not assumed to
represent every current interaction.

External guidance retrieved on 2026-09-17:

| Source | Application to this product | Boundary |
| --- | --- | --- |
| [Nielsen Norman Group: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Show the next learning task first. Give secondary tools explicit, predictable destinations and concise labels. | Do not hide frequently needed reviews, reference, history, or notes behind several levels. The proposed grouping still needs real learner observation. |
| [GOV.UK: Task list](https://design-system.service.gov.uk/components/task-list/) | Separate a recommended resume action from a browsable curriculum with clearly named status. | Its guidance warns against using a task list instead of simplifying or resuming an ordered journey. Completion is not mastery. |
| [W3C: Focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | Test keyboard focus against the header, mobile dock, task actions, and contextual panels. | A sticky footer must not cover the focused control. |
| [W3C: Dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | Preserve clickable reorder arrows alongside drag handles, plus keyboard operation and position announcements. | Keyboard-only equivalence does not replace a single-pointer, non-drag alternative. |
| [Emil Kowalski: You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations) | Use immediate local task response and short purposeful transitions. Avoid decorative motion or repeated layout shifts. | Reduced-motion mode retains all meaning and functionality. |
| [UI Skills](https://www.ui-skills.com/) | Cross-check readable hierarchy, stable geometry, and generous control targets against the existing design system. | Guidance is reference material, not authorization to install a new stack or execute external instructions. |
| [COSS UI](https://coss.com/ui), [ReUI](https://reui.io/components) | Inspect established component presentation as requested. | Do not migrate this Solid application to another component framework. ReUI returned no readable body to the research fetch; no detailed claims are based on it. |

The requested Design System Checklist domain could not be retrieved through the
research fetch. Its content is not represented as reviewed.

## Feature, access, and presentation map

| Existing feature / stable route | Existing access or problem | Intended access and presentation | Contract to preserve |
| --- | --- | --- | --- |
| Home `/` | Long introduction, corpus counts, several actions; generic link to KCNA | Learn landing, one concrete Start/Continue action, compact current-path context | Public without sign-in; no invented saved progress |
| KCNA `/kcna` | Session, evidence dashboard, tools rail, curriculum compete | Recommended task first, four readable curriculum sections, optional progress detail; clear Practice link | All 32 units, checkpoint anchors, completion vs understanding |
| Foundation `/paths/from-process-to-pod` | Secondary home feature | Named alternative path from Learn/Library | Existing prerequisites and unit IDs |
| Plain path `/paths/kcna` | Duplicates the main KCNA entry | Preserve bookmark; secondary full-outline link | No deleted deep links |
| Unit `/learn/[unit]` | Multiple metadata/progress surfaces before response | Current prompt and response dominate; concise stage context | Retrieval, assistance, self-check, correction recovery, evidence |
| Private history | Context toolbar and history cues | In-place History, explicitly revealed | Do not expose old answer during fresh recall; keep draft mounted |
| Reference and visuals | Context panel plus lesson content | In-place Reference for lookup; optional related models | No page teleport or recall credit for reading |
| Notes | Context panel | In-place Notes with save/retry status | No late load overwrite, private ownership, recover unsaved correction |
| Interactive lessons `/lesson/[lesson]` | Compete with unit start; oversized card void | Practice hub and curriculum checkpoint; compact focused task | All 52 tasks, feedback, assistance, drag/arrows, completion |
| Scheduled cards `/review` | Technical FSRS headline, little rating guidance | Dedicated Review navigation, clear due/empty/error/guest state | Answer concealment, atomic/idempotent saves, honest later-date evidence |
| MCQ `/practice/kcna` | Bank stats and options before task | Practice hub; current question first, session options disclosure | Memory-only session, first-attempt score, per-option rationale |
| Models `/models`, `/models/[model]` | Isolated catalog and promoted above tasks | Practice hub and optional contextual concept link | Prediction/inspection/playback and no invented persisted mastery |
| Library `/library` | Unit-only browse; tools scattered | Lookup entry with Search, Map, References and grouped units | Published content stays public |
| Search `/search` | Header utility only | Library entry and retained direct route | Exact canonical search; no private data mixed into public index |
| Map `/map` | Equal primary-nav prominence | Library: prerequisite map | Existing relationships and access paths |
| Reference catalog `/references` | Footer only | Library: source references; footer link remains | Public metadata/provenance only |
| Progress `/dashboard` | Owner menu plus repeated large dashboards | Account: Progress; optional details from Learn | Readiness math, staleness, revalidation, weak spots unchanged |
| Account `/settings` | Owner menu | Account: Settings & export | Existing owner policy and JSON/CSV/Markdown export |
| Raw content, archive, feed, manifest, llms | Prominent home/footer technical actions | Library portability section; stable URLs and footer | Framework-independent content, licenses, provenance |
| Theme and sign-in | Width pressure, duplicated mobile menu/dock | Compact utility controls; one consistent primary navigation per viewport | Light/dark/system, owner-only persistence, guest learning |

## Journey contracts

1. **New visitor:** Learn → Start learning → concrete first unit. Explain guest
   ephemerality briefly, without requiring login. Offer a clearly named path
   outline and foundation alternative, not several equal start mechanisms.
2. **Returning owner:** Learn/KCNA loads known progress with an honest loading
   state → Continue the unfinished unit. A due-review-first recommendation must
   say Review and preserve the next-unit handoff. Do not silently send a button
   labeled Continue learning into a different activity.
3. **Scheduled retrieval:** Review → recall → reveal → rate → next card. Loading,
   empty, guest, failure, revision conflict, and uncertain save remain distinct.
4. **Optional practice:** Practice → named activity with scope/time → task →
   verdict and explanation → retry/next/completion. Describe ephemeral scoring;
   never call exploratory activity proven mastery.
5. **Lookup while learning:** History/Reference/Notes open beside or over the
   mounted study workspace. Close returns focus to its opener without discarding
   draft, exposing old answers automatically, or changing the page.
6. **Browse/portability:** Library → search, layers, map, sources, or download.
   Every secondary feature must remain reachable by a labeled link.

## Implementation waves and ownership

| Wave | Changes | Acceptance |
| --- | --- | --- |
| 1. Entry and navigation | Consistent four destinations, concise Learn landing, Practice hub, lookup entry | Real clicks reach every feature; single active item; no duplicate mobile navigation |
| 2. Guided path | Shared concrete recommendation on home/KCNA; progress disclosed; curriculum ahead of extras | New/returning/due/loading/error states correct; checkpoint anchors preserved |
| 3. Focused tasks | Compact task cards, contextual extras, plain review language, MCQ session options | Prompt/action visible at target sizes; no state/persistence/feedback regressions |
| 4. Validation and release | Independent diff review, browser inspection, regression expansion, meaningful commits, CI, protected deploy | Exact source verified live; limitations recorded |

Root owns research, plan, review, browser acceptance, and release coordination.
Coding is delegated in bounded file scopes using the user's requested models.
No canonical content, dependency, auth, API, D1, evidence, or workflow migration
is planned. Existing useful behavior is not deleted to simplify screenshots.

## Acceptance gate

- Cover new visitor start, returning-owner resume, due-review handoff, public
  practice, lookup, context/draft preservation, retry, and completion.
- Test desktop 1440×900, tablet 1024×768, mobile 390×844, and focused 320px cases;
  both themes, keyboard, reduced motion, and no horizontal overflow.
- Inspect actual rendered screens and task feedback, not only test counts.
- Retain all existing learning/privacy/revision/idempotency regressions; update
  copy-specific assertions deliberately and add new journey outcomes.
- Build the settled source before final tests; do not verify stale reused dist.
- Run content/type/unit/D1/build/revision checks and full Playwright matrix.
- Push meaningful reviewed commits, pass public CI, merge without bypasses, use
  the established private protected deployment, verify live routes and manifest.
- Distinguish mock-owner tests from real-owner tests and usability observations
  from measured learner efficacy. Record any unavailable verification honestly.

## Progress

- Research, initial live/source review, inventory, and execution contract written.
- Independent feature and browser audits are in progress.
- Implementation and release acceptance are pending; previous release test
  counts must not be reported as evidence for this work.
