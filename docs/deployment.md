# Deployment contract

## Ownership split

The public `hmrdkn-labs/devops` repository owns application source, portable
content, migrations, tests, generated content manifests, and immutable release
attestations. It has no production secrets and cannot deploy production from a
pull request.

The private `hamardikan-infra` repository owns:

- the D1 resource and Worker binding;
- Google OAuth secrets;
- `BETTER_AUTH_SECRET`, owner identity allowlist, and production origin;
- `devops.hamardikan.com` DNS/custom-domain configuration;
- protected deployment approval, smoke verification, and rollback target.

## Release classes

A release is `content-only` only when every changed path is canonical content or
its deterministic generated counterpart. The classifier fails closed. The
private workflow must independently verify the diff, lockfile, source tree,
migration set, binding contract, and workflow set before allowing an automatic
content deployment.

Any source, dependency, schema, migration, binding, or workflow change is an
`application-or-schema` release and requires protected approval.

## Required production bindings and variables

The Worker receives a D1 binding named `DB` and the variables documented in
`.dev.vars.example`. Values never enter the public repository. OAuth callback
URL is:

```text
https://devops.hamardikan.com/api/auth/callback/google
```

## Verification and rollback

After deploy, the private workflow must verify:

1. `/api/health` returns `status: ok`, `database: ready`, and the expected
   content manifest SHA;
2. the homepage, one prerendered unit, raw Markdown, search index, and auth
   entrypoint respond successfully;
3. the deployed release manifest matches the approved source commit;
4. the previous Worker version remains recorded as the rollback target.

Database migrations are applied before traffic promotion and are forward-safe.
Rollback never deletes learner events. Schema changes therefore need protected
review even when the Worker code itself is backward compatible.
