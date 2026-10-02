# QOL 4 rebase conflicts

Rebased `vs/qol_4` onto `origin/main` on 2026-09-30.

- Original branch head: `20a152f37029bb62c6efbec18eacfc9a4d10d529`.
- Main used for the rebase: `442024aeb39df2b997a7f6954189f1b885280cd4` (`Optimize ui (#17)`).
- Rebased branch head: `a8497083db965a2e5b55317b32117e9c7924e716`.
- Backup: `backup/qol-4-before-rebase-20260930`.
- All ten branch commits were replayed. No push was performed.

## Files with conflicts

| File | Commits that conflicted | Resolution |
| --- | --- | --- |
| `packages/react-rivto-editor/src/extensions/block-drag/pointer/target.ts` | `7e9fb6d` (root-container edges), `0ebcad0` (refactor), `ac7e7b6` (drop placement), `20a152f` (new API) | For the first three conflicts, retained main's native row/gutter hit testing and nearby-row optimization. The final commit replaced the old target adapter with the branch's canonical geometry resolver and removed its old supporting types. This final architectural conflict required the user's choice, recorded below. |
| `packages/react-rivto-editor/src/views/base-view.ts` | `5f2f2a8` (empty-list Enter) | Combined the imports: retained main's `scheduleBlockFocus` and `focusCaret`, added the branch's `isNumberedListType`, and used `indentBlocks`/`outdentBlocks`. Kept the branch's behavior: first Enter clears an empty checkbox or numbered marker; subsequent Enter lifts one allowed outline level. Retained main's guarded focus scheduling at the existing call sites. |
| `packages/react-rivto-editor/src/extensions/block-drag/provider.tsx` | `20a152f` (new API) | Kept the branch's canonical destination API, source snapshots, displayed-placement commit, and destination revalidation. Retained main's detached preview, direct preview transforms, selection guard, scrolling integration, and keyboard source-rectangle translation. Combined the conflicting keyboard movement callbacks: the branch's microtask schedules main's rectangle update and preview movement, then publishes placement after rendering. |

## User decision for the final drag conflict

The final API commit replaced main's optimized hit-testing implementation with a full-layout resolver. Keeping the old implementation unchanged would also require omitting incompatible parts of the new drop API.

The user chose: **“Keep this branch’s new drop API and resolver; retain main’s preview, scrolling, and other compatible optimizations.”**

Accordingly, the rebase retained the new API and resolver. Main's unrelated virtualization, batched model operations, preview, scrolling, and selection optimizations were retained. The untracked `dev_notes/block-drag-placement-refactor-ru.md` was left untouched.

## Problems these resolutions can cause

This section describes the rebased commit `a849708`, before the subsequent fixes. Observed failures are distinguished from possible consequences; a failed test alone does not prove the conflict resolution caused it.

### `pointer/target.ts`: main's fast path was replaced

**Confirmed consequence:** keeping the branch's new resolver removed main's native row/gutter and nearby-row shortcuts from the final rebased implementation. `resolveSurfaceDrop()` called `collectDropLayout()` for every placement update, scanning and measuring the rendered surface. Twelve 2,000-block drag tests expected zero full scans and observed 5–20 scans instead. This affects drag work in both page and edgeless modes, especially when many descendants remain mounted.

**Behavior to watch:** the replacement walks measured child layouts rather than selecting a nearest row. It changes how container backgrounds, outer edges, nesting depths, and unmounted virtualized neighbors are interpreted. Preserving main's old hit-testing code verbatim would not safely implement the branch's new destination-parent acceptance rules. Any restored shortcut must produce the same canonical destination and preserve its actual sibling neighbors.

**API impact:** the old placement-input, intent, geometry, and pointer-hit helpers were removed by the branch's API commit. Host code importing those helpers, or implementing the old drop context using target/source IDs, must adopt the destination/source-snapshot API. This API change belongs to the branch and was retained during conflict resolution.

### `views/base-view.ts`: branch Enter behavior with main's focus scheduling

**Intentional behavior change:** empty checkbox/numbered blocks keep their outline position on the first Enter while their marker is cleared. A later Enter outdents one permitted level. Main's previous implementation outdented an empty nested block until its boundary. Tests or integrations expecting the previous Enter sequence can therefore fail even when the new behavior is working as designed.

**Possible integration problem:** main's `scheduleBlockFocus` and `focusCaret` use a selection-guarded deferred callback. A newer selection cancels an older pending focus request. Rapid Enter/Tab/typing sequences must preserve the new caret selection so that typing reaches the intended block after it renders. The rebase retained this main behavior rather than restoring the branch's unconditional animation-frame focus.

**Observed limit:** history-child creation/deletion and an edgeless empty-checkbox scenario failed during validation. History deletion also failed on the original branch. The edgeless checkbox scenario failed in a focused main run, but main lacks the branch's new Enter semantics, so that run cannot establish the exact cause. These results do not prove that the import conflict resolution introduced a defect.

### `provider.tsx`: combined keyboard scheduling and displayed-destination commit

