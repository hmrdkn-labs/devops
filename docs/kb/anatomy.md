# Anatomy integration knowledge

## Server-side Solid cleanup touched browser globals

- **Status:** solved.
- **Symptom:** the real Solid SSR probe printed its output, then exited with `ReferenceError: document is not defined` in `src/lib/anatomy/motion.ts` during root disposal.
- **Cause:** Solid runs registered `onCleanup` callbacks during server disposal even though `onMount` never acquired browser resources. The cleanup unconditionally accessed `document`.
- **Solution:** return before browser cleanup when the lifecycle never mounted. Mounted client teardown still cancels the frame, disconnects the observer, and removes media/visibility listeners. Keep initial SVG server-rendered; do not switch the figure to client-only to hide the failure.
- **Evidence:** the same Node/Solid SSR probe failed before the mounted guard and exited 0 afterward. Integrated `npm run ci` then prerendered all five Anatomy routes successfully. The independent foundation reviewer traced the actual installed Solid/Astro disposal behavior.

## Native select choices disagreed with the fixture model

- **Status:** solved.
- **Symptom:** a hydrated affinity page displayed native values `any`, `none`, and `east` while its model and select attributes held `ssd`, `east-ssd-or-west`, and `west`. The resource/replica widgets had the same server-select risk.
- **Cause:** a select's HTML `value` attribute does not select its native option during SSR/hydration. The browser initially showed the first option rather than the rendered fixture's intended choice.
- **Solution:** bind `selected` on each option to the same state as the select/readout. Follow the existing learning widgets' hydration guard: expose a busy region and disable controls until handlers are mounted. Preserve the static object and explanation without JavaScript.
- **Evidence:** browser inspection showed the affinity native values matching the model after the change. Native Playwright resource-widget/reset and affinity/running-label scenarios passed on desktop, tablet, and mobile. `tests/e2e/anatomy.spec.ts` exercises value-to-model consistency and reset, not arbitrary default wording.

## Rebuilding dist beneath Wrangler left the local asset index stale

- **Status:** solved.
- **Symptom:** a local Worker first served an Anatomy route and its assets with HTTP 200; after a build replaced `dist`, Wrangler logged a reload and returned HTTP 404 for the page, CSS, scripts, and existing brand PNG. Browser tests reached the application's 404 surface, not the intended widget.
- **Cause:** the running local asset service retained a stale index after replacement of the build directory. The completed files existed, but that process no longer served them correctly.
- **Solution:** stop only the owned local Worker, complete the build, then start a fresh Wrangler process. Do not mask missing assets with retries, relaxed browser assertions, or an application fallback. The production workflow already builds before deployment.
- **Evidence:** restarting against the unchanged completed build restored the route to HTTP 200; the native browser run then passed 21 scenarios, with its remaining three failures traced to one incorrect Ready-badge selector in the new test rather than missing pages.

## Wide explanation content escaped the phone viewport

- **Status:** solved.
- **Symptom:** actual 390px browser surfaces had document widths of 720px for replica explanations, 452px for taints, and 469px for affinity. The visual report identified wide native tables and long inline API field names, not the figures.
- **Cause:** new standalone explanations did not receive the existing reference reader's table scroll regions; long inline code contributed min-content width.
- **Solution:** the shared Markdown renderer supplies opt-in, server-rendered focusable table/code regions using the established reference classes and preserved native table structure. Anatomy inline code wraps without modifying copied text. Whole-page overflow is not hidden.
- **Evidence:** post-fix native captures passed all 35 light/dark, 320/390/1440px and no-JavaScript records with no page overflow or JavaScript errors. The phone-width and real keyboard table-scroll regression passed on all three projects; the full suite passed 254 cases with 52 intentional skips.
