# DevOps by hmrdkn-labs

A portable, question-first DevOps learning system planned for
[`devops.hamardikan.com`](https://devops.hamardikan.com). Download the Markdown
or run the same curriculum locally today.

> The guest production route is live; the Google-only owner rollout is in
> progress. See [`PROJECT_STATUS.md`](PROJECT_STATUS.md) for the exact
> implementation state, blockers, and safe resume order.

The owner beta starts with **From Process to Pod**: 18 original learning units
that connect computer processes, Linux, networking, containers, Git/YAML, and
Kubernetes. It includes 36 explain-or-predict questions, guided practice, and
90 FSRS review cards.

## What makes it a learning tool

Each unit asks for an explanation or prediction before revealing prose. The
learner then compares against a concise model, checks critical points, and rates
the retrieval as Again, Hard, Good, or Easy. Reviews mix approximately 60%
short cards, 20% explanation prompts, and 20% troubleshooting/configuration
scenarios.

Mastery progresses through `Encountered → Recalled → Applied → Retained`.
`readiness-v1` weights current evidence as 15% encountered, 30% recall, 30%
application, and 25% later-date retention. Evidence becomes stale over time;
critical path units carry weight 2.

Guests can read and complete a session without an account. Guest activity is
memory-only and is never merged after sign-in. Only the explicitly allowlisted
Google provider identity may create the single owner account and persist
private answers, notes, progress, and reviews.

## Portable content

`content/` is the canonical source of truth and has no Astro or Cloudflare
syntax. Every unit contains:

```text
content/units/<slug>/
├── unit.md          # standalone GitHub-Flavored Markdown
├── metadata.yaml    # identity, revisions, objectives, prerequisites
├── questions.yaml   # question-first prompts and critical points
├── cards.yaml       # short, prompt, and scenario reviews
├── practice.yaml    # validated Markdown-guided practice
└── sources.yaml     # independently reviewed references
```

Generated public interfaces include stable raw Markdown URLs, a versioned
manifest, exact-search index, reference catalog, Atom feed, `llms.txt`,
`llms-full.txt`, and a downloadable ZIP archive.

The private KodeKloud collection is not a dependency, submodule, build input,
or deployment artifact. This repository contains independently written prose,
diagrams, questions, and examples. External course titles and links may be
cataloged as references, but mirrored lessons, images, code, and course
structure do not belong here.

## Run locally

Requirements: Node.js 22+, npm 10+, and a Cloudflare account only when testing
remote resources or deploying.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

The default local URL is `http://localhost:4321`. Without OAuth credentials or
a D1 binding, the full public guest experience still works and `/api/health`
reports the database as unbound.

Vite+ is available as an authoring convenience while it remains beta:

```bash
vp run dev
vp run check
vp run build
```

The ordinary npm scripts above remain the supported fallback.

## Validate and test

```bash
npm run content:check   # schemas, IDs, graph, sources, certifications, card mix
npm run revision:check -- --base=origin/main
npm run typecheck
npm test
npm run test:d1
npm run build
npm run test:e2e
```

`npm run check` runs content, TypeScript, unit, privacy, and local D1 checks.
The end-to-end suite exercises the guest study flow, exact search, desktop and
mobile layouts, and automated accessibility checks.

## Owner authentication

Better Auth runs inside the same Cloudflare Worker and stores its tables in D1.
Copy `.dev.vars.example` and set the Google OAuth application plus:

- `OWNER_IDENTITIES`: the stable Google provider identity in the form
  `google:<subject>`;
- `BETTER_AUTH_SECRET`: a random value of at least 32 characters;
- `BETTER_AUTH_URL`: the deployment origin.

Authorization never relies on an email address. The allowlisted Google account
may create the single owner account; other Google identities are rejected.

## Architecture

The application uses Astro 7, small Solid islands, the Cloudflare adapter, one
Worker, D1, Better Auth, and `ts-fsrs`. Read-only lesson pages are prerendered.
Cloudflare-specific code stays behind server adapters; canonical content and
learning calculations remain framework-independent.

Production bindings, secrets, DNS, deploy approval, verification, and rollback
belong to the private `hamardikan-infra` repository. This public repository owns
source, content, tests, generated content manifests, and release attestations.
It intentionally contains no production resource IDs or secrets. See
[`docs/deployment.md`](docs/deployment.md).

Containerization and D1-to-PostgreSQL migration are explicit post-v1 work. The
content archive is already container- and framework-independent, so that future
move changes adapters rather than curriculum.

## Licensing and independence

Application code and original examples are MIT licensed. Original prose and
diagrams are CC BY-SA 4.0. See `LICENSE`, `LICENSE-CONTENT.md`, and `NOTICE.md`.

This is an independent learning project, not affiliated with or endorsed by
CNCF, Linux Foundation, Kubernetes, Docker, AWS, or KodeKloud. Product and
certification names are trademarks of their respective owners.
