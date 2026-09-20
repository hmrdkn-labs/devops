# DevOps by hmrdkn-labs — interface design contract

This document governs the visual layer of the learning application. It is
deliberately separate from the portable curriculum: changing this file or the
CSS must never require changing a unit's Markdown, YAML sidecars, IDs, or
learning calculations.

## Product posture

DevOps by hmrdkn-labs is a focused study workspace with a technical learning
product character. The interface should make the next learning action obvious,
keep reading comfortable, and make evidence feel trustworthy. The product may
borrow proven interaction ideas from modern learning tools—one dominant action,
clear progression, tactile controls, and mobile-first navigation—without using
streak pressure, decorative gamification, or obscuring the evidence model.

## Identity

The approved 2026-09-21 direction is **warm paper, cobalt actions, slate dark
mode, and an original beaver character**. See the
[audit and execution plan](docs/LEARNING-EXPERIENCE-AUDIT-2026-09-21.md) and
[six candidate assets](docs/BEAVER-CHARACTER-EXPLORATION.md). This contract
describes the target; PROJECT_STATUS.md distinguishes implementation from release.

- Keep the `DevOps` wordmark and quiet `hmrdkn-labs` signature. The existing
  `<H>` monogram remains until a beaver candidate is selected and integrated;
  do not invent route-specific marks or a second mascot.
- Blue denotes action, selection, and navigational focus. Green denotes correct
  or successfully saved state, not every clickable surface. Amber signals
  caution/assistance and red signals errors; always pair status with text/icons.
- Light mode uses warm paper and white reading surfaces. Dark mode uses slate
  surfaces and soft blue actions. Use restrained surfaces and clear hierarchy,
  not gradients, glow, or rainbow dashboards.
- Use the character sparingly for welcome, help, and completion. It must not
  displace technical diagrams, distract from a mistake explanation, or imply
  earned mastery. Preserve the original generated asset and its prompt record.

## Visual principles

1. **Content before chrome.** A learner's question, answer, explanation, or
   review card gets the strongest hierarchy on its page.
2. **Calm, tactile learning surfaces.** Use a quiet canvas, readable ink, one
   unmistakable action accent, and bounded surfaces that make interactive
   regions obvious. Cards and restrained elevation are appropriate for the
   current task, progress, checkpoints, questions, and reviews; long-form
   reading remains quieter.
3. **Readable density with obvious targets.** Keep prose near 68ch, use a
   compact 8px-derived spacing scale, and give primary decisions enough space
   and contrast to be recognized immediately. Density must never make mobile
   controls or progress states ambiguous.
4. **States are part of the design.** Hover, focus, pressed, selected,
   disabled, loading, empty, error, guest, owner, due, and revalidation states
   must be visually distinct without depending on color alone.
5. **Respect the learner's pace.** High-frequency answer, reveal, and rating
   actions are immediate. Motion is reserved for spatial feedback and must
   respect `prefers-reduced-motion`.
6. **Progress is evidence.** Use compact, honest status chips and bars; never
   use celebratory streak mechanics or noisy gamification.
7. **Reading and retrieval are both first-class.** An unfamiliar lesson may
   start with Read; a returning learner may choose Recall first. Reading owns
   the main workspace rather than squeezing beside a competing question form.
   Explicit reading completion is distinct from recall/application evidence.
   History and Notes stay in context and never erase the current draft.

## Layout contract

- Desktop content shell: `min(1180px, calc(100% - 40px))`.
- Reading column: approximately 68ch; code and tables may widen with an
  explicit overflow boundary.
- Study pages: one primary activity at a time. Reading uses a comfortable main
  column; practice may show a compact question rail. History/Notes are secondary
  context, not a competing permanent third task. Collapse to one main column
  on mobile, with sheets reserved for secondary context.
- Primary controls have at least a 44px touch target.
- Mobile pages must not require horizontal scrolling except for code or data
  tables with an explicit scroll container.
- The initial viewport must make the current objective/activity obvious. Unit
  title/summary and repeated tool instructions must not consume the whole first
  screen. Do not shrink long questions or prose merely to fit them above the fold.

## Type, density, and surface guardrails

- System sans is the UI and reading face. Monospace is limited to code,
  commands, immutable IDs, revision/time metadata, and numeric evidence.
- Home and standard page display headings cap at 40px on desktop. Unit titles
  cap at roughly 39px, section headings at 22–28px, normal reading text at
  16–18px, and secondary labels around 14px. Essential status must not depend on
  10px text. Code may use a distinct compact scale without becoming illegible.
- Static document sections should still prefer spacing and rules, but
  task-oriented sections may use repeated bounded surfaces when the grouping
  communicates interaction or progression. Avoid wrapping every paragraph in
  a card.
