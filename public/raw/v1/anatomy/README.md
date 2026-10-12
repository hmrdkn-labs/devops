# Anatomy explanations

Original, portable GFM explanations for `/anatomy/` pages. Each page places an interactive object above its explanation; the Markdown remains useful without the animation and is included in the existing raw-content and ZIP exports.

Each `<slug>.md` pairs with a portable `<slug>.yaml` sidecar (section, order within the section, revision, existing unit/objective IDs, authoritative public references), `src/pages/anatomy/<slug>.astro`, and a page-owned Solid figure under `src/components/anatomy/<slug>/`. The application catalog validates the YAML and projects its metadata; there is no second source-of-truth metadata tree under `src/`. Sections and their reading order are defined once in `src/lib/anatomy/catalog.ts` (`big-picture`, `workloads`, `scheduling`, `networking`, `config-storage`, `security-scaling`, `operations`); the index groups pages by section and every page links to its previous and next page.

Explanations follow one structure, high level → detailed: the big picture (the real problem and who sets what), who owns what, how it works, a YAML example, causal experiments with the figure's controls, misconceptions, safe read-only observation, predict-and-transfer, and assumptions/limits with authoritative sources. The YAML example must match what the figure's manifest panel renders.

Every figure answers one acceptance question after a single interaction: what changed, who caused it, why, and what has not happened yet. Use the shared `ChangeReport` (that answer, as the live region), `StateBadge` (text plus symbol, never colour alone) and `ManifestPanel` (YAML rendered from model state, highlighting the fields the interaction depended on) from `src/components/anatomy/shared/`. Indicators must encode exactly one predicate; identities and per-object state sit next to the object, not only in a distant legend.

Keep explanations here framework-free: mechanisms, assumptions, misconceptions, safe observations, transfer questions, and links. Application geometry/control code does not belong in canonical content. No proprietary course text, screenshots, quizzes, answers, source evidence, or private paths may enter this directory. Figures are authored fixtures, never a live-cluster or mastery claim.

New pages reuse `AnatomyLayout`, the project-local pinned geometry core, site theme tokens, and the bounded motion lifecycle. Preserve existing curriculum/unit/objective IDs and learner history. Review semantics and browser behavior before release.

Explanations use the existing sanitized Markdown renderer with server-rendered, keyboard-focusable table/code scroll regions. Long inline API field names wrap without changing their copied text. Preserve native table semantics and keep scrolling inside the explanation rather than hiding page overflow.
