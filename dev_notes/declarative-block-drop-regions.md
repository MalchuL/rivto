# Declarative block drop regions

## Agreed model

Drop geometry is data attached to existing elements. No declaration creates layout
space. Keep pointer gestures, occurrence routing, host acceptance, canonical
mutation and undo with their existing owners. Do not introduce a DnD framework.

- `edge`: logical side, optional local CSS-pixel thickness, canonical destination.
  Default thickness is 8px through `--rivto-drop-target-size`. Ordinary block
  content declares inside insertion; edges retain priority. Outline terminal depth
  uses declared ancestor/destination bands.
- `gap`: actual free space between ordered mounted anchors. The nearest anchor
  supplies its canonical boundary, preserving hidden model neighbors. Disabling
  gaps disables their insertion action, independently of edges and background.
- `inside`: existing bounds or unoccupied background with an explicit destination.
  Background excludes child content, explicit exclusions and nested editor occurrences.

Restore ordinary layout spacing independently from geometry: child/root spacing
4px, Columns gap 4px, Kanban gap 10px. Grid placement retains its existing visual
frame; changing interaction thickness does not resize it. Free space below a short
Bento tile belongs to the Bento parent. Bento enables background and disables gaps.

## Ownership and lookup

`BlockEditorController` creates one `BlockDropTargets`; view refs/effects own their
registrations and release them on replacement, collapse and unmount. Extension
resource ownership supplies final cleanup. Consumers receive `resolve` or
registration capabilities through their existing narrow editor interfaces. The host
boundary no longer creates an independent outline heuristic resolver.

`BlockDropLayout` composes existing host DOM. `BlockChildren` supplies the same scope
internally. A scope publishes mounted anchors in supplied canonical order after
structural commits; it does not maintain a second model tree. `BlockDropItem` borrows existing shells
through the addressed region registry. `BlockDropWrapper` registers its existing
placement. Root projections obtain canonical parents from `BlockRootPlacements`;
visible roots are not treated as a synthetic parent. Nested scopes reset inherited
layout and depth contexts. Item filtering removes its registrations with its node.

Native hit testing limits lookup to the current occurrence and closest layout.
Explicit exclusions and virtual spacers are inert; native controls are not excluded. Edge hits read their anchor once. Linear
gaps binary-search mounted starts, retaining measurements only for that synchronous
query. Row-major grids can use same-row gaps; inter-row space remains background.
Virtual roots require consecutive mounted indices. No persistent rectangle cache,
global geometry index, custom hit-test callback, or pointer-time document scan.

Within an anchor explicit priority precedes block edge, inline edge, inside, then
registration order. Physical gaps precede background. The physical winner is then
validated against live canonical neighbors and source policy. Rejection never
falls through to another level. Source exclusion changes command neighbors without
moving the indicator. Host commands validate again and retain transactional writes.

## Extension path

Use `BlockChildren` with `dropAxis`, `dropPlacement`, `dropGaps`, `dropBackground`
and `emptyDropTarget` for canonical children. Use `BlockDropWrapper` through `item`
for wrapping placement, with optional `axis`, `targetSize`, and `contentRegions`.
Use `BlockDropTarget asChild` with data-only `regions` for an existing explicit
anchor. `BlockDropLayout` is available for already-rendered ordered root hosts,
including Edgeless. A new container needs composition, not a resolver type switch.

Removed APIs: physical `BlockDropGap`, `BlockOutlineDropGap`, custom JSX `gap`,
`indicatorAxis`, `getDestination`, and `resolveHit`. `getRegions` reads committed
data only; geometry stays centralized. No compatibility shim adds invisible DOM.

## Limits

The ordered gap contract assumes monotone flow or aligned row-major grids, not CSS
dense packing or visual reordering. Local thickness scales for axis-aligned zoom;
arbitrary rotation is outside this contract. Empty hosts need actual presentation
geometry; DnD never supplies an artificial minimum height. Embedded editor bounds
belong to that editor; enclosing insertion remains available in surrounding gaps.

## Verification

