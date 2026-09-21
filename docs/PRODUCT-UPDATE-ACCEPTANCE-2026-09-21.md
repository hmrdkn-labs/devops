# Learning experience update — acceptance record

2026-09-21 · acceptance passed; merged, deployed, and live-verified

## Shipped scope

- First-class reading with explicit reading completion, peer Read/Practice
  modes, retained drafts, and contextual History/Notes. Reading is not recall.
- Warm-paper/cobalt light and slate/soft-blue dark themes, responsive navigation,
  readable status text, measured token contrast, and reduced-motion support.
- User-selected original A1 beaver in the shared header, favicon, and home
  welcome. The source is unchanged. Static proportional 32/64/144/288px PNGs
  avoid runtime image services and oversized downloads on SSR pages.
- Five-stage guided exploration for Scheduling, ReplicaSet reconciliation,
  and the Service request path. The two new generic sequences retain answers
  when revisiting stages. Existing detailed component walkthroughs remain
  available as separate examples. Predictions receive specific authored
  feedback; typed comparison is ungraded and memory-only.
- 19 original MCQs added (82 total). Displayed module practice grows to
  Fundamentals 10, Resources 18, Security 7, Storage 6, and Service Mesh 6.
- 67/93 teaching rows have validated section/objective targets. Shared unit
  evidence is labeled as shared; source-video timing is not our reading time.
- Portable Markdown/YAML, manifest, reference catalog, and archive refreshed.

## Verification

| Check | Result |
| --- | --- |
| Content contract | 40 units, 32 KCNA units, 82 MCQs, 252 cards, 3 mental models validated |
| Unit/content tests | 127 passed across 13 files |
| Astro check | 108 files; zero errors, warnings, or hints |
| D1 regression | Empty migrations, due index, idempotency, lesson evidence, revalidation passed |
| Full Playwright | 227 passed, 52 intentional skips, 0 failed; 279 cases across desktop/tablet/mobile |
| Revision classifier | Pass against the remote main baseline |
| Git diff whitespace | Pass |
| Production build | Pass; immutable release manifest generated |

Content manifest SHA-256:
`7b0b7ee64bc1aa27fc4d09e24630d96ee99973bb30882fd52347fcfb7e8f851f`.

Manual browser checks covered the mobile welcome, full-width reader, explicit
reading-to-practice entry, reconciliation wrong-answer feedback, network
configuration versus execution explanations, both themes, and the small
decoded mascot on the server-rendered dashboard. The prior preview acceptance
also records reader/history draft retention and exact-section navigation.
Browser tests cover delayed hydration, keyboard/focus behavior, narrow layouts,
guest write restrictions, mocked-owner history/progress, and serious/critical
axe checks on the guided entry and incorrect-answer surfaces.

## Defects found and resolved during acceptance

1. Cloudflare's compile-time image integration fell back to the 1 MB original
   on dynamic routes. Explicit static derivatives now serve both static and
   server-rendered layouts; decode/size/HTTP tests cover both.
2. Fixed-count MCQ tests still expected 63. Their totals now come from the
   schema-validated canonical practice set without weakening behavior checks.
3. The legacy delayed-hydration test needed to open the newly optional detailed
   walkthrough before inspecting its controls. The hydration guard stays tested.
4. New answer positions were too predictable. Authored ordering now varies
   without changing stable answer IDs; a regression test checks diversity.
5. A `kubectl get -o wide` example claimed a condition that command does not
   display. Its expected evidence is now limited to the node column.
6. Guided links labeled Read now enter the reader, not recall-first practice.
7. Source enrichment increments unit and sidecar revisions consistently while
   retaining objective/card mastery hashes and existing learning evidence.
8. The first remote browser run reported a 6px mobile geometry difference in
   the History keyboard test. Its trace showed the baseline was sampled during
   native focus scrolling (24 → 33 → 37 → 39px). The test now waits for heading
   and scroll geometry to settle across four animation frames before measuring.
   All existing 4px limits remain; no app behavior or tolerance was changed.
   The corrected test passed 50 repeated local mobile runs. Exact-head PR CI
   and post-merge main CI subsequently passed all gates.

## Production release receipt

| Evidence | Result |
| --- | --- |
| Public source | [PR #17](https://github.com/hmrdkn-labs/devops/pull/17), merged with meaningful commits retained |
| Deployed source SHA | `31df4f5c5fd078df698e1eb7283299515f87730f` |
| Tested PR head | `aded607e19228782806e8860dc817363afeaee83`; merge tree identical |
| PR CI | [35547706451](https://github.com/hmrdkn-labs/devops/actions/runs/35547706451), all gates passed |
| Main CI | [35548008732](https://github.com/hmrdkn-labs/devops/actions/runs/35548008732), all gates passed |
| Private protected deployment | [35548278032](https://github.com/hamardikan/hamardikan-infra/actions/runs/35548278032), successful owner-mode deployment |
| Deployment verification time | 2026-09-21 00:38 UTC / 07:38 WIB |
| Live service | [devops.hamardikan.com](https://devops.hamardikan.com/) |
| Health | `status: ok`, `database: ready`; live manifest matches the SHA above |
| Authentication | Configured; unauthenticated session endpoint returns 2xx |
| Migrations | No migrations to apply |
| Previous Worker rollback target | `d6a21a1f-9803-447a-97bb-2a095adc69a5` (preserve D1) |

After deployment, public HTTP checks returned 200 for the home, KCNA curriculum,
three guided models, security practice, Scheduling reader, raw Scheduling
Markdown, and the mascot asset. The live 64px PNG has the same SHA-256 as the
tested repository asset:
`81cfbf36633880e8c1474bd8fa76ad6e519fba86eca4b8d116990842daa4b288`.

Manual production browser checks verified the selected A1 identity and decoded
small assets on desktop, Start learning opening the full reader, and the
reconciliation guide at 390px. An intentionally incorrect scheduler prediction
revealed the specific correction and working next-stage control. Both themes
had no horizontal page overflow; theme and viewport settings were restored.
The browser session was a guest. No owner learning records were written.

This receipt is a documentation-only follow-up; the deployed application SHA
remains the exact source above. No dependency, database-schema, auth, or private
infrastructure architecture change was required. The private infrastructure
checkout's unrelated uncommitted changes were left untouched.

## Boundaries and remaining work

This is acceptance of the approved product increment, not a claim of parity
with Brilliant or Duolingo, a participant usability study, retention gains,
exam readiness, or site-wide WCAG certification. The user requested completion
and release after selecting A1; the earlier proposed trial is not fabricated
as having happened. The three guided explorations are not executable labs and
do not persist attempts. Production owner OAuth and personal answer writes
are not exercised by the guest smoke checks; owner scenarios are mocked/local.

The coverage audit records two canonical worked-example gaps and several
thin transfer objectives. Those remain a content review queue, not hidden
behind question counts. Broader 70–100-unit growth, new persistence, container
migration, and advanced platform features remain outside this release.

All publication gates for this increment are complete. Real owner sessions and
authenticated production persistence verification remain follow-up learning and
operational checks; the release does not claim those were performed by the
guest smoke tests. Subsequent documentation commits do not imply another
application deployment.
