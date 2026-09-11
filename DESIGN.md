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

- The primary mark is the compact `<H>` monogram: angle brackets communicate
  code/configuration, while `H` ties the product to hmrdkn-labs. Use the mark
  with the `DevOps` wordmark and the quiet `hmrdkn-labs` signature in the
  application shell. Do not create route-specific logo variants.
- Terminal green is the identity accent, not a decorative headline color.
  Reserve it for the primary action, active navigation, focus, progress, and
  meaningful saved/success state. Display headings stay neutral ink.
- Light and dark modes use the same hierarchy: neutral canvas, neutral ink,
  thin rules, and one green accent. No gradients, glow, neon backgrounds, or
  multi-accent dashboard palettes.
- The favicon and header mark are the same symbol. Identity changes therefore
  remain visible even when the learning content is consumed outside the home
  page.

## Visual principles

1. **Content before chrome.** A learner's question, answer, explanation, or
   review card gets the strongest hierarchy on its page.
2. **Calm, tactile learning surfaces.** Use a neutral canvas, dark ink, one
   unmistakable terminal accent, and bounded surfaces that make interactive
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
7. **Retrieval is the default, not a trap.** Study mode asks for an answer
   before explanation, but a learner seeing a concept for the first time may
   explicitly choose Learn first. That action records Encountered evidence
   only. Reference mode is a lookup surface and must never silently create
   recall evidence.

## Layout contract

- Desktop content shell: `min(1180px, calc(100% - 40px))`.
- Reading column: approximately 68ch; code and tables may widen with an
  explicit overflow boundary.
- Study pages: desktop two-column layout with a compact context/progress rail
  and a primary question/lesson column; collapse to one column on mobile.
- Primary controls have at least a 44px touch target.
- Mobile pages must not require horizontal scrolling except for code or data
  tables with an explicit scroll container.
- A learning unit must show its active question completely in the initial
  1440×1000 and 375×812 viewport. Unit title/summary context cannot consume the
  first screen and force the learner to scroll before answering.

## Type, density, and surface guardrails

- System sans is the UI and reading face. Monospace is limited to code,
  commands, immutable IDs, revision/time metadata, and numeric evidence.
- Home and standard page display headings cap at 40px on desktop. Unit titles
  cap at roughly 39px, section headings at 22–28px, normal reading text at
  15–17px, and metadata at roughly 10–13px.
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
- a four-destination mobile learning dock for Home, KCNA, Review, and Library;
  less frequent navigation stays in the header menu.

Do not add a React/Tailwind component dependency solely for styling this
Astro/Solid application. Borrow interaction patterns and copy only the small
surface primitives the product actually needs.

## Motion contract

Default to no animation for repeated study interactions. If motion is added,
it must explain a state change, be interruptible, use transform/opacity rather
than layout animation, and disappear or simplify for reduced-motion users.

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

The study flow, review queue, search, settings, and auth menu must remain
keyboard-complete. Check focus visibility, contrast, empty/error/loading
states, no layout shift, and no unintended horizontal overflow. Existing
content, type, privacy, D1, and end-to-end tests remain the source of truth for
behavior.