Unit checks cover canonical validation, rejection without fallback, independent
edges/gaps/background, RTL/depth/zoom, lifecycle and bounded measurements for 5 and
2000 mounted items. React checks cover filtering, reorder, root subscriptions,
StrictMode and cleanup. Browser checks use actual handle gestures and undo on Page
and Edgeless, every container, nested occurrences, source gaps, content insertion,
short Bento background, and unchanged layout when target thickness changes.

Run behavior with 12 workers and repeat failures serially. Performance uses serial
production previews, default document and repeat=200, five equivalent samples,
separate synchronous command and two-frame rendering times, and physical pointer
sweeps. Compare original HEAD and the intermediate DOM-strip implementation using
isolated builds. Record actual final results below rather than assuming that green
unit tests establish complete host or architectural integration.

## Final architecture review

The reviewed path covers controller creation, view attachment, region registration,
receiver/router use, host acceptance and mutation, and cleanup on replacement or
unmount. Geometry reads only the block operations needed to validate parent and
neighbor IDs. Receivers borrow resolution; views own their registration disposers;
mounted-item consumers borrow registration only. The root placement store borrows
root reads/subscription and releases the shared listener after its last reader.
Only roots whose canonical neighbors changed receive snapshot invalidations.
The 5/2000-root regression bounds both model reads and addressed snapshot reads.

The implementation removes the independent host outline resolver and physical gap
components. No framework, spatial-index dependency, persisted shape, or additional
DOM hit strips were introduced. Root-order publication uses supplied IDs rather
than DOM sorting. This removes the two profiled hot paths: React context propagation
across every root and repeated DOM-order comparisons during a move.

## Final validation (2026-10-25)

- Page: 197 tests in 27 suites passed after the final runtime change. Host: 19
  focused tests passed, covering container registration and the Page drag boundary.
- Main integration: 206 tests passed with 12 workers across Chromium and Firefox,
  including Page/Edgeless, six layouts, cross-document transfer, nested editors,
  release/cancellation, source gaps, RTL/zoom and undo.
- Standalone layouts: 20 behavior tests passed. Eight dedicated performance cases
  passed serially: Kanban/Bento, small/repeat=200, both browsers. Five pointer samples
  require five node reads, zero display-list reads and zero notifications at both
  sizes. The fixture now samples existing wrapper edges and waits for the window
  virtualizer's 150ms scroll-end debounce before resetting counters. The initial
  accidental parallel performance run failed; serial reproduction identified stale
  coordinates and toolbar/scroll work in the measurement, fixed without raising bounds.
- Page and React type checks, Page/package CSS build, main demo production build and
  standalone production build passed. Scoped lint has no errors; function-length
  warnings remain. Whitespace checks passed.
- Standalone virtualization: 34 passed and four failed in the earlier combined
  behavior run. Both failing cases (offscreen indent/outdent selection and offscreen
  text-range anchor) reproduce serially on original HEAD in both browsers: a pinned
  offscreen node remains mounted where the assertions expect zero.
- TODO storage serial checks: two passed, twelve failed, two skipped. The remaining
  padding (31 vs 24), filter/order control interception, sorting persistence, slash
  menu and filtered manual-order failures were reproduced or matched recorded
  original-HEAD failures. These are not claimed fixed by this change.
- The full workspace test suite was not run. Geometry remains limited to the flow,
  scaling and empty-host contracts documented above.

## Production pointer benchmark

Five independent samples per browser/size/build, one worker, production previews.
The gesture moves the same first root before the third through the same physical
4px gap, with 90 fractional pointer movements and an asserted final canonical order.
Times are milliseconds: median [minimum–maximum]. `Render` is the two-animation-frame
proxy following the command; it is not a complete asynchronous-layout guarantee.

