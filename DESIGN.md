# DevOps by hmrdkn-labs — interface design contract

This document governs the visual layer of the learning application. It is
deliberately separate from the portable curriculum: changing this file or the
CSS must never require changing a unit's Markdown, YAML sidecars, IDs, or
learning calculations.

## Product posture

DevOps by hmrdkn-labs is a focused study workspace with a technical-notebook
character. The interface should make the next learning action obvious, keep
reading comfortable, and make evidence feel trustworthy. It should not feel
like a generic SaaS dashboard or a marketing page wrapped around a quiz.

## Visual principles

1. **Content before chrome.** A learner's question, answer, explanation, or
   review card gets the strongest hierarchy on its page.
2. **Quiet technical notebook.** Use a neutral paper/canvas, dark ink, one
   unmistakable terminal accent, thin structural rules, and very restrained
   elevation. Avoid gradients, decorative textures, and competing accents.
3. **Readable density.** Keep prose near 68ch, use a compact 8px-derived
   spacing scale, and remove empty vertical space that hides the next action.
4. **States are part of the design.** Hover, focus, pressed, selected,
   disabled, loading, empty, error, guest, owner, due, and revalidation states
   must be visually distinct without depending on color alone.
5. **Respect the learner's pace.** High-frequency answer, reveal, and rating
   actions are immediate. Motion is reserved for spatial feedback and must
   respect `prefers-reduced-motion`.
6. **Progress is evidence.** Use compact, honest status chips and bars; never
   use celebratory streak mechanics or noisy gamification.

## Layout contract

- Desktop content shell: `min(1180px, calc(100% - 40px))`.
- Reading column: approximately 68ch; code and tables may widen with an
  explicit overflow boundary.
- Study pages: desktop two-column layout with a compact context/progress rail
  and a primary question/lesson column; collapse to one column on mobile.
- Primary controls have at least a 44px touch target.
- Mobile pages must not require horizontal scrolling except for code or data
  tables with an explicit scroll container.

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
- bordered surfaces, callouts, empty states, skeletons, and inline status;
- question/answer comparison, critical-point checklist, rating group;
- progress/meter, timeline/stepper, filter row, search field, and note editor;
- popover/menu with a visible trigger and a keyboard-safe focus path.

Do not add a React/Tailwind component dependency solely for styling this
Astro/Solid application. Borrow interaction patterns and copy only the small
surface primitives the product actually needs.

## Motion contract

Default to no animation for repeated study interactions. If motion is added,
it must explain a state change, be interruptible, use transform/opacity rather
than layout animation, and disappear or simplify for reduced-motion users.

## Verification contract

Every visual release is checked at 375px, 768px, and 1440px in light and dark
themes. The study flow, review queue, search, settings, and auth menu must be
keyboard-complete. Check focus visibility, contrast, empty/error/loading
states, no layout shift, and no unintended horizontal overflow. Existing
content, type, privacy, D1, and end-to-end tests remain the source of truth
for behavior.
