# Rivto Root migration implementation prompt

Continue implementing the full plan in `dev_notes/rivto-root-migration.md`. The goal is a readable editor architecture where React supplies the `HTMLElement` at the mounting boundary, each mounted occurrence owns a Root, and ordinary consumers receive only the capabilities they need.

First inspect the current worktree and plan. Identify what is complete, what remains, and any unfinished changes. Preserve unrelated work. Restore the workspace to a type-checking state by completing the interrupted extension API change or replacing it with a better design.

Then group the remaining work into coherent milestones. For each milestone:

1. Trace ownership, dependencies, callers, and cleanup across the affected path.
2. Make the related changes together, including removing superseded code and updating necessary consumers.
3. Put new or moved tests in `__tests__`. Preserve existing test behavior; if an API change requires editing a test, explain it in `dev_notes/rivto-root-breaking-changes.md`.
4. Run focused tests and type checks. Test lifecycle and browser behavior where relevant.

After the milestones are implemented, perform the full acceptance audit from the plan: review public APIs and ownership separately from tests; run the required suites, build, types, lint, and relevant Chromium and Firefox scenarios. Compare performance before and after on representative normal and large documents. Investigate regressions rather than assuming the migration is faster.

Keep progress updates concise. Do not stop after each small change or ask for confirmation on routine implementation decisions. Keep working until the full plan is complete, or clearly report a real blocker. Report any incomplete validation, failures, API breaks, and remaining risks honestly.