| Browser / repeat | Build                   | Synchronous command |              Render |
| ---------------- | ----------------------- | ------------------: | ------------------: |
| chromium / 0     | Original HEAD           |       1.1 [1.1–1.5] |    31.5 [31.2–31.7] |
| chromium / 0     | Intermediate DOM strips |       1.3 [1.0–1.4] |    31.3 [29.3–31.6] |
| chromium / 0     | Declarative regions     |       1.0 [1.0–1.3] |    31.3 [31.1–31.6] |
| chromium / 200   | Original HEAD           |       4.5 [4.2–4.6] |    70.5 [66.8–72.3] |
| chromium / 200   | Intermediate DOM strips |       4.7 [4.5–5.2] | 106.9 [102.7–127.7] |
| chromium / 200   | Declarative regions     |       5.1 [4.9–6.1] |    70.2 [68.0–94.1] |
| firefox / 0      | Original HEAD           |       1.0 [1.0–2.0] |    31.0 [30.0–32.0] |
| firefox / 0      | Intermediate DOM strips |       2.0 [1.0–2.0] |    31.0 [31.0–33.0] |
| firefox / 0      | Declarative regions     |       2.0 [1.0–2.0] |    31.0 [30.0–33.0] |
| firefox / 200    | Original HEAD           |     10.0 [8.0–11.0] |    78.0 [75.0–79.0] |
| firefox / 200    | Intermediate DOM strips |      9.0 [9.0–10.0] |    97.0 [92.0–97.0] |
| firefox / 200    | Declarative regions     |     11.0 [9.0–12.0] |    73.0 [68.0–82.0] |

All 20 final gesture samples passed. Default documents have no frames over 50ms;
large-document samples retain one long frame per drop, so this does not claim a
frame-perfect large-document commit. Relative to DOM strips, rendering is improved;
relative to original HEAD, results are close but do not establish a universal speedup.
Synchronous model/subscriber work and React rendering still contribute to drop cost.
The measurements cover this root-move path; standalone container counters and the
behavioral suites cover the other declared layouts, not every possible host workload.

## Content-inside regression correction

The first implementation incorrectly made ordinary content neutral and changed its
browser test to require that behavior. The earlier green suite therefore did not
establish preservation of the original content-drop gesture. That claim is withdrawn.

`BlockNodeView` now composes `BlockDropTarget asChild` onto its existing shell with
an explicit inside destination. The existing host acceptance policy still decides
whether that destination is legal. No DOM, dimensions or persisted shapes are added.
The resolver retains the nearest inside candidate while checking declared edges
up to the nearest layout boundary. This preserves Bento's explicit content edge
and excludes controls, foreign occurrences and enclosing-layout fallback.

The new content gesture failed before the fix in both browsers and both surfaces
(four parallel failures, reproduced serially). A separate unit regression caught
content shadowing an enclosing placement edge before the resolver correction.
Browser acceptance checks now cover text-center placement in all six layouts,
canonical parent/children, undo, existing children, collapsed blocks and TODO
controls. Test points target editable text, rather than a Description input at the
geometric center of a TODO card. The existing edge gestures remain in the suite.

Correction validation: 198 Page unit tests, Page/React type checks and production
builds passed. The main browser run passed 234 tests with 12 workers; four additional
trailing-edge gesture tests passed in both browsers, preserving that existing path.
Initial parallel failures were reproduced serially: the Bento edge conflict was
fixed in the resolver; TODO points were moved from a protected input to actual text.
A subsequent test setup error used `contenteditable=true` instead of the editor's
`plaintext-only` contract; it was reproduced serially and corrected before the green
run. Lint has no errors; existing long-test function warnings remain.

The ownership review covers BlockNodeView creation, BlockDropTarget ref composition,
registration replacement/unmount cleanup, the nearest-layout resolver and unchanged
host acceptance/mutation. No new dependency or public API was introduced. The full
workspace suite and previously documented unrelated failures were not rerun here.

The corrected production fixture measures both sibling and content-inside moves on
the default route at repeat=0/200, three independent samples per browser/scenario,
serial execution, 90 fractional pointer movements and actual hierarchy assertions.
All 24 samples passed. Milliseconds are median [minimum–maximum].