**Why the callback was combined:** main's detached preview does not use the old DOM feedback plugin to update the keyboard drag shape. Its explicit source-rectangle translation must remain. The branch adds a microtask because dnd-kit updates its position after dispatching `dragmove`. The resolution runs main's translation inside that microtask/render continuation, moves the preview, and then publishes placement after rendering.

**Possible timing problem:** publishing feedback now depends on both dnd-kit's position update and the rendering continuation. Reading the position too early would show or commit the previous keyboard step. Dropping before the pending continuation publishes could leave the last displayed destination one step behind. The initial post-rebase run passed all six keyboard drag cases across Chromium and Firefox; this is focused evidence, not proof against every rapid-input sequence.

**Possible commit rejection:** the branch commits the displayed destination and revalidates its parent and adjacent siblings instead of resolving a different gap at release. If hierarchy changes during a gesture, the displayed neighbors may become stale and the drop is rejected. This preserves agreement between feedback and commit, but can appear as a drop that does nothing. Container boundaries, cross-document sources, and virtualized neighbor selection need coverage around this invariant.

**Observed inherited failures:** several edgeless/container drops and Firefox stationary-cursor retargeting failed after rebasing and also reproduced on isolated main. They remain problems in the combined editor, but the available evidence does not attribute them to the conflict resolution.

## Evidence and scope

The initial post-rebase run had 555 editor unit tests passing, type checking/lint/workspace builds passing, and browser results of 439 passed, 104 failed, and 37 skipped. The supplied `/tmp/rivto-rebase-tests-after/comparison.json` described `vs/optimize_ui`, not a full before-rebase baseline for `vs/qol_4`.

Conflict-resolution comparison: `/tmp/rivto-qol4-rebase-tests/range-diff.txt`. Post-rebase results and focused comparisons: `/tmp/rivto-qol4-rebase-tests/comparison.json`.

Subsequent bug fixes are separate from these rebase resolutions. Their status and the marks for failures already recorded on `vs/optimize_ui` are maintained in `dev_notes/rebase-errors.json`.

## Subsequent validation (2026-10-01)

The full serial browser run after restoring ordinary-outline hit testing reported **452 passed, 91 failed, 37 skipped**. Editor unit tests remained **323 core + 232 React passed**. Type checking, lint, workspace/demo builds, docs, desktop unit tests, ESLint rule tests, and document-model packaging passed. Demo tests still had two inherited failures. Desktop build/smoke remained blocked by missing Node types/Electron.

That run exposed an empty-Bento regression in the restored shortcut, separate from the rebase itself: Bento's wrapper prevented neighboring-row discovery from including its body. Both browsers passed this test twice at exact rebased commit `a849708`, then failed twice with the shortcut. The correction detects container bodies through native pointer hits and retains the full resolver for them. The history-shortcut failure also reproduced at `a849708`; it was left unchanged.

After the correction, complete Bento and performance suites reported **79 passed, 2 failed, 35 skipped**. All Bento cases and all twelve large-drag cases passed; ordinary-outline full scans remained zero. The two failures are offscreen-paint tests already recorded on `vs/optimize_ui`. React's 232 unit tests, type checking, lint, and demo build passed again. Preview follow median was 12.0 ms; numbering at repeat=20/200 passed in the earlier full run. The full browser suite was not repeated after this final correction.

Reports: `/tmp/rivto-qol4-final-tests/browser.json`, `pre-fix-focused.json`, `focused.json`, and `container-fix.json`. Per-case baseline marks, explanations, and final checks are in `dev_notes/rebase-errors.json`.


## Intermediate design decision: fresh geometry, no shortcut or cache

After reviewing the refactor's intent, the user rejected geometry caching and requested a generic implementation. The subsequent native nearby-row shortcut and its container fallback were removed. `pointer/target.ts` now matches the rebased commit: every local, cross-document, and keyboard calculation measures the complete rendered surface and uses the same canonical resolver. No new cache, invalidation handlers, or component-specific rules were introduced.

The 2,000-block regression keeps its actual hierarchy-change assertion and existing 160 ms median feedback budget. The zero-full-scan assertion was removed because it enforces the old native-hit implementation rather than the chosen complete-layout design. Full scans remain logged for diagnosis. Earlier zero-scan results above describe the superseded shortcut, not the final implementation.

Final validation of this design: **179 passed, 10 recorded baseline failures, 35 skipped** across Bento, numbering, container boundaries, gaps, keyboard, scrolling, and performance in Chromium/Firefox. All twelve 2,000-block gap drags committed hierarchy changes and stayed within the original 160 ms feedback budget (observed medians 28.8–72.3 ms). Fresh geometry required 5–15 full scans per tested gesture; preview follow median was 10.7 ms. React's 232 tests, types, lint, and production demo build passed. Raw results: `/tmp/rivto-qol4-generic-tests/browser.json`; per-case results are recorded under `final_validation.fresh_layout` in the error list.


## Adapted optimization: bounding rectangles read on demand

