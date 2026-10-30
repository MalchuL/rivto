# Edgeless block content migration

Scope: replace the legacy recursive block tree and block DnD in Edgeless cards
with rivto-page; remove replaced implementations, exports, CSS and obsolete tests.
Keep canvas transforms, tools, element selection, document commands and transport.

Ownership review: one ReactPanel already owns one Page controller and one canonical
selection across all canvas cards. Retain that controller rather than creating a
selection boundary per card. A reusable Page scope attaches to the untransformed
canvas viewport. Cards render addressed Page nodes under that scope, while their
shells retain world geometry. Feedback remains in viewport coordinates. Root gaps
must stay inside the native-hit card; empty canvas must not imply a root insertion.

Implementation order: capture production baseline; expose the existing Page root
scope and addressed forest rendering for the second real consumer; connect live
mode-aware registrations, selection and DnD; remove legacy renderer/provider and
its now-unused geometry and bridge paths. Preserve host permissions and transport.
Review every deleted module's imports and public exports before removal.

Verification: package unit suites and types/build/lint; Page parity regression;
Edgeless editing, text/block versus element selection, card transforms, zoomed
block gaps, containers, embedding and cross-document moves with undo. Behavioral
Chromium/Firefox runs use 12 workers, failures rerun serially. Production timing
uses one worker, no tracing, normal and repeat=200 with actual pointer input and
validated outcomes. Review lifecycle/API ownership separately after final edits.

## Implemented ownership

- `ReactPanel` creates one Page controller, selection adapter, navigation adapter,
  and registration synchronizer. Its aggregated teardown destroys those owners.
  `BlockEditorScope` borrows attachment and supplies context; it does not create
  controllers during render or destroy the panel-owned controller on unmount.
- Page attaches to the untransformed Edgeless viewport. Each canvas card supplies
  a `data-block-root-list` containing addressed `BlockNode` views. Empty canvas
  is not a document root destination. Canvas retains frames, pan/zoom, transforms,
  tools, element selection, and card visibility/auto-height.
- Page owns block selection, native selection projection, handles, pointer drag
  sessions, feedback, and drop geometry. Host adapters retain hierarchy commands,
  permission checks, cross-document transport and history. Pointer selection
  yields to canvas pan/background gestures. Structural block updates preserve
  active canvas element selection.
- Live renderer/layout/slot/wrapper registrations are synchronized by the panel;
  mode switches rebuild mode-dependent slots. Consumers borrow registration-only
  or addressed-model interfaces. Removing the drag extension cancels its gesture,
  releases receiving registrations/listeners, and leaves the controller owned by
  the panel. Nested embeddings keep distinct controllers and native event scopes.
- Drop depth reads current canvas zoom, including embedded writing pages inside
  a card. Nested native selection hits project to the enclosing host block when
  the outer occurrence owns the gesture. Container bottom rims preserve the
  ordinary outline's interior outdent gutter.

## Removed and retained code

Removed the host recursive `BlockTree`/`BlockView`, their styles/ref providers,
legacy block-selection implementations, block drag provider/controller/sensor/
placement/preview paths, and their obsolete exports and metadata API. Removed
unused direct collision/DOM-DnD and virtual-list dependencies. Shared receiving
occurrence contracts remain in the host transport bridge; they are used by Page.
The unrelated TODO status sorter still uses its existing DnD dependency.

Bento/Table placements, TODO storage layout, collapse, controls, embedding and
container bodies now use Page slots and children. Empty TODO drop fields use
normal flow instead of absolute positioning and a compensating minimum height.
Universal handles retain their 16px icon and use a 24px hit width matching Page's
indent, avoiding parent/child hit-area overlap. Markdown and selection theme styles
previously supplied by the deleted renderer now live with their actual owners.
Demo threading and gutter labels consume the new row/slot structure.

The API review traced controller creation, attachment, mode changes, extension
removal, and panel destruction separately from tests. There is no new selection
store, per-card controller, legacy renderer fallback, or parallel block-DnD owner.

Expanded container verification also caught two boundary issues: the modal's
zero CSS translation created a containing block for fixed feedback, and registered
list-end strips painted their line inside tile padding. The modal now has no
translation; Page resolves first/last feedback from the matching placement edge.
Four unit cases cover both axes and both ends, including the absence of redundant
region measurements. Views now borrow `BlockEditorViewApi` (rendering API plus
attachment), excluding controller destruction; hooks retain `BlockEditorApi`.

## Final validation

Production preview: immutable build 19 at port 5479; unchanged baseline at port
5462 (`/tmp/rivto-drop-parity4`). Workspace build (including docs), workspace type
checks, final Page/host package builds, demo type check, and lint passed. Lint reports
502 warnings and zero errors; it is not warning-free. `git diff --check` passed. No commit or
index-wide staging was performed in the mixed worktree.

- Page: 189 tests / 25 suites; React host: 564 / 90; core/model/CRDT/keyboard:
  372 tests. Total: 1,125 unit tests.