| Placement | Browser / repeat | Synchronous command | Two-frame render proxy |
| --------- | ---------------- | ------------------: | ---------------------: |
| between   | chromium / 0     |       1.1 [1.0–1.4] |       30.9 [30.4–31.5] |
| between   | chromium / 200   |       5.1 [5.1–5.3] |       73.0 [67.4–78.5] |
| between   | firefox / 0      |       2.0 [1.0–2.0] |       32.0 [31.0–32.0] |
| between   | firefox / 200    |    10.0 [10.0–11.0] |       74.0 [72.0–75.0] |
| inside    | chromium / 0     |       1.7 [1.5–1.8] |       31.6 [31.5–32.1] |
| inside    | chromium / 200   |       6.8 [6.8–6.9] |       70.4 [66.7–71.5] |
| inside    | firefox / 0      |       2.0 [1.0–3.0] |       31.0 [31.0–33.0] |
| inside    | firefox / 200    |    15.0 [14.0–17.0] |       98.0 [95.0–98.0] |

The preceding broken implementation could not complete a content-inside gesture,
so there is no meaningful successful inside timing baseline. The comparable sibling
path remains near the preceding measurements (large Chromium 70.2→73.0ms, Firefox
73.0→74.0ms render medians); sample ranges overlap. Large-document commits still
have long frames, especially Firefox nesting; this is not a frame-perfect claim.

## Explicit exclusion correction

The implicit control-tag / data-editor-control rejection has been removed. It was
introduced during this refactor and incorrectly prevented a running block drag from
using the containing TODO/storage region over search fields and buttons. This
supersedes earlier notes describing controls as neutral during drop discovery.

BlockDropExclude asChild marks an existing subtree without owning registrations or
requiring an editor context. Its exclude prop defaults to true. BlockDropTarget has
an equivalent exclude prop, default false. Both use the same internal marker;
exclusion stops nested targets and ancestor fallback, and false does not override
an excluded ancestor. Ordinary handlers, refs and layout remain intact. The virtual
trailing spacer now uses the public primitive, retaining its existing inert behavior.

The resolver and background predicate no longer inspect input/button/select/textarea,
separator roles or data-editor-control for exclusion. Occurrence isolation and host
acceptance remain unchanged. Gesture initiation stays with the existing sensors.
The target ref still owns registration cleanup; exclusion updates only an attribute,
so toggling it does not introduce another registry, subscription or lifecycle owner.

Explicit-exclusion validation: 206 Page unit tests and 254 main browser tests passed
(Chromium/Firefox, 12 workers). Tests cover both public forms, default behavior,
live toggling, unchanged element/ref identity and DOM count, ordinary clicks,
cleanup and ancestor exclusion overriding nested targets. Native-tag controls and
separator roles remain valid drop hits without an explicit exclusion. Search,
Filter, Description and status gestures check feedback, canonical parent, unchanged
control state and undo on Page and Edgeless.

The search regression failed before implementation in both browsers, in parallel
and serial runs. After implementation, serial checks identified fixture assertions
against the shell rather than storage's declared header, and ambiguous descendant
control locators after nesting; those now inspect the exact owning row. A Kanban
serial failure was traced to a destination measured before drag activation: the
board edge moved 13px. That test now confirms activation before measuring and
checks the indicator before release. The final full focused run passed all 254 tests.
Page build, Page/React type checks and main production build passed. Scoped lint
has no errors; function-length warnings remain. The full workspace suite was not
run. No staged changes were altered by this correction.

Production control-drop timing uses the unchanged default document at repeat=0/200,
moving one seeded TODO under another via its Description input. Three independent
samples per browser/size run serially with 90 fractional pointer moves and an actual
parent assertion. All 12 samples passed. The old behavior rejected this gesture,
so a successful before/after timing comparison is unavailable. These TODO nesting
measurements are not directly comparable to the preceding root-move fixture.
Milliseconds are median [minimum–maximum]; the render value is a two-frame proxy.

| Browser / repeat | Synchronous command | Two-frame render proxy |
| ---------------- | ------------------: | ---------------------: |
| chromium / 0     |       1.2 [1.1–1.5] |       31.4 [31.0–31.7] |
| chromium / 200   |    10.1 [10.0–10.5] |       61.1 [60.4–68.2] |
| firefox / 0      |       2.0 [2.0–3.0] |       31.0 [30.0–31.0] |
| firefox / 200    |    17.0 [16.0–18.0] |       89.0 [87.0–90.0] |