- Controls use the control radius; active learning surfaces use the larger
  surface radius. A restrained shared card shadow is permitted for primary
  interactive surfaces and floating navigation. It must come from a semantic
  token rather than one-off component shadows.
- Pills/chips indicate an actual state, filter, or compact step. Do not use
  them as decoration or as a substitute for hierarchy.

## Token contract

The shared stylesheet owns semantic tokens for canvas, surfaces, ink, muted
text, borders, accent, success, warning, danger, code, spacing, radii, and
focus. Components consume tokens instead of inventing page-specific colors.
Light and dark themes must carry the same semantic roles and meet WCAG AA
contrast for normal text and controls.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F7F5F0` | `#151C24` |
| Main surface | `#FFFFFF` | `#1D2732` |
| Primary text | `#202B33` | `#F1F3F5` |
| Secondary text | `#52616B` | `#B2BEC9` |
| Action | `#2358C4` | `#A9C2FF` |
| Text on action | `#FFFFFF` | `#142238` |
| Correct | `#23745A` | `#82CEAF` |
| Caution | `#8A5400` | `#E5B96B` |
| Incorrect | `#B34436` | `#FFB3A7` |
| Required control boundary | `#788690` | `#778793` |

Hover/pressed/selected/focus states need measured real combinations too. Subtle
decorative dividers are not substitutes for a visible interactive boundary.
Never rely on red/green alone; diagrams name their components and distinguish
control from execution paths with labeled line styles as well as color.

## Component vocabulary

Prefer native, accessible elements first: links, buttons, `details`, `summary`,
`fieldset`, labels, inputs, progress bars, and tables. Shared visual patterns
are:

- shell/header/navigation and breadcrumb/context row;
- buttons, quiet buttons, status chips, badges, and icon buttons;
- tactile learning cards, bounded surfaces, callouts, empty states, skeletons,
  and inline status;
- question/answer comparison, critical-point checklist, rating group;
- study/reference mode switch, directional hint, learn-first escape hatch,
  correction prompt, and explicit next-unit action;
- progress/meter, timeline/stepper, filter row, search field, and note editor;
- popover/menu with a visible trigger and a keyboard-safe focus path.
- a four-destination mobile learning dock for Learn, Review, Practice, and Library;
  less frequent navigation stays in the header menu.

Do not add a React/Tailwind component dependency solely for styling this
Astro/Solid application. Borrow interaction patterns and copy only the small
surface primitives the product actually needs.

## Motion contract

Default to no animation for repeated study interactions. If motion is added,
it must explain a state change, be interruptible, use transform/opacity rather
than layout animation, and disappear or simplify for reduced-motion users.
Keep action/feedback positioning stable without giant empty fixed-height cards.
Preserve drafts, selection, and focus return when opening context. Save success
is shown only after acknowledgement; a failed save must remain retryable without
erasing work. Do not animate the entire page on every question change.

## Verification contract

Every visual release is checked at 375×812, 768×1024, and 1440×1000 in light
and dark themes. The browser suite captures the home, focused KCNA workspace,
plain KCNA path, representative study unit, library, search, and map at each target project size and asserts
that they do not horizontally overflow. It also enforces the 40px display-type
ceiling, initial-viewport question visibility, and 44px mobile-header touch
targets. These screenshots are CI evidence rather than pixel-perfect golden
files so system-font rasterization differences do not create false failures.

Certification focus pages may isolate a subset of the portable curriculum for
attention, but they must not fork or duplicate canonical unit content. A focus
page is an index and navigation layer over existing path/unit IDs.

The focused KCNA workspace should answer "what do I do now?" before it asks the
learner to browse. Its primary action assembles due KCNA review work before the
next unencountered unit, checkpoint disclosure defaults to the current segment,
and readiness is explainable through Encountered, Recall, Applied, and Retained
dimensions. Weak-spot labels are evidence diagnostics, not grades.

KCNA MCQ practice is a separate refresher surface, not a mastery shortcut. It
may use single-select, multi-select, command-recognition, and scenario
questions, but checking an answer must explain every option rather than only
revealing the correct choice. The question bank remains canonical portable
YAML, guest/session state stays memory-only, and MCQ scores do not modify
readiness or FSRS evidence. On mobile, answer rows and session controls must
retain the same 44px minimum interaction target as the rest of the learning
shell.

The study flow, review queue, search, settings, and auth menu must remain
keyboard-complete. Check focus visibility, contrast, empty/error/loading
states, no layout shift, and no unintended horizontal overflow. Existing
content, type, privacy, D1, and end-to-end tests remain the source of truth for
behavior.
