# Security policy

Please report vulnerabilities privately through GitHub's security advisory
feature. Do not open a public issue for authentication bypasses, secret
exposure, cross-user data access, or injection vulnerabilities.

The owner beta intentionally rejects every OAuth identity not present in the
provider-ID allowlist. Email addresses are not authorization. Learner notes and
answers must never be included in logs, analytics, public search, semantic
search, public profiles, or release artifacts.

Supported security fixes target the current `main` branch. Production secrets
and Cloudflare resource identifiers are managed only by the private
infrastructure repository.