## Nested exclusion semantics

The user clarified that excluded containers must allow nested drop regions. This
supersedes the earlier global-subtree exclusion contract. Discovery now walks from
the native hit toward the nearest layout and stops at each exclusion, preserving
any matching inside region already found below it. Matching edges still resolve
with their existing placement priority. An exclusion on the same anchor wins over
that anchor's registration; an exclusion below a target stops fallback to it.

Thus drop → exclude → drop is enabled in the deepest region, while drop → exclude
→ drop → exclude is disabled in the deepest excluded area. Neutral wrappers do not
change the result, and rejected/stale inner destinations never fall back to outer
ones. BlockDropExclude with exclude=false merely removes a boundary; an actual
registered target is needed to enable dropping beneath an excluded ancestor.
BlockDropTarget with exclude=false restores its own declared regions.

No API or lifecycle additions were needed. Both public forms still compose existing
DOM and retain their registration/ref cleanup. Regression cases cover 1, 3 and 8
alternating levels, neutral wrappers, same-anchor exclusion, rejection, toggling and
registration removal. The React tests exercise both public forms under an excluded
ancestor; browser tests exercise native input, multiple excluded ancestors, an inner
exclusion toggled during the gesture, canonical nesting and undo on both surfaces.

Nested-exclusion validation: the new 1/3/8-level unit cases failed on the previous
global closest-marker check before the resolver change. Final checks passed: 209
Page unit tests, 258 main browser tests (12 workers, both browsers), Page/React type
checks, Page build and main production build. Lint has no errors; long-test warnings
remain. Architecture review confirms no new owner, subscription or dependency: the
same registry is read during the existing ancestor walk, and the exclusion marker
is inspected at its own DOM level rather than globally before discovery.

The production control benchmark now explicitly excludes the containing TODO
storage while keeping its nested TODO target registered. All 12 serial samples
passed (three per browser/size at default and repeat=200), asserting actual parent
changes. Milliseconds below are median [minimum–maximum]. Large-document render
values are two-frame proxies, not a guarantee of frame-perfect interaction. The
full workspace suite was not run.

| Browser / repeat | Synchronous command | Two-frame render proxy |
| ---------------- | ------------------: | ---------------------: |
| chromium / 0     |       1.4 [1.3–1.4] |       31.6 [30.1–32.0] |
| chromium / 200   |      9.8 [9.7–10.8] |       59.0 [57.2–64.2] |
| firefox / 0      |       2.0 [2.0–2.0] |       30.0 [29.0–31.0] |
| firefox / 200    |    17.0 [16.0–18.0] |       89.0 [87.0–90.0] |

## Shared boundaries and continuous physical gaps

The layout owns `boundaries: "merged" | "separate"` (merged by default).
`BlockEditor.dropBoundaries` supplies the view default; `BlockChildren.dropBoundaries`
and `BlockDropLayout.options.boundaries` override an individual layout. This is
registration data only, without DOM strips or changes to layout dimensions.

Resolve the nearest declared edge first, then let its nearest containing layout
normalize feedback against the adjacent mounted anchor. Merge only matching
canonical between destinations before selecting the pointer-dependent depth.
The trailing declaration supplies a shared depth partition across that boundary;
different hidden-neighbor boundaries and unrelated inside declarations retain their edges.
Virtual pairs still require consecutive display indices. Keep binary search and
query-local geometry; never rebuild the document tree on pointer input.

A fractional native hit can land on the neighboring item while pointer coordinates
are still in the physical gap. Do not classify gap ownership using background DOM
alone: allow a hit on either actual neighboring anchor when the coordinate is in
the gap. Explicit exclusion and nested-layout boundaries still stop traversal.
Both modes must cover that full gap; separate mode keeps nearest-edge feedback.

Verify fractional pointer sweeps and committed order in Page and Edgeless, shared
vertical/horizontal boundaries, differing destinations, virtual holes, exclusions,
and bounded rectangle reads. Compare production small/large drag measurements.

