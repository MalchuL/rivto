# Shared editor interactions

## Agreed boundary

The shared implementations serve Page and Edgeless through host adapters. There
is no separate embedding package: the user chose core for reference lookup and
Page for view acquisition lifecycle. The React editor reuses those implementations.

| Owner                                   | Implementation                                                                               | Borrowed host capability                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `rivto-editor-core/references`          | `BlockReferenceResolver`, qualified reference contracts, abort-aware waiting                 | Addressed block presence/subscriptions, loaded documents/editors, optional metadata lookup |
| `rivto-page/editor/embedding`           | `EmbeddedEditorAcquisition`                                                                  | Acquire a source editor and release this consumer's lease                                  |
| `rivto-page/editor`                     | `DropSurfaceRegistry`, pointer ownership, vertical autoscroll                                | Existing DOM roots, live content boundary, receiving controller                            |
| `rivto-page/presentation/drag-and-drop` | `DragHandle`                                                                                 | Sensor ref, click suppression, navigation, menu callback, artwork and styles               |
| React host                              | Storage/model creation, embedding schema/settings/view composition, transfer commands, menus | The shared implementations above                                                           |

## Ownership review

- Storage creates and destroys its reference resolver. Lookup borrows addressed
  reads; it never opens documents or owns their models. Existing preferred-source,
  ambiguity, relocation and retained-history behavior remains in the shared class.
- The acquisition hook creates a lifecycle object in its effect, starts it after
  commit and destroys it on cleanup. The controller owns cancellation and releases
  a late acquisition once. The provider retains ownership of shared editors.
- Page and legacy Edgeless install their receiving controller into one host-owned
  registry. The registry owns only registration identity and the DOM marker.
  Gesture cancellation, detach notification and feedback remain with the receiver.
- Page's occurrence creates one pointer owner. Selection and DnD borrow only its
  acquisition capability. Each gesture owns an independent autoscroll session.
- The universal host handle supplies model-specific actions to the shared button.
  Native button activation, context-menu input and drag-click suppression stay in
  that reusable component. Host CSS continues to own block placement and theme.

## Deliberately retained boundaries

Outline geometry and `BlockDragExtension` remain in Page, where they use Page's
input, selection and block contracts. Edgeless retains its existing pointer engine.
Cross-document validation and mutation remain host/core commands; routing is not
permission. Transfers between distinct documents still have independent histories,
not a new atomic transaction across documents. Embedding schemas, loading policy,
cycle-aware view composition and actual editor rendering remain in the host.

This extraction does not close the earlier PageSurface migration acceptance goal.
Its known Kanban lane-body insertion regression remains separate.

## Verification before package consolidation

- Unit suites: core **130**, Page **170**, shared drag **7**, React host **598**
  passing tests. Final storage/reference follow-up: **25/25**.
- Core, Page, shared drag and React host builds/type checks passed; production
  demo build passed. The shared drag ESM entry also imports without a browser or
  React runtime. Focused lint has no errors (five function-length warnings).
- Chromium + Firefox behavior, `workers=12`: **64 passed, 2 failed**, both before
  (immutable production preview 5450) and after (5451). Both failures were repeated
  with `workers=1` on each build: the handle-menu color test expects an 8px shell
  radius. The expectation was retained. Handle tests now use both Page/legacy row
  and slot selectors so they reach the actual assertion instead of timing out.
- Covered interactions include universal handle actions, cross-document Page and
  Edgeless transfers/independent undo, empty receivers, conflicts, embedding load
  errors, refresh, pending lookup cancellation and source editing.
- Performance used production builds, Chromium/Firefox, serial real pointer/click
  input and no tracing. Cross-document fixtures use the existing two-editor route
  with 0/200 extra unrelated roots per pane; embedding acquisition uses the real
  embedding route with 0/200 extra unrelated roots. The handle test uses the normal
  demo and `repeat=200`. No virtualization was enabled to improve results.
