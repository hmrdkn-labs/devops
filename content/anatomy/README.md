# Anatomy explanations

Original, portable GFM explanations for `/anatomy/` pages. Each page places an interactive object above its explanation; the Markdown remains useful without the animation and is included in the existing raw-content and ZIP exports.

Each `<slug>.md` pairs with `src/lib/anatomy/pages/<slug>.ts` (revision, existing unit/objective IDs, authoritative public references), `src/pages/anatomy/<slug>.astro`, and a page-owned Solid figure under `src/components/anatomy/<slug>/`.

Keep explanations here framework-free: mechanisms, assumptions, misconceptions, safe observations, transfer questions, and links. Application geometry/control code does not belong in canonical content. No proprietary course text, screenshots, quizzes, answers, source evidence, or private paths may enter this directory. Figures are authored fixtures, never a live-cluster or mastery claim.

New pages reuse `AnatomyLayout`, the project-local pinned geometry core, site theme tokens, and the bounded motion lifecycle. Preserve existing curriculum/unit/objective IDs and learner history. Review semantics and browser behavior before release.
