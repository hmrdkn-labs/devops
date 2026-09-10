# UI reset and study-workspace plan

> **v3 implementation record · 2026-09-10:** the reset below is now
> implemented as a compact developer-learning workspace. The release keeps the
> original content/application contracts while replacing the remaining
> marketing/card-heavy presentation with dense lists, ruled document sections,
> a `<H>` identity, restrained terminal-green state/action color, and a
> question-first study viewport.

## Scope

Replace the visual treatment of the Astro/Solid application while preserving
the content contract, route structure, question-first learning flow, auth,
D1 persistence, FSRS scheduling, readiness calculations, and portable exports.
This is a presentation change, not a curriculum or architecture migration.

## Current assessment

The existing interface has a coherent paper/grid notebook identity, oversized
display type, green accent, thin rules, and generous whitespace. The main
problem is not inconsistency; it is that the study and review tasks are buried
inside marketing-like hero spacing and repeated generic panels. The redesign
keeps the notebook voice but turns it into a focused workspace.

## Target experience

### Shared shell

- Compact 56px header with the `<H>` mark, `DevOps / hmrdkn-labs` wordmark,
  active Learn/Review/Library/Map navigation, Search utility, theme control,
  and owner menu.
- Desktop navigation with a clear current location; mobile navigation becomes
  an accessible disclosure rather than an overflowing row.
- Consistent page context row for section, revision, layer, and status.
- Footer stays useful but visually subordinate.

### Home

- Use a compact learning-workspace opening rather than a marketing hero; cap
  the display title at 40px.
- Put “Continue learning” and current path progress in the first viewport.
- Present the four-part learning loop as a compact sequence, not a second hero.
- Turn the path preview into a clear progression rail.

### Learning unit

- Treat the question stage as the primary workspace.
- Desktop: sticky context/progress rail plus a 68ch question and lesson column.
- Mobile and desktop: the current question must be fully visible before the
  first scroll on the representative KCNA review unit.
- Make answer, reveal, critical self-check, and rating states unmistakable.
- Keep lesson, guided practice, cards, notes, and sources as clear follow-on
  sections with consistent disclosure surfaces.

### Review

- One-card focus with due count and unit context.
- Reveal answer in place; keep four ratings equal in size and prominence.
- Add visible keyboard hints only where the interaction is actually supported.

### Path, map, library, search, dashboard, settings, references

- Use dense ordered rows for the path and layer/edge language for map
  relationships.
- Use flat lists, document sections, and data rows instead of card walls.
- Make search controls command-like: one strong field, a layer filter, result
  count, and a useful empty state.
- Make dashboard evidence-oriented: readiness summary, due reviews, unit
  states, and revalidation notices.
- Use form rows and inline status for settings; keep export actions prominent.

## Execution phases

1. **Foundation:** replace global tokens, type scale, spacing, surfaces,
   borders, focus, control states, theme values, and motion rules.
2. **Shell/home:** update the shared layout, active navigation, mobile menu,
   homepage hierarchy, and responsive shell.
3. **Study core:** update unit and review compositions and their high-frequency
   interaction states.
4. **Browse/owner surfaces:** update path, map, library, search, dashboard,
   settings, and references using the same primitives.
5. **Verification:** run typecheck, tests, build, E2E, accessibility, and
   screenshot checks at the three target widths and both themes.
6. **Release:** commit the exact public source, deploy through the existing
   protected Worker workflow, and verify the live routes.

## v3 verification additions

- Playwright now runs exact desktop (1440×1000), tablet (768×1024), and mobile
  (375×812) viewport projects.
- Six primary surfaces are captured as browser-test evidence at every project
  size: home, KCNA path, study, library, search, and map.
- Geometry assertions fail on unexpected horizontal overflow, display headings
  above 40px, a study question pushed below the initial viewport, or mobile
  header controls below 44px.
- Pixel-perfect cross-platform golden screenshots are intentionally avoided;
  the application uses system UI fonts, whose rasterization differs between
  macOS development and Ubuntu CI.

## Non-goals

- No Markdown/YAML or content rewrite.
- No change to IDs, prerequisites, certification metadata, APIs, auth policy,
  D1 schema, FSRS behavior, or readiness math.
- No React/Tailwind migration and no new component-library lock-in.
- No formal lab platform, semantic search, restore workflow, or container
  deployment in this UI pass.

## External references

- [UI Skills](https://www.ui-skills.com/)
- [COSS UI](https://coss.com/ui)
- [Design System Checklist](https://www.designsystemchecklist.com/)
- [ReUI](https://reui.io/components)
- [You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations)
