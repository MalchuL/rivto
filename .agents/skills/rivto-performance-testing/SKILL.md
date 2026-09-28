---
name: rivto-performance-testing
description: Verify Rivto features and bug fixes with focused behavioral tests and realistic performance checks. Required after every feature implementation or bug fix, before reporting completion; also read when choosing regression tests or investigating slow editor interactions.
---

# Rivto Performance and Testing

Run this workflow after the final implementation change for every feature or bug
fix. Read it early enough to capture a failing regression and performance baseline
before editing. Completing the workflow means running the applicable checks and
examining their results, not merely proposing commands.

## Choose a test that can catch the defect

- Follow the ownership and test placement rules in the repository `AGENTS.md`.
  Use the lowest layer that reproduces the behavior; use Playwright for actual
  browser input, DOM selection, layout, rendering, or interaction between layers.
- For a reported bug, confirm the regression fails on the original implementation
  for the reported reason before fixing it. A setup timeout, missing mock method,
  or compilation failure does not establish that reproduction.
- For a feature, test observable acceptance criteria and the meaningful boundary
  or failure case introduced by the change. Reuse existing test infrastructure;
  do not add frameworks or broad fixtures for a narrow behavior.
- Assert the result of the operation as well as its cost. A fast no-op must fail.
  Check only relevant consequences: hierarchy/order, content, selection/caret,
  scroll, undo/redo, clipboard/snapshots, or extension cleanup. Exercise page and
  edgeless modes when the affected behavior is shared.
- Use deterministic assertions for excess work where possible: forest reads,
  subscriber calls, visited nodes, renders, or mounted DOM nodes. Compare a small
  and a large input. Set bounds from the intended work, not today's accidental
  call count; allow fixed work performed by other installed extensions.

## Check the real performance path

For changes that affect editor runtime, run the affected interaction in the actual
demo at normal size and with `?repeat=200`. Preserve the user's route, active
extensions, block types, and virtualization settings. If the request gives no
settings, test demo defaults; do not enable virtualization just to make it pass.
Use a representative large fixture instead when the feature is unavailable on
that route, and explain which path it covers.

Exercise real keyboard or pointer input for interactive behavior. A direct
manager call helps isolate model cost but does not cover event handling, selection
restoration, subscribers, or rendering. Include optional demo chrome in diagnosis:
gutter numbers, overlays, and debug output can dominate a simple command.

Measure separately:

- Synchronous command duration, including synchronous subscribers.
- Time until the expected DOM state and selection are restored. Two animation
  frames are a useful rendering proxy, not proof that async layout has settled.
  For scrolling or deferred layout, also assert the final position/state.

Keep fixture creation and page loading outside interaction timing unless startup
is the feature. Warm the page and use a few equivalent samples for noisy timings;
restore equivalent state between samples and report the median with the range.
Compare before/after under the same browser, build, document, and settings. For
non-runtime changes, explicitly record why editor interaction timing is not
applicable and run the relevant configuration, build, or documentation checks.

If the interaction is slow or scales poorly, profile before choosing a fix.
Trace storage, public commands, subscriptions, React consumers, and the demo.
Check for per-row full-document work, repeated cache invalidation, redundant
notifications, and forced layout. Fix the shared owner and leave a regression
that detects the repeated work. Do not remove visible behavior to improve timing
unless that behavior change is authorized.

## Run checks without contaminating measurements

1. Run the new or updated focused test, then the affected existing suites. Run
   applicable type checks and lint using repository commands. Build when exports
   change or when measuring production browser performance.
2. For browser timings, run `pnpm demo:build`, then serve that build with Vite
   preview. Confirm the server really serves the current build: Playwright can
   reuse an existing server, including a development server on the same port.
   Set `PLAYWRIGHT_BASE_URL` to a dedicated preview URL when necessary.
3. Run focused Playwright files with `pnpm exec playwright test <files>
   --project=chromium --project=firefox --workers=1`. Keep performance runs serial
   and avoid concurrent builds, profilers, or another browser test run. Do not edit
   sources during a development-server test run; HMR invalidates the measurement.
4. Run behavior checks in both browsers. Apply browser-specific timing limits only
   where calibrated by the suite. Reuse the relevant scenarios in
   `e2e/performance.spec.ts`; `e2e/block-number-performance.spec.ts` demonstrates
   bounded forest-read assertions with real Tab/Shift+Tab and undo/redo.

Use existing budgets when they fit the operation. For new timing assertions,
establish a measured baseline and a justified responsiveness budget with headroom
for environment noise. Never copy a universal millisecond limit across unrelated
operations, raise a limit to hide a regression, or remove correctness assertions
to get a passing timing sample.

## Resolve failures and report evidence

Inspect every failure. Fix regressions introduced by the change. To call a failure
pre-existing, reproduce it on the unchanged baseline or cite a recorded baseline;
being outside the edited files is not proof. Keep unrelated fixes out of the diff.
If setup or environment blocks a check, state what remains unverified. Rerun only
to verify a correction or resolve a concrete uncertainty; do not retry until green.

Before reporting completion, review the final diff and rerun checks invalidated by
later edits. Summarize the checks actually run, the small/large performance result
with build/browser context (or why timing does not apply), and any remaining
failures or skipped coverage. Keep raw profiles and transient benchmark output out
of tracked source unless a persistent artifact is requested. A skill is an agent
workflow; the `AGENTS.md` requirement makes it mandatory, but does not create a CI
job or guarantee that external agents obey it.