The user clarified that the optimization must be adapted, not discarded. `collectDropLayout()` now preserves every rendered identity and its hierarchy while exposing fresh `row`/`rect` getters. The canonical resolver is unchanged. Unrelated descendants' bounding rectangles are not read until needed; identity collection and visibility checks still cover the rendered surface. There is no geometry cache, invalidation machinery, nearest-row selection, or component-specific fallback.

Five focused checks cover small/2,000-block subtree work, exact destination/indicator parity across vertical/horizontal/grid layouts and keyboard policy, and fresh geometry after position changes. They fail on eager measurement and pass on the adaptation. All 237 React tests, type checking, lint, and production demo build pass. All twelve 2,000-block gap drags commit hierarchy changes within the original 160 ms feedback budget. Nested page bounding-rectangle reads fell from 20,565 to 185 per gesture; edgeless cases fell from 49,329–61,662 to 762–4,590. Raw comparison: `/tmp/rivto-qol4-adapt-tests/performance-before.json` and `browser.json`.

Browser suites currently report **178 passed, 11 failed, 35 skipped**. Ten failures match the earlier full-layout baseline. The additional Chromium keyboard-ordering failure also exists before adaptation, but a controlled comparison failed once in five repetitions before and all five after. This remains under investigation; the adaptation is not reported as fully validated pending the user's scope decision. Keyboard examples and raw evidence: `keyboard-before.json`, `keyboard-after.json`. Real demo drag checks with default virtualization committed hierarchy changes at repeat=20/200 in both browsers; results are in `demo-drag.json`. All artifacts in this paragraph are under `/tmp/rivto-qol4-adapt-tests/`.


The user subsequently requested deferring keyboard-drag checks. All three browser block keyboard-drag scenarios and the keyboard status-order scenario are skipped, with TODOs to fix their behavior and document focus/Space/arrows/Escape before re-enabling. Ordinary typing, navigation, indent/outdent, and pure resolver keyboard-policy checks remain active. Focused verification confirmed **8 skipped, 0 failed** across Chromium/Firefox (`/tmp/rivto-qol4-adapt-tests/keyboard-skips.json`). The earlier affected-suite counts above predate these skips. Keyboard dragging is not fixed by this deferral; the generic measurement adaptation remains implemented.


## Follow-up: the remaining ten browser failures (2026-10-01)

These corrections are subsequent test changes, not additional rebase conflict resolutions. Investigation reproduced all ten remaining failures from the 11-case affected-suite run. Their assertions were testing stale geometry or input conditions that did not start or reach the intended drag. No component-specific editor rules or further production behavior changes were required. The generic fresh bounding-rectangle getters and canonical drop resolver remain in place.

| Test condition | Cause and correction | Browser cases |
|---|---|---:|
| Drop after the last root container | Auto-scroll moved the container after its original measurement. Compare the indicator against its current bottom, retaining the exact root-order assertion. | 1 |
| Demo Kanban–Columns gap | Painting previously skipped content changed container height during activation. Measure the gap after activation and paint, retaining the committed root-position assertion. | 2 |
| Demo TODO storage–Bento boundary | Painting and scroll anchoring moved the storage boundary after activation. Read current destination and indicator geometry, retaining the existing tolerance and root-order assertion. | 1 |
| Nested outline boundaries inside containers, page/edgeless | The target near the viewport edge moved under drag auto-scroll. Center this boundary test and measure after activation; scrolling has separate tests. Keep the expected parent assertions. | 2 |
| Stationary-pointer retargeting during scroll | Firefox did not consume the entire requested wheel delta, so the intended row never reached the pointer. Apply real wheel input until the measured row center reaches the stationary cursor. Keep feedback and commit assertions. | 2 |
| Offscreen paint drag | Cancelling pointer movement caused dnd-kit to reject drag activation. Cancel text selection with the existing selection listener, leaving pointer events available. Keep paint and drag assertions. | 2 |

The shared test helper accepts a destination callback for coordinates that must be measured after activation. A new two-browser regression checks that the final pointer event updates both feedback and the committed parent. It already passes before these test corrections; investigation did not justify changing pointer-tracking production code.

Focused validation: **16 passed, 0 failed**. Final affected browser suites, serial Chromium/Firefox: **185 passed, 0 failed, 41 skipped, 0 flaky**. All twelve 2,000-block gap drags and numbering at repeat=20/200 passed. React unit tests: **237 passed**; type checking, lint, and production demo build passed. Earlier real-demo repeat=20/200 checks remain applicable because production code did not change during this follow-up.

Of the eleven discussed failures, **ten were resolved by correcting test setup and one keyboard-drag case is resolved by skip under the user's counting rule**. Keyboard behavior still needs its TODO fix and documentation. Other failures recorded in the older full workspace run are outside this follow-up and are not declared fixed. The 41 skipped cases include pre-existing suite skips as well as the explicitly deferred keyboard cases; they are not 41 newly disabled tests.

Raw reports: `/tmp/rivto-qol4-remaining-tests/before.json`, `after-second.json`, `browser.json`, and `comparison.json`. Per-case explanations, retained `optimize/ui` baseline marks, and final validation are recorded in `dev_notes/rebase-errors.json`.
