# Contributing

Contributions should improve an independently written, portable learning unit.
Do not submit copied course prose, screenshots, proprietary images, paywalled
code, answer keys, or mirrored course structure.

## Content workflow

1. Start from an existing unit directory or the content issue template.
2. Keep canonical content in GFM and YAML; never add MDX or Astro components.
3. Cite authoritative, public sources in `sources.yaml` and record a current
   `verified_at` date.
4. Reuse immutable IDs. Add an alias instead of recycling a retired ID.
5. Increment the integer revision when content changes.
6. Classify the highest-impact change: `editorial`, `enrichment`, or
   `mastery_affecting`.
7. Run `npm run content:build`, `npm run revision:check -- --base=origin/main`,
   and `npm run check`.

Questions should elicit reasoning before explanation. Model answers stay
concise and include explicit critical points. Scenario cards should test
diagnosis or configuration judgment, not trivia.

## Code workflow

Run `npm run ci` and, when browser behavior changes, `npm run test:e2e`. Keep
read-only pages server-rendered with minimal JavaScript. Preserve keyboard use,
screen-reader names, reduced motion, light/dark contrast, privacy boundaries,
and adapter separation.

By contributing, you agree that application code and examples are available
under MIT and original prose/diagrams under CC BY-SA 4.0.
