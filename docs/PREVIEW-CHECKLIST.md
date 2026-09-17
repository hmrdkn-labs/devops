# Learner journey local preview

Open [http://localhost:4321/](http://localhost:4321/) in a browser on the same
Mac that runs the preview. This is a local guest preview, not a public preview
or a mobile-phone link. Use browser responsive mode for 390px and 320px checks.
Try both light and dark themes.

The preview uses `wrangler.e2e.jsonc` with no database or auth binding. Guest
answers stay in memory on the current page. Real owner sign-in, saved history,
private notes, and persistence cannot be verified here. Automated owner checks
use API mocks. Production remains unchanged.

Local acceptance is complete for code `65ebdeb` on `feat/learning-journey-ux`.
Plan commit: `533456a`; code commits: `c8c5136` (guided navigation/path),
`d93e3ea` (focused tasks/mobile feedback), `65ebdeb` (model hydration race fix).
Final local CI passed 82 Vitest tests, zero Astro errors/warnings, content/D1
checks, build, and manifest generation; revision and diff checks passed.
The full browser matrix passed 139 cases with 44 intentional skips
(183 total, 53.3 seconds), including feedback/focus, review-loading, account
recovery, and delayed model hydration regressions.

| Route | Manual checks |
| --- | --- |
| `/` | Learn is active. Start learning opens a concrete unit rather than another landing page. The KCNA outline and foundation alternate are reachable. |
| `/kcna/` | The next task precedes the four curriculum sections. Open each section; units and lesson checkpoints remain reachable. Optional tools are explicitly disclosed. |
| `/practice/` | Open MCQ practice, a lesson, and a model. In MCQ practice, choose a wrong answer, check it, read the rationale, retry with the correct answer, and confirm correction does not improve the first-attempt score. Session options remain available. |
| `/lesson/kcna-kubernetes-resources/` | At 390px and 320px, check a task and confirm the verdict and explanation are visible above the sticky action bar. Retry and Continue remain reachable; focus follows the current task. |
| `/learn/kubernetes-manifests/` | Type an explanation draft. Open History and Reference, then close them: the draft and current question remain intact, and focus returns to the opener. Guest History should explain its unavailable private data without inventing saved answers. Reveal/check feedback remains reachable. |
| `/library/` | Search, Prerequisite map, and References each open their named destination. Browse grouped units and check the Markdown archive/manifest links. |

Across these routes, desktop shows one primary navigation and mobile shows one
four-link dock: Learn, Review, Practice, Library. Search, theme, and account
utilities remain reachable. Check keyboard focus, readable controls, and absence
of horizontal overflow.

Open Review from the primary navigation. The guest state should explain that
scheduled private reviews require owner access; it must not claim there are zero
due cards or that a review was saved. Loading should say that reviews are being
checked, and guest copy should describe the current page's memory-only activity.

To rebuild and restart from the repository directory after stopping the existing
preview process:

```sh
npm run build && npx wrangler dev --config wrangler.e2e.jsonc --port 4321
```

Manual inspection confirmed the 390px dark Resources wrong-answer verdict fully
visible above actions and contextual draft retention; desktop light Learn and
dark Study screenshots were also inspected. Other viewport checks, including
320px, are automated. No real-owner persistence or learner efficacy claim is made.

Review branch `feat/learning-journey-ux` for release. The local CI command does
not establish a GitHub CI result. Protected production rollout follows the user
preview and the public CI, merge, and protected deployment gates.