Validation of shared boundaries:

- Before the fix, the new quarter-pixel native-pointer sweep failed in Chromium
  in both Page and Edgeless, both with 12 workers and the required serial rerun.
  Firefox passed the original sweep. After the fix, both browsers pass.
- Final Page unit run: 216 tests, 27 suites. Includes both feedback modes,
  horizontal/RTL boundaries, hidden destinations, nonconsecutive virtual roots,
  bounded local rectangle reads, nested exclusions and inside-wrapper precedence.
- Final host browser run: 254 passed with 12 workers across Chromium/Firefox.
  Final standalone layouts: 22 passed with 12 workers, including live mode changes,
  unchanged layout dimensions and quarter-pixel horizontal sweeps in both modes.
- The first host run had two old root-boundary coordinate assertions fail, also
  reproduced serially. They now explicitly expect the shared midpoint for two
  root siblings; nested single-anchor depth assertions and committed parent/undo
  checks remain. The inspector test initially measured its old whole-anchor debug
  rectangle; the demo inspector now displays resolved insertion feedback. A
  subsequent Firefox-only assertion failed in parallel and serial because actual
  dispatched mouse coordinates were quantized; the expectation now uses the
  captured native event coordinate, without relaxing the line-position tolerance.
- Page and React host type checks pass. Page distribution, host production demo
  and standalone demo builds pass. Scoped ESLint has no errors; long-function
  warnings remain. `git diff --check` is clean.

Ownership review: the view supplies a plain default through context; each layout
can override it and its existing registration reads committed options. Items keep
ownership of their canonical edge declarations. The registry preserves the first
local winner and lets only its nearest layout normalize feedback. Registration
creation, borrowed interfaces, live reads and effect disposal were inspected;
no manager lifecycle capabilities or second geometry index were added. The editor,
child layout and low-level layout APIs all expose the selected mode. Persisted
model and transaction ownership are unchanged.

Production native-pointer comparison (three samples per browser/size, one worker, tracing off; synchronous command / two-frame rendered milliseconds):
| Browser / repeat | Before median [range] | After median [range] |
| --- | --- | --- |
| chromium / 0 | 1.1 [1.1–1.3] / 31.2 [31.1–31.6] | 1.0 [0.9–1.0] / 31.3 [31.2–31.6] |
| chromium / 200 | 5.6 [5.3–5.6] / 92.1 [72.3–92.6] | 5.4 [4.6–5.7] / 75.0 [69.2–82.4] |
| firefox / 0 | 2.0 [1.0–2.0] / 32.0 [31.0–32.0] | 2.0 [1.0–2.0] / 31.0 [31.0–32.0] |
| firefox / 200 | 11.0 [10.0–12.0] / 84.0 [81.0–111.0] | 10.0 [9.0–10.0] / 74.0 [73.0–81.0] |

All 12 before and 12 after samples passed the same commit assertions. Default-size frame maxima stayed near 17–18 ms; large documents still had one long frame per sample before and after. These noisy timings do not establish a speedup. Full workspace tests and unrelated TODO/virtual-selection baseline failures were not rerun for this change.

### Follow-up: Bento touching seams and outline depth discontinuity

The first shared-boundary patch missed two cases. Bento disabled gap resolution,
and its outer tile frames touch (the visible spacing is internal padding). A
fractional native hit can therefore select the next tile while the exact point
is still inside the preceding declared edge. Testing only positive-width gaps
cannot catch this. Bento now enables same-row boundaries, and the layout accepts
the exact point in either explicitly declared inset edge as well as the physical
gap. This adds no padding, tolerance expansion or synthetic hitbox. Wrapping-row
background and space below short tiles still belong to the board. Matching horizontal boundaries retain one full-height line beside unequal tiles,
including the taller tile's exposed declared edge; this does not extend hit coverage
into the free background under the short tile.