- Cross-document samples assert preserved content, exactly one history batch per
  document, and undo. Acquisition samples assert rendered content and release of
  the previous source. Handle samples assert the committed collapse state.

Times below are milliseconds, **median [minimum, maximum]**, before → after.
Cross-document command time sums the two documents' synchronous history batches;
frame time is the pointer-up two-animation-frame proxy. Acquisition UI time includes
observing the loaded DOM through Playwright and then two frames, not just loading.
Handle UI time is the click-to-two-frame proxy. Cold acquisition setup is outside
measurement; the source editor itself is acquired by the measured Save click.
The first sample is discarded for transfer/acquisition; handle measurements retain
four alternating collapse/expand samples after two warm-up interactions.

| Interaction            | Browser  | Extra roots | Command before → after          | UI/frame before → after                 |
| ---------------------- | -------- | ----------: | ------------------------------- | --------------------------------------- |
| Page transfer          | chromium |           0 | 0.7 [0.6, 0.8] → 0.9 [0.6, 0.9] | 32.2 [32.2, 32.2] → 32.0 [32.0, 32.0]   |
| Page transfer          | chromium |         200 | 2.8 [2.8, 3.0] → 3.2 [3.1, 3.2] | 31.0 [30.9, 31.1] → 30.7 [30.3, 30.9]   |
| Page transfer          | firefox  |           0 | 2.0 [1.0, 2.0] → 1.0 [1.0, 2.0] | 32.0 [31.0, 32.0] → 32.0 [32.0, 33.0]   |
| Page transfer          | firefox  |         200 | 4.0 [4.0, 5.0] → 4.0 [3.0, 4.0] | 31.0 [31.0, 32.0] → 31.0 [31.0, 32.0]   |
| Edgeless transfer      | chromium |           0 | 0.6 [0.6, 0.7] → 0.5 [0.5, 0.6] | 32.5 [32.2, 32.6] → 32.3 [32.2, 32.5]   |
| Edgeless transfer      | chromium |         200 | 1.9 [1.8, 2.5] → 1.9 [1.8, 2.6] | 31.3 [31.2, 31.8] → 31.5 [31.5, 31.7]   |
| Edgeless transfer      | firefox  |           0 | 1.0 [1.0, 1.0] → 1.0 [1.0, 2.0] | 31.0 [31.0, 32.0] → 32.0 [31.0, 32.0]   |
| Edgeless transfer      | firefox  |         200 | 4.0 [4.0, 5.0] → 4.0 [3.0, 5.0] | 31.0 [30.0, 33.0] → 31.0 [30.0, 33.0]   |
| Embedding acquisition  | chromium |           0 | 0.6 [0.5, 0.7] → 0.4 [0.4, 0.7] | 62.9 [62.9, 63.2] → 63.1 [63.1, 63.3]   |
| Embedding acquisition  | chromium |         200 | 0.6 [0.5, 0.6] → 0.5 [0.5, 0.6] | 43.1 [42.8, 43.7] → 43.0 [42.7, 59.2]   |
| Embedding acquisition  | firefox  |           0 | 1.0 [1.0, 1.0] → 1.0 [1.0, 1.0] | 46.0 [44.0, 46.0] → 46.0 [45.0, 47.0]   |
| Embedding acquisition  | firefox  |         200 | 1.0 [1.0, 2.0] → 1.0 [1.0, 1.0] | 61.0 [59.0, 61.0] → 61.0 [60.0, 62.0]   |
| Handle collapse/expand | chromium |           0 | 1.0 [0.7, 1.1] → 1.0 [0.8, 1.4] | 28.6 [27.2, 29.0] → 28.5 [27.9, 28.5]   |
| Handle collapse/expand | chromium |         200 | 1.2 [1.0, 1.4] → 1.2 [1.0, 1.5] | 80.4 [56.9, 106.2] → 81.7 [58.2, 103.3] |
| Handle collapse/expand | firefox  |           0 | 2.0 [1.0, 2.0] → 1.0 [1.0, 2.0] | 26.5 [13.0, 28.0] → 19.5 [11.0, 28.0]   |
| Handle collapse/expand | firefox  |         200 | 2.0 [2.0, 2.0] → 1.5 [1.0, 2.0] | 35.5 [27.0, 45.0] → 34.5 [29.0, 47.0]   |

