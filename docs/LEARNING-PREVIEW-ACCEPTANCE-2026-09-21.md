# Learning experience preview — acceptance record

2026-09-21 · Local engineering acceptance passed; owner usability trial pending.

This is the first increment of the approved
[experience plan](LEARNING-EXPERIENCE-AUDIT-2026-09-21.md), not a claim that every
module has been rewritten or that the product matches Brilliant/Duolingo.

## What is ready

| Scope | Result | Boundary |
| --- | --- | --- |
| Study workspace | Read and Practice are peer modes; primary reading has full-width space, a direct completion action, contextual History/Notes, and preserved draft/scroll state | Guest work remains page-memory-only; reading and recall evidence remain separate |
| Curriculum | 42 of 93 teaching rows have validated section/objective targets; stable heading IDs handle duplicates and fenced examples | Other rows retain existing destinations; shared unit evidence is not per-step completion |
| Scheduling | Read → initial prediction → change one condition → actor/proof explanation → independent transfer and typed self-check | Simplified authored model, no provisioning, no AI grading, no new mastery writes |
| Visual system | Warm paper/cobalt and slate/soft-blue themes, semantic feedback, contrast tests, stronger controls, compact reader introduction | Existing monogram remains; six beaver candidates await selection |
| Portability | Original Markdown/YAML, compiler validation, raw files and archive rebuilt | No content duplication into framework components; immutable IDs retained |

The Scheduling payload retains the previous component walkthrough as an
explicitly separate example. The new fixture has no eligible nodes initially;
adding only a matching toleration makes node-b eligible. Transfer uses different
nodes so copying a revealed choice is not sufficient. CPU availability means
allocatable capacity minus existing requests, not instantaneous utilization.

## Verification receipts

- `npm run ci`: content contract passes; Astro reports 103 files with zero
  errors, warnings, or hints; Vitest **117/117**; D1 migration, due-index,
  idempotency, reading-evidence, and revision-revalidation checks pass; production
  build and manifest generation pass.
- `npm run test:e2e -- --workers=3 --reporter=dot`: **215 passed, 52 intentional
  skips, zero failures**, across desktop 1440×900, tablet 1024×768, and mobile
  390×844. Individual responsive tests additionally check narrower sizes.
- `npm run revision:check -- --base=origin/main`: classifications match hashes.
- `git diff --check`: clean.
- Main-browser review: 390px and 1440px; warm-paper and dark-slate screens;
  in-place History; draft retained across Read/Practice; readable wrong-answer
  feedback; visible next-stage heading; Scheduling Static Pod link lands at the
  matching article heading.

The first full matrix found stale selectors for the replaced progress badges,
hidden-draft assertions that needed an explicit return to Practice, and a real
public-reader delay while identity was pending. The final implementation exposes
the article independently of that request, keeps save actions disabled while
identity is unknown, and defers encounter writes. The stronger pre-identity
reader test was restored rather than accepting an auth-dependent reader.

The final content manifest starts `d65e8ead227f`. Rebuild and generate a fresh
release manifest against the exact approved commit before any deployment;
intermediate dirty-tree build manifests are not release receipts.

## Try this preview

1. Open [the reader](http://localhost:4321/learn/kcna-scheduling-review/?mode=reference).
   Read first, use **Mark read & try the concept**, type an explanation, and
   switch Read/Practice or open History. The draft should remain.
2. Open [Scheduling](http://localhost:4321/models/pod-scheduling/). Intentionally
   choose a wrong node set. Can you explain the specific failed constraint and
   find the next action without coaching?
3. Complete the changed and transfer scenarios. Explain why a toleration is not
   attraction, and why a binding is not proof that a container started.
4. Open [KCNA](http://localhost:4321/kcna/), expand Scheduling, and choose Static
   Pods. It should open the relevant heading, not the top of the broad reference.
5. Try the same journey on a narrow viewport and with a keyboard. Note confusing
   labels, unnecessary scrolling, obscured content, and whether saving is clear.

This preview is a local guest Worker with no database or auth bindings. It does
not validate real-owner sign-in/persistence, and it does not save trial answers.
The browser tests use mocked owner APIs plus separate local D1 checks. No
production accounts or learning history were modified.

## Remaining gates

- Choose a [beaver candidate](BEAVER-CHARACTER-EXPLORATION.md); integrate it in
  restrained welcome/help/completion roles and check small-size legibility.
- Obtain owner/learner feedback on the prototype before applying the new sequence
  broadly. The proposed five-person formative round and later recall assessment
  have not happened; engineering tests cannot stand in for them.
- Build the objective/coverage matrix and propagate to Fundamentals/Resources,
  then thin Security/Storage/Mesh refresher coverage. Do not add filler questions.
- Define persisted prototype/review integration before calling the prototype a
  completed tracked lesson. Current UI explicitly makes no score/mastery claim.
- Remote exact-head CI, PR/merge, and protected release remain outstanding. No
  architecture migration is needed, and production is unchanged.