- Final behavioral run: 586 Chromium/Firefox cases, workers=12: 581 passed,
  three failed, two skipped. The two Bento pointer failures were an old assertion
  centering the line on its padded hit strip; both reproduced with workers=1.
  The corrected whole container-pointer file then passed all 14 cases with
  workers=12, retaining hierarchy and undo checks.
- The third failure was Firefox's repeat=200 initial `.page-surface` mount
  exceeding the test's 10s setup timeout under parallel load. The unchanged test
  passed with workers=1, as did its Chromium counterpart. No timeout was raised.
  Thus all 584 active scenarios passed after focused reruns; this is not a claim
  that the full parallel run was green. Two already-skipped TODO status keyboard
  sorter cases remain skipped; they are unrelated to removed block keyboard DnD.
- Four additional gutter-number performance checks passed serially in both
  browsers at repeat=0/200: bounded outline reads, selection, indent/outdent,
  undo/redo. WebRTC and BroadcastChannel cases ran with a local signaling server.
- Earlier migration failures were retried serially before correction. The original
  164-case Edgeless/cross-document baseline was 150 passed / 14 failed; the same
  14 failed serially. The final report above does not attribute new failures to
  that baseline merely because they occurred in old test files.

This was focused migration coverage, not every workspace E2E file.

## Production performance

Runs used real handle input, no tracing, one browser at a time, and no concurrent
builds or tests. Gap measurements use the default journal at repeat=0/200 with a
three-paragraph card added in front; the rest of the document and default
virtualization remain intact. Each sample checks canonical order, one move
command, and undo. Four gestures per browser/size include a separately recorded
cold gesture, followed by three measured samples. A second batch reversed the
baseline/current order to check the Firefox variation.

Values below are milliseconds, median [minimum–maximum], from the first batch.
Command duration includes synchronous subscribers. Two RAFs after pointer release
are a rendering proxy, not proof that all deferred layout has settled.

| Browser / repeat | Baseline command | Current command | Baseline release → 2 RAF | Current release → 2 RAF |
| ---------------- | ---------------- | --------------- | ------------------------ | ----------------------- |
| chromium / 0     | 1.1 [0.9–1.3]    | 1.7 [1.5–1.7]   | 31.3 [30.4–31.9]         | 30.3 [30.2–30.7]        |
| chromium / 200   | 4.2 [3.9–4.9]    | 4.5 [4.4–4.7]   | 51.2 [48–58.7]           | 33.1 [32–36.1]          |
| firefox / 0      | 1 [1–2]          | 2 [1–2]         | 30 [30–31]               | 32 [31–32]              |
| firefox / 200    | 8 [7–8]          | 11 [8–15]       | 64 [63–78]               | 75 [62–77]              |

Current pointerdown synchronous medians were 0.3–1ms; movement medians were
0–0.5ms. Pointerup medians were 2–13ms including dispatch and commit. Recorded
forest snapshot API calls were zero in these gestures; that does **not** establish
constant complexity: live root sibling checks still enumerate/filter O(R) IDs,
and semantic/collision checks may read large source subtrees.

In the reverse-order batch, repeat=200 command/render medians were Chromium
4.4/35.7ms current versus 3.9/46.1ms baseline, Firefox 9/64ms versus 8/77ms.
Chromium rendering improved consistently; Firefox rendering ranges overlap.
The new path retains modest additional synchronous CPU cost; there is no claim
of universal speedup.

Cold costs were retained, not removed from the report: first large root-move
commands were Chromium 3.6ms current / 3.3ms baseline and Firefox 12ms / 11ms.
Their release-to-two-frame times were 43.8/51.8ms and 80/79ms respectively.
Initial large journal mount was 3.165s current / 3.071s baseline in Chromium and
6.815s / 6.780s in Firefox. Large mode switches were 842/800ms and 1164/1093ms.
The parallel Firefox setup limit therefore remains a real validation limitation.

Cross-document measurements use the actual two-editor demo in Edgeless with
0/200 extra unrelated roots per document (that route has no default journal
repeat fixture). Every sample verifies source removal, receiver parent/custom
properties, one history batch in each document, and both undos. Current summed
transaction medians were Chromium 0.8/2.6ms and Firefox 1/5ms; baselines were
0.6/2ms and 1/4ms. Release-to-two-frame medians stayed about 30–34ms in both builds.
Raw transient logs/profiles remain under `/tmp/edgeless-*`, outside tracked source.

## Middle-mouse pan follow-up (2026-10-23)

The reported gesture was middle-mouse canvas panning, not block dragging.
Production profiling found that every camera update rerendered the host
`EdgelessCards` collection: 64 movements caused 64 root-list reads, plus repeated
range resolution and card comparisons. The collection now uses React memoization,
matching the existing independent CanvasItems pattern. Its own visibility,
document root-order and element subscriptions remain active. Controller ownership,
attachment and teardown are unchanged; no public API or new cache was introduced.