No speedup is claimed. Page transfer command samples at 200 extra roots increased
by about 0.4 ms in Chromium while the frame proxy remained comparable. Large-document
handle expand/collapse remains uneven; the extraction does not remove root-wide
rendering costs or resolve the earlier Kanban lane-body insertion defect.

Logs: `/tmp/extract-{core,host,drag,page}-*.log`,
`/tmp/extract-behavior-{before,after}{,-serial}.log`,
`/tmp/extract-cross-{page,edgeless}-{before,after}.log`,
`/tmp/extract-acquisition-{before,after}.log`, and
`/tmp/extract-handle-perf-{before,after}.log`.

The full workspace E2E suite and the earlier migration's cold-root performance
acceptance were not rerun. These results validate the extraction's affected paths,
not completion of the full PageSurface replacement goal.

## Consolidation into Page

The separate drag package has been removed at the user's request. Receiver routing,
vertical autoscroll, pointer ownership, and the shared handle now live in Page and
are exported from `@chulane/rivto-page`. Host Page/Edgeless consumers reuse those
exports. Page's own consumers use direct internal imports rather than importing
its public entry point. The moved implementations and their tests are unchanged.

Package dependencies, lockfile entries, workspace script filters, CI and Jest
mappings for the deleted package have been removed. All seven former drag tests
now run in the Page suite. The previous extraction measurements above are historical;
this consolidation does not change the algorithms or claim a speed improvement.

Consolidation checks: Page **177/177**, focused host **54/54**, and Chromium/Firefox
behavior **38/38** (`workers=12`). The known handle border-radius case was excluded
from this focused run; its prior baseline failure remains recorded above. Page and
React host builds, production demo build, and both package type checks passed.
Focused lint: zero errors, three existing function-length warnings. No workspace
package/dependency/CI/Jest reference to the removed package remains.

Production transfer measurements compared immutable previews 5451 → 5452, serially
without tracing, in both browsers and at 0/200 extra roots per pane. Native pointer
input, preserved content, per-document history batches, and undo were asserted.
Values are median [min, max] milliseconds; no speedup is claimed.

| Surface  | Browser  | Extra roots | Command before → after           | Pointer-up two frames before → after  |
| -------- | -------- | ----------: | -------------------------------- | ------------------------------------- |
| page     | chromium |           0 | 0.8 [0.7, 1.1] → 0.7 [0.7, 0.7]  | 32.1 [31.9, 32.4] → 32.1 [32.0, 32.2] |
| page     | chromium |         200 | 3.2 [3.0, 3.3] → 3.0 [2.9, 3.2]  | 30.2 [27.9, 30.7] → 29.7 [29.5, 30.7] |
| page     | firefox  |           0 | 1.0 [1.0, 2.0] → 2.0 [1.0, 2.0]  | 33.0 [32.0, 33.0] → 31.0 [31.0, 31.0] |
| page     | firefox  |         200 | 4.0 [4.0, 5.0] → 4.0 [4.0, 5.0]  | 32.0 [31.0, 32.0] → 32.0 [30.0, 32.0] |
| edgeless | chromium |           0 | 0.7 [0.6, 0.7] → 0.7 [0.5, 1.0]  | 32.1 [32.0, 32.1] → 32.2 [32.1, 32.3] |
| edgeless | chromium |         200 | 2.4 [2.0, 2.8] → 2.0 [2.0, 2.7]  | 31.1 [30.8, 32.2] → 32.9 [31.1, 35.0] |
| edgeless | firefox  |           0 | 1.0 [1.0, 1.0] → 1.0 [0.0, 2.0]  | 32.0 [31.0, 32.0] → 31.0 [31.0, 32.0] |
| edgeless | firefox  |         200 | 4.0 [4.0, 10.0] → 4.0 [4.0, 5.0] | 31.0 [29.0, 36.0] → 31.0 [30.0, 36.0] |

