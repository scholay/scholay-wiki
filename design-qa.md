# Scholay Wiki component migration — design QA

## Scope and source of truth

- Target: `frontend-user/src/features/wiki/**`, especially the static product-surface fixtures in `embeds/`.
- Visual source: the sibling `scholar-product-mock/frontend-user` application and its current product pages/components.
- Product truth: current `scholar` routes, UI components, backend contracts, and migration state override stale mock copy or historical documentation.
- Fixture contract: representative static state only; no API, store, hook, write action, or interactive control is allowed inside `WikiEmbed*.tsx`.

## Capture conditions

- Desktop source and Wiki captures used the same Chrome session, viewport, device scale, and stable state: 1886 × 963 CSS px at DPR 2.
- Mobile verification used 390 × 844 CSS px at DPR 1.
- Full-page comparisons preserve Wiki navigation and document hierarchy; focused comparisons crop the source surface and the embedded Wiki surface. The focused citation comparison pads both sides to a common 1092 × 737 canvas without scaling.
- Captures live in `docs/scholay-wiki/audit/screenshots/final-design-qa/`.

## Evidence

| Comparison                          | Source                                 | Wiki                                                         | Combined                            |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| Citation generator, full viewport   | `citation-source-1440x1000.png`        | `citation-wiki-1440x1000.png`                                | `citation-comparison-2880x1000.png` |
| Citation generator, focused surface | `citation-source-focus-normalized.png` | `citation-wiki-focus-normalized.png`                         | `citation-focus-comparison.png`     |
| Traditional search, full viewport   | `search-source-1440x1000.png`          | `search-wiki-1440x1000.png`                                  | `search-comparison.png`             |
| Rhino assistant, entry and dock     | `rhino-source-menu.png`                | `rhino-wiki-entry-focus.png`                                 | `rhino-comparison.png`              |
| Mobile Wiki                         | —                                      | `wiki-peer-review-mobile.png`, `wiki-mobile-web-390x844.png` | —                                   |

## Visual findings and fixes

### Hierarchy and chrome

- Passed: the Wiki uses one persistent left document tree, one content column, and an optional on-page outline. The former redundant top navigation was removed.
- Passed: embedded examples now sit on a flat neutral canvas with one border instead of stacked shadows and nested cards.
- Passed: every fixture has a visible caption that distinguishes an interface example, sample data, or a stitched state from live product data.

### Fidelity to product surfaces

- Passed: citation-generator control order, format order, typography hierarchy, field proportions, and result treatment match the product source; the Wiki intentionally freezes the successful DOI state for explanatory value.
- Passed: traditional-search input, source selector, filter action, search action, and filter panel retain the source hierarchy while omitting network-backed behavior.
- Passed: dynamic or configurable values—prices, quotas, providers, invitation rewards, journal indicators, payments, and admin metrics—are labelled as examples or replaced by current contract language.
- Passed: impossible states found during audit were corrected, including membership grants, staging areas, review workflow steps, session counts, mobile search mode, invitation routes, gift-code batches, order/refund states, and billing configuration.
- Passed: the final surface audit added the real mock PNG mascot and representative Rhino assistant entry/dock/help/notification/feedback states, both invitation-code entry points, and the shared folder icon/color picker. The Rhino assistant remains distinct from the product's existing Claw brand icon.

### Responsive behavior

- Passed: 390 px verification has `documentElement.scrollWidth === innerWidth`; no horizontal page overflow.
- Passed: the mobile navigation drawer opens and exposes the document tree.
- Passed: narrow review and product fixtures preserve readable padding, wrap metadata, and keep the example caption visible.
- Passed: dedicated mobile representative surfaces now cover Claw, tools, account, two-level library navigation, journal feed, authentication page/sheet, feed, search, and academic intelligence.

### Interaction and console checks

- Passed: Wiki search submits and routes to `/wiki/all?q=…`; results render.
- Passed: desktop category expansion and the mobile navigation drawer open normally.
- Passed: production build completes.
- Non-blocking environment warning: React Router reports the existing missing `HydrateFallback` warning in development. Additional Apollo warnings originate from the installed Chrome extension URL, not the Wiki application.

## Automated verification

- Wiki content and migration contract: 23/23 passed.
- Design system guard: 119/119 passed.
- TypeScript: passed.
- Prettier and ESLint for Wiki sources/tests: passed.
- `git diff --check`: passed.
- Production build: passed (only the repository's existing large-chunk advisory remains).

## Final result

**passed**

No unresolved P0 or P1 design mismatch remains in the reviewed Wiki migration scope. The final registry contains 210 unique fixture IDs and 254 article references; every fixture is registered and mounted at least once. The product-mock coverage ledger audits 241 groups: all 227 stable visible surfaces are covered, while 14 internal atoms, redirects, dead-code hosts, or runtime-only coordinators are explicitly excluded with reasons. Conceptual, policy, architecture, history, and compatibility articles intentionally do not invent product screenshots when no stable visible product surface exists.