The focused real-pointer regression keeps visible membership unchanged and verifies
camera displacement, zoom, pan release and card identity. Before the change it
failed in Chromium and Firefox at repeat=0/200 with four root-list reads for four
movements; afterward all four cases require and observe zero reads. The first
parallel baseline run exposed an incorrect test coordinate (hover includes the
viewport border); explicit mouse coordinates fixed the fixture, then serial
baseline runs established the actual redundant-read failure.

Production previews: before port 5479, after port 5480. The four focused browser
files (edgeless-pan, edgeless-wheel, edgeless-state-lifecycle and edgeless) passed
150/150 checks with workers=12 in Chromium and Firefox. Host and demo typechecks,
production Vite build and focused lint passed (two length warnings, no errors).
No full-workspace rerun was needed for this local React render isolation.

Serial real-pointer measurements used the default journal, unchanged virtualization,
four middle-button gestures with 16 movements each, and separate first-press timing.
Median movement-to-two-RAF time was unchanged: Chromium 18.4 ms at both sizes;
Firefox 19 ms normally and 20 ms at repeat=200. Synchronous movement handlers were
0–0.2 ms at median. First-press handler / two-RAF timings in milliseconds:

| Browser / repeat | Before     | After      |
| ---------------- | ---------- | ---------- |
| Chromium / 0     | 2.5 / 27.5 | 1.7 / 26.2 |
| Chromium / 200   | 1.5 / 32.3 | 1.8 / 30.8 |
| Firefox / 0      | 0 / 30     | 0 / 32     |
| Firefox / 200    | 1 / 39     | 0 / 37     |

These results establish removal of unnecessary document work, not a demonstrated
frame-rate improvement or reproduction of a severe pan-start stall. Two RAFs are
a rendering proxy, and Firefox handler measurements have coarse resolution.
Mounting newly visible cards still requires rendering and range resolution.
The user's exact hardware/browser pause remains unconfirmed by these headless runs.
Raw benchmark and profile artifacts are in /tmp/pan-*.

## Actual startup freeze: high-rate middle-mouse input (2026-10-23)

The user confirmed a pause on every new middle-button pan in Chrome at localhost:5173.
The preceding render memoization did not address it. A temporary local recorder
captured the user's existing development tab (2494×1284 viewport, 61 mounted blocks).
Three real gestures showed maximum frame gaps of 200.2, 250.3 and 233.5 ms.
Long-animation-frame records contained many consecutive pointermove handlers,
typically 5–9 ms each, while rendering waited. The mouse delivered hundreds of
samples per second; Playwright's earlier frame-paced movement did not reproduce
that input rate. The relevant problem was repeated camera publication starving
painting, not a single long document command.

CanvasInputController now retains the latest client coordinates and publishes
pan camera state at most once per animation frame. The pointer handler no longer
reads viewport layout for every pan sample. Pointerup cancels the pending frame
and publishes its final coordinates synchronously. Pointer cancellation, Escape,
window blur and input disconnection discard queued movement and cancel the frame;
unrelated pointer IDs cannot end the gesture. Marquee and wheel behavior are unchanged.

The same user reported smoother panning. Five post-fix captures had maximum frame
gaps of 16.7–16.8 ms and no long-animation-frame records. The longest lasted three
seconds and contained 1190 input/lifecycle events. These are before/after observations
of the actual user session, not identical scripted trajectories. The temporary
recorder, source import and local receiver were removed afterward.

Verification after implementation:

- The new deterministic regression failed before the fix: 100 pan samples
  published the camera 100 times before a frame. It now publishes once using the
  last sample, flushes the exact release position and leaves no pending timer.
- All 37 Edgeless package tests passed, including cancellation, blur, Escape,
  disconnection and unrelated-contact checks.
- All 150 focused Chromium/Firefox browser tests passed with workers=12.
- Edgeless package build/typecheck, demo production build/typecheck, focused lint
  and diff whitespace checks passed.
- Ownership review: the existing CanvasInputController owns and cancels its one
  pending RAF; it still borrows the narrow scene and event registration contracts.
  No new public API, manager, dependency or persistent document write was added.

Serial high-rate real-pointer production comparisons used ports 5480 (before)
and 5481 (after), default journal settings, normal and repeat=200, two 300-sample
gestures at a requested 4 ms cadence. Native browsers may coalesce those samples;
the final camera endpoint was asserted in every case.

| Browser / repeat | Median movement to two RAFs before → after | Maximum frame gap before → after |
| ---------------- | ------------------------------------------ | -------------------------------- |
| Chromium / 0     | 22.7 → 21.2 ms                             | 16.8 → 16.8 ms                   |
| Chromium / 200   | 22.0 → 20.1 ms                             | 33.4 → 33.4 ms                   |
| Firefox / 0      | 19.0 → 17.0 ms                             | 33.2 → 34.2 ms                   |
| Firefox / 200    | 27.0 → 23.0 ms                             | 66.3 → 67.3 ms                   |

Production/headless measurements do not reproduce the user's development-tab
starvation at the same magnitude. Large-document mounting/layout and Firefox
outliers remain; this fix does not promise every frame meets 16.7 ms. The full
workspace suite was not rerun for this focused input scheduling change.