The full workspace E2E suite and earlier Kanban defect were not part of this relocation.

## Receiving lifecycle and routing consolidation

`BlockDropReceiver` now owns receiver registration, feedback cleanup, detach
subscriptions and aggregate cleanup errors. `BlockDragRouter` owns native-hit
routing between local, nested and foreign surfaces. Both live in `rivto-page`.
The React `PageDragOccurrence` retains only host acceptance and the legacy
Edgeless placement bridge; `PageBlockDrag` retains model reads, previews,
permissions, cross-document transfer and selection publication.

Ownership review: the host occurrence creates/destroys one receiver. The host drag
adapter creates one router per attachment and drops it on detach; stale disposers
cannot clear a replacement router. The receiver borrows registration only, the
router borrows resolution only, and its foreign callback receives the existing
host adapter through a narrow resolver interface. No separate manager aliases,
transport facade, new registry singleton or document-model imports were added to
Page. Edgeless retains its pointer engine and uses the existing shared registry.

The initial browser baseline found four stale direct-child selectors in the
pointer-move undo assertion after the stable-tree change. All four failed both
parallel and serial runs after the model-order assertion had passed. The assertion
now locates the stable root rows and still verifies the first restored root.

Routing consolidation validation: Page **180/180**, focused host **11/11**, Page
and host builds/types, production demo build, formatting and focused lint pass
(one existing long-method warning). Corrected focused browser baseline **14/14**;
expanded final run **18 passed / 2 failed**. The two failures are the deepest
ancestor drop indicator (depth 2), reproduced on the unchanged 5456 build in
Chromium and Firefox, including serial retry. The same cases fail serially on the
new build; depths 0/1 pass after fixing their stale undo selectors. This refactor
does not change outline geometry and leaves that existing defect unresolved.

Serial production cross-document pointer measurements, preview 5456 → 5458,
no tracing, 0/200 additional real roots per pane, one warm-up plus three samples.
The benchmark asserts transfer content, source removal, destination insertion,
and per-document undo. Command values include synchronous history subscribers;
frame values are event-to-two-frame proxies. No speedup is claimed.

| Browser  | Extra roots | Command before → after (median [range] ms) | Pointer-up frames before → after (median [range] ms) |
| -------- | ----------: | ------------------------------------------ | ---------------------------------------------------- |
| Chromium |           0 | 0.8 [0.7–0.9] → 0.7 [0.6–0.8]              | 32.2 [32.1–32.5] → 32.1 [32.0–32.2]                  |
| Chromium |         200 | 3.5 [3.0–3.9] → 3.1 [3.0–3.3]              | 28.0 [27.8–30.5] → 28.7 [27.9–29.1]                  |
| Firefox  |           0 | 2 [1–2] → 1 [1–2]                          | 31 [31–32] → 31 [30–32]                              |
| Firefox  |         200 | 7 [5–11] → 6 [5–9]                         | 31 [31–31] → 31 [30–31]                              |

Pointer-down frame medians before → after: Chromium 32.2 → 32.1 ms (small),
31.4 → 31.8 ms (large); Firefox 31 → 32 ms (small), 28 → 28 ms (large).
Pointer-move frame medians: Chromium 16.9 → 16.9 ms and 17.3 → 17.4 ms;
Firefox 17 → 17 ms at both sizes. These cross-document measurements use the
multi-editor route because it supplies independent source and destination models.
The full workspace browser suite and a separate Edgeless performance run were not
repeated; Edgeless-to-embedded-Page behavior is covered by the focused browser cases.
