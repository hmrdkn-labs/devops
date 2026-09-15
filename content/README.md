# Canonical learning content

This directory is the framework-independent source of truth for DevOps by
hmrdkn-labs. Every learning unit is a standalone GFM document with YAML
sidecars. No Astro component, MDX syntax, learner state, or private source
material belongs here.

The prose and diagrams in this directory are licensed under CC BY-SA 4.0.
Example code is licensed under MIT. Source links are references, not copied
course content.

Run `npm run content:check` before proposing a change. IDs are immutable.
Increment `revision` and classify the change as `editorial`, `enrichment`,
or `mastery_affecting`.

## Interactive lessons

Portable lesson sequences live in `content/lessons/*.yaml`. A lesson names its
source units and certification, then defines renderer-independent exercises.
The v1 exercise kinds are `choose`, `arrange`, `connect`, `command_builder`,
`terminal_inspect`, `manifest_fill`, `trace`, `predict_state`, `spot_bug`, and
`explain`. Exercise data may contain prompts, answer contracts, feedback,
hints, text diagrams, and a learn-first variant; it must not contain HTML,
framework components, CSS classes, or screen coordinates.

For KCNA lessons, every exercise carries two portable visual walkthroughs:
`learn_first.visual` for assisted concept teaching and `feedback.visual` for the
post-attempt causal model. Each array item is one ordered presentation frame. Use
`→`, `↓`, `←`, or `↔` inside a frame when a relationship should be rendered as a
flow. The player supplies animation, step/replay controls, and reduced-motion
behavior; the YAML stays plain text that another client can render independently.

Every exercise owns immutable IDs, references objectives from its declared
source unit, and declares an evidence intent. Runtime evidence remains stricter
than that intent:

- opening, answering incorrectly, using a hint, or choosing Learn first records
  encounter evidence only;
- an unassisted correct interaction may record recall or application evidence
  at the lesson-interaction score;
- completing an exercise is stored independently from understanding;
- lesson interactions never create retention evidence or schedule FSRS cards;
- free responses are private, and guest sessions stay in memory only.

`npm run content:check` validates lesson IDs, source-unit and objective edges,
certification mappings, and each exercise's answer structure. A mastery-affecting
objective change still follows the normal revision and revalidation contract.