The outline bug was semantic: the previous trailing edge selected depth, but the
next leading edge did not. Merging only the final destinations left them different
at the same X, and crossing the gap switched from inside to between. The merged
mode now recognizes the canonical boundary first, then uses its preceding trailing
declaration to select depth consistently throughout both inset edges and the gap.
Separate mode retains independent edge semantics. Hidden canonical neighbors,
explicit exclusions and nonconsecutive virtual indices still prevent inappropriate
merging; source acceptance and canonical commit validation remain unchanged.

Before the fixes, the new native-quarter-pixel regressions had six failures and
two passes across Chromium/Firefox, reproduced with one worker after the parallel
run. Chromium failed the Bento seam in both Page/Edgeless; both browsers failed
outline depth continuity. The assertions check uninterrupted feedback, stable
horizontal depth and the actual parent/order after pointer release.

After the final runtime changes: 220 Page unit tests and 200 focused host browser
tests passed (Chromium/Firefox, 12 workers). Both package type checks and production
builds pass. Scoped lint has no errors and three long-function warnings. API review
covered the host's grid declaration, shared pair selection, canonical/depth
resolution and existing ownership/cleanup; no new API or lifecycle owner was added.

The follow-up clarification required continuity in both movement axes across
containers, not only one Bento seam. Grid pair discovery now also checks bounded
row-transition candidates. Consecutive canonical neighbors on different rows use
block edges when their horizontal extents overlap; diagonal empty space is not
converted into insertion geometry. Touching frames are covered by their existing
inset declarations even when the physical interval has zero size. Unequal-height
neighbors share stable full-height inline feedback without occupying the free
background below the shorter tile. Background occupancy now checks exact pointer
coordinates against the native hit's marked ancestor boxes, preserving explicit
exclusions while handling browser rounding at an exposed tile edge.

The generalized final checks passed: 223 Page unit tests; 220 host behavioral tests
with 12 workers in Chromium/Firefox; four additional horizontal depth-sweep checks
on the same scenarios; and 22 standalone layout checks including both feedback
modes. Host tests sweep boundaries forward/backward in outline, Columns, Kanban,
Table and TODO storage, plus horizontal and wrapped vertical Bento seams. Depth
sweeps assert exactly two monotonically ordered depth choices while moving right
and left, and then assert the actual committed parent. Builds and both type checks
pass; scoped lint has zero errors and three function-length warnings.

The initial Bento performance fixture incorrectly assumed its first two default
tiles occupied the same row. The production demo actually wraps those tiles.
The benchmark now determines the seam axis from the real boxes and asserts a
shared extent and touching frames before measuring a committed insertion. Failed
setup runs are not included in the final timing measurements.

Final production measurements: 24 passed, three samples for each browser, size and placement, one worker, tracing off.

| Browser / placement / repeat | Command median [range], ms | Two-frame rendered median [range], ms |
| --- | --- | --- |
| chromium / between / 0 | 1.0 [0.9–1.1] | 31.4 [31.1–31.4] |
| chromium / between / 200 | 5.4 [5.1–6.5] | 72.6 [65.9–89.3] |
| chromium / bento / 0 | 1.3 [1.3–1.4] | 31.5 [30.9–31.8] |
| chromium / bento / 200 | 6.9 [6.8–7.1] | 101.9 [101.4–115.1] |
| firefox / between / 0 | 2.0 [1.0–2.0] | 31.0 [30.0–31.0] |
| firefox / between / 200 | 11.0 [10.0–12.0] | 75.0 [73.0–82.0] |
| firefox / bento / 0 | 2.0 [2.0–2.0] | 32.0 [31.0–33.0] |
| firefox / bento / 200 | 14.0 [12.0–15.0] | 89.0 [86.0–90.0] |

The small default Bento setup also exposed pending drag autoscroll after the long programmatic fixture scroll: targets moved 12 viewport pixels after measurement. The benchmark now moves into the receiving region and waits two frames before measuring the seam, outside interaction timing. This fixes stale test coordinates; the subsequent 90 fractional pointer movements and actual committed order remain asserted. Failed setup samples are excluded.

Root-between rendering remains in the same range as the previous production baseline (31 ms default, large medians 75 ms Chromium / 74 ms Firefox); timings do not establish a speedup. Large-document commits still produce a long frame. Full workspace suites were not rerun.
