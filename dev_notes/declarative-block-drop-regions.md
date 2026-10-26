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
for wrapping placement, with optional `axis` and `targetSize`. Child bodies keep
inside regions on their existing shells; explicit extra anchors use BlockDropTarget.
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

| Browser / repeat | Before median [range]                | After median [range]               |
| ---------------- | ------------------------------------ | ---------------------------------- |
| chromium / 0     | 1.1 [1.1–1.3] / 31.2 [31.1–31.6]     | 1.0 [0.9–1.0] / 31.3 [31.2–31.6]   |
| chromium / 200   | 5.6 [5.3–5.6] / 92.1 [72.3–92.6]     | 5.4 [4.6–5.7] / 75.0 [69.2–82.4]   |
| firefox / 0      | 2.0 [1.0–2.0] / 32.0 [31.0–32.0]     | 2.0 [1.0–2.0] / 31.0 [31.0–32.0]   |
| firefox / 200    | 11.0 [10.0–12.0] / 84.0 [81.0–111.0] | 10.0 [9.0–10.0] / 74.0 [73.0–81.0] |

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
| ---------------------------- | -------------------------- | ------------------------------------- |
| chromium / between / 0       | 1.0 [0.9–1.1]              | 31.4 [31.1–31.4]                      |
| chromium / between / 200     | 5.4 [5.1–6.5]              | 72.6 [65.9–89.3]                      |
| chromium / bento / 0         | 1.3 [1.3–1.4]              | 31.5 [30.9–31.8]                      |
| chromium / bento / 200       | 6.9 [6.8–7.1]              | 101.9 [101.4–115.1]                   |
| firefox / between / 0        | 2.0 [1.0–2.0]              | 31.0 [30.0–31.0]                      |
| firefox / between / 200      | 11.0 [10.0–12.0]           | 75.0 [73.0–82.0]                      |
| firefox / bento / 0          | 2.0 [2.0–2.0]              | 32.0 [31.0–33.0]                      |
| firefox / bento / 200        | 14.0 [12.0–15.0]           | 89.0 [86.0–90.0]                      |

The small default Bento setup also exposed pending drag autoscroll after the long programmatic fixture scroll: targets moved 12 viewport pixels after measurement. The benchmark now moves into the receiving region and waits two frames before measuring the seam, outside interaction timing. This fixes stale test coordinates; the subsequent 90 fractional pointer movements and actual committed order remain asserted. Failed setup samples are excluded.

Root-between rendering remains in the same range as the previous production baseline (31 ms default, large medians 75 ms Chromium / 74 ms Firefox); timings do not establish a speedup. Large-document commits still produce a long frame. Full workspace suites were not rerun.

### Geometry follow-up: TODO selection and editor ending space

TODO already owns card padding; the standard BlockRow adds another 2px vertically
and 12px on each side in the host theme (row padding plus empty-slot gaps). Remove
those redundant row insets for TODO content, retaining actual occupied control slots.

Give the autonomous Page tree a real ending area with a public CSS height token,
`--rivto-editor-end-space` (48px default, zero disables its geometry). Declare a
full-bounds edge region on that existing presentation area: hit coverage and line
placement remain independent. Reuse canonical root-placement subscriptions for
its destination after the last displayed root, including hidden canonical next
siblings in projected views. The ending area remains after virtual reserved space;
its destination does not depend on a mounted last block. It is view geometry, not
a persisted block, and does not add a per-pointer forest scan or host-specific rule.

Bento clarification was requested; absent a reply, the implemented interpretation
is the line for insertion into an individual tile. That line started at the
content frame, 8px inside the existing outer tile. The explicit content-edge
registration now uses `indicatorInset: -8`: feedback begins at the outer edge,
while its hit geometry and child destination remain unchanged. Logical direction
and transform scale are handled by shared geometry rather than container callbacks.

Both TODO geometry and Bento's 8px feedback offset were reproduced in Page and
Edgeless in Chromium/Firefox, including the required serial reruns. After changes,
227 Page unit tests pass, including full-bounds edge coverage, logical feedback
insets, canonical projected ending placement and the existing bounded subscription
checks. The first host run passed 244 tests and failed two ending-area checks because
Edgeless composes its forest directly instead of mounting BlockTree. The same
BlockEditorEnd primitive is now exported and used there. Final host behavioral run:
246 passed with 12 workers. Focused standalone layout/virtualization checks: 18 passed,
including an initially unmounted final root, theme sizing and ending feedback.
Page/React type checks, Page distribution and both demo builds pass. Scoped lint
has no errors and seven long-function warnings; diff whitespace is clean.

Ownership review covered view creation, projected/displayed identity, placement
subscriptions, declaration reads and disposal. The new ending component borrows
canonical placement through the same hook as root nodes; it owns no editor/model
lifecycle. Its CSS token owns presentation size, while the full-bounds edge owns
hit coverage and top-edge feedback. The host only composes the exported primitive;
no new per-pointer host lookup or model mutation path was introduced. TODO styling
stays in the TODO extension and Bento supplies only feedback data.

Final geometry-follow-up production measurements: 36 passed, three samples per browser/size/placement, one worker, tracing off.

| Browser / placement / repeat | Command median [range], ms | Two-frame rendered median [range], ms |
| ---------------------------- | -------------------------- | ------------------------------------- |
| chromium / control / 0       | 1.3 [1.2–1.3]              | 31.7 [31.2–31.7]                      |
| chromium / control / 200     | 9.2 [9.2–10.1]             | 57.8 [57.5–58.0]                      |
| chromium / bento / 0         | 1.3 [1.3–1.4]              | 31.6 [31.4–31.7]                      |
| chromium / bento / 200       | 7.0 [7.0–7.1]              | 100.1 [95.5–110.9]                    |
| chromium / end / 0           | 1.2 [1.1–1.2]              | 31.2 [31.0–31.6]                      |
| chromium / end / 200         | 8.0 [7.7–8.3]              | 122.3 [119.3–123.1]                   |
| firefox / control / 0        | 2.0 [2.0–3.0]              | 31.0 [30.0–32.0]                      |
| firefox / control / 200      | 19.0 [18.0–20.0]           | 93.0 [90.0–96.0]                      |
| firefox / bento / 0          | 2.0 [2.0–3.0]              | 31.0 [31.0–32.0]                      |
| firefox / bento / 200        | 14.0 [12.0–15.0]           | 89.0 [87.0–93.0]                      |
| firefox / end / 0            | 2.0 [1.0–2.0]              | 31.0 [31.0–32.0]                      |
| firefox / end / 200          | 15.0 [14.0–16.0]           | 97.0 [97.0–98.0]                      |

The first ending benchmark used a descendant selector and also matched an embedded editor ending. Its strict-selector setup failures are excluded; the final benchmark scopes the ending to the measured occurrence's direct tree. All final samples assert committed parent/order after real fractional pointer movements. Full workspace suites were not run; large-document commits still include long frames.

Bento direction correction: the user clarified that the child-insertion line
should move right, not left. The content-edge declaration now uses
`indicatorInset: 8`, placing its start 8px inside the content frame. Hit coverage
and destination remain unchanged; the browser assertion checks that exact offset.

Direction-correction verification: four Page/Edgeless browser checks passed in Chromium/Firefox (12 workers), host types/build and scoped lint passed (one existing long-test warning). Twelve serial production measurements passed.

- chromium, repeat=0: sync median 1.2 ms [1.1–1.2]; rendered median 31.3 ms [31.3–31.4].
- chromium, repeat=200: sync median 6.9 ms [6.9–7.0]; rendered median 99.3 ms [97.5–105.9].
- firefox, repeat=0: sync median 2.0 ms [2.0–2.0]; rendered median 32.0 ms [31.0–32.0].
- firefox, repeat=200: sync median 14.0 ms [14.0–16.0]; rendered median 91.0 ms [88.0–92.0].
  Full workspace tests were not rerun for this feedback-only parameter correction.

### Post-drag activation and column free space

The drag controller retained `suppressedClickId` until any later click on the
source block. A release outside that block can produce no such click, so the first
subsequent TODO status or counter activation was consumed. The guard now expires
on the next window-capture pointerdown, before a control can stop propagation.
Zero-detail keyboard/programmatic clicks bypass it; a trailing pointer click from
the activated drag remains suppressed. The existing event registry owns listener
attachment, detach and disposal; no timer, control-specific callback or new API is
introduced. The source handle still owns navigation and the drag controller owns
suppression and pointer release.

The reported column is a populated `kanban-column`. Its child host declared
`emptyDropTarget` only, so after the first card appeared its free background and
add-card footer became neutral. The nearest layout correctly prevented fallback
to the enclosing column shell. Enabling the existing `dropBackground` declaration
restores append into that canonical lane while preserving nested card targets,
sibling gaps, exclusions and permissions. No custom resolver, layout box or CSS
change is introduced. Ordinary `columns` is outside this fix.

Before the fix both browsers reproduced the lost first TODO/counter click in Page
and Edgeless. Two consecutive counter drags committed on the baseline; the reported
intermittent second-drag failure was not independently reproduced. The regression
retains both committed moves, rather than checking only drag feedback. Populated
Kanban free-area/footer checks failed; empty-lane footer checks passed.

Verification after the Kanban clarification:

- The eight populated Kanban background/footer regressions failed in both browsers
  with 12 workers and again with one worker on the production baseline. Four empty
  column cases passed. The final 12-worker run passed all 266 tests across declared
  regions, column behavior, handle activation, release/capture, pointer commit,
  cancellation and undo in Chromium/Firefox, including 20 new interaction checks.
- The first broader run passed 246 tests and exposed 20 stale assertions. Serial
  reruns confirmed them; a separate production build from unchanged HEAD reproduced
  one example of each failure in both browsers. Handle activation tests now use
  existing physical sibling-edge geometry instead of deleted Bento hit strips or
  the inset Kanban text-row edge. The Bento inset assertion follows the existing
  16px declaration from commit `7ea90b78`; this fix does not change that offset.
- Page unit checks: 65 passed across drag lifecycle, native event dispatch and drop
  targets. Page build, host production build and both package type checks passed.
  Scoped lint has no errors and five existing long-function warnings.
- Ownership review: the existing drag installation/event registry owns the new
  capture observer and its detach/disposal; controls borrow no new capability.
  Kanban declares background acceptance through the existing child-layout API.
  The shared resolver, canonical validation, source permissions, hierarchy writes
  and renderer/selection geometry are unchanged. No public API or dependency added.

### One receiving-block outline for inside regions

Visual inspection confirmed that the Kanban child-list outline touched the cards:
the list was 326px wide at x=482, while the actual column was 350px wide at x=470.
The cards obscured the inset frame. Header and list regions already resolved to
the same canonical column; using the hit anchor as the outline owner made them
appear to be different destinations.

`BlockDropFeedback` now resolves inside feedback to the nearest block shell when
its ID matches the destination parent and it belongs to the same editor occurrence.
Edges keep their measured insertion line and original anchor. Custom regions
without a matching shell retain their anchor; no nested-editor boundary is crossed.
Only bounded DOM ancestry is read, with no geometry/model reads or global search.
The receiver and source gesture still own the feedback lifecycle, including marker
replacement and cleanup. `ResolvedBlockDropTarget.element`, resolver priorities,
permissions, canonical destinations and actual hit coverage remain unchanged.

The new unit regression and four real browser cases failed before the change;
browser failures were confirmed serially. Afterward, 67 unit checks and all 270
browser checks passed. Screenshots confirmed one outer column frame with cards
inside it; browser checks compare the exact highlighted bounds across header/footer
moves and assert the committed parent. Existing TODO/Bento/empty-column assertions
now inspect the receiving shell. Package/host types and builds passed; scoped lint
has no errors and seven existing long-function warnings. No public API was added.

Final serial production measurements (three samples, median [min–max], ms):

| Build / browser / placement / repeat | Synchronous commit | Two-frame rendering proxy |
| ------------------------------------ | -----------------: | ------------------------: |
| baseline / chromium / control / 0    |      1.4 [1.1–1.5] |          31.4 [31.3–31.4] |
| baseline / chromium / control / 200  |      9.4 [9.3–9.6] |          58.1 [54.0–64.7] |
| baseline / firefox / control / 0     |      2.0 [2.0–3.0] |          31.0 [31.0–31.0] |
| baseline / firefox / control / 200   |   18.0 [18.0–19.0] |          91.0 [91.0–96.0] |
| fixed / chromium / column / 0        |      1.7 [1.6–1.9] |          30.8 [30.4–31.8] |
| fixed / chromium / column / 200      |      6.9 [6.7–7.5] |       112.3 [110.4–119.7] |
| fixed / chromium / control / 0       |      1.2 [1.2–1.3] |          31.5 [31.5–31.8] |
| fixed / chromium / control / 200     |    10.1 [9.4–11.9] |          63.0 [57.8–66.2] |
| fixed / firefox / column / 0         |      2.0 [2.0–2.0] |          32.0 [31.0–32.0] |
| fixed / firefox / column / 200       |   14.0 [13.0–14.0] |          94.0 [93.0–95.0] |
| fixed / firefox / control / 0        |      3.0 [1.0–3.0] |          31.0 [30.0–32.0] |
| fixed / firefox / control / 200      |   18.0 [18.0–18.0] |          91.0 [90.0–93.0] |

All 24 final measurements assert actual committed placement after fractional pointer input. The final preview was copied to an isolated output directory and matched the tested build hash. Baseline control timings use a fresh production build of unchanged HEAD. Kanban background insertion was unavailable on that baseline, so no successful before timing is claimed for it. Large-document commits still contain long frames. Full workspace tests were not run; concurrent TODO toolbar layering changes are outside this fix and were preserved.

The adjacent receiver cleanup/replacement suite also passed both checks (69 unit checks in total across the five focused suites).

### Native click delivery and registered hierarchy outlines

Post-drag click suppression is removed completely from `BlockDragController`:
no `suppressedClickId`, captured click handler, reset observer or replacement gate
remains. Native handle activation is deliberately retained, including a browser
click after captured release or Escape. The initial behavioral run passed 259
checks and failed 11 assumptions that release could not navigate; serial reruns
confirmed all 11. Native navigation was explicitly selected as the intended
behavior. Capture-release tests now assert that the source panel opens, return
through actual breadcrumbs, then retain the committed order and undo assertions.
Other gesture tests accept only the document or the dragged source as the active
panel; navigation to an unrelated block fails. The final behavioral run passed
all 270 checks with 12 workers in Chromium and Firefox.

`ResolvedBlockDropTarget.outlineElement` now carries the complete registered
receiving shell separately from its hit anchor. `BlockDropTargets` borrows only
`BlockLayoutRegions.get`, supplied by the owning controller; it reads the shell
for an accepted inside destination without measuring or traversing descendants.
`BlockDropFeedback` paints that supplied element directly. The ancestor search,
DOM ID comparisons and inferred occurrence checks were deleted from rendering.
Missing shells/custom targets retain their explicit hit anchor; custom resolvers
can provide an outline directly. Tests cover registration removal, identical IDs
in another occurrence, and hierarchy anchors independent of DOM ancestry.

Ownership review covered controller creation/passing/destruction, region ref
cleanup, shared resolution, local gestures, `PageDragOccurrence` forwarding and
`BlockDropReceiver` cleanup. The controller still owns the region registry;
consumers borrow no registration or destruction capabilities. No duplicate manager,
wrapper or callback layer was added. Native handle documentation and the public
resolved-target contract were updated. Page build, isolated production demo build,
both package type checks and 71 focused unit checks passed. Scoped runtime lint
has no errors and four existing long-function warnings; browser-test lint has no
errors and four existing long-function warnings. No full workspace run was made.

Native column-drop production timings, three serial samples per browser/size; median [min–max], ms:

| Build / browser / repeat | Synchronous command | Two-frame rendering proxy |
| ------------------------ | ------------------: | ------------------------: |
| before / chromium / 0    |       1.2 [1.2–1.4] |          31.5 [31.4–31.5] |
| before / chromium / 200  |      7.0 [6.9–10.2] |       137.5 [112.0–146.3] |
| before / firefox / 0     |       2.0 [2.0–2.0] |          32.0 [31.0–32.0] |
| before / firefox / 200   |    13.0 [13.0–20.0] |        105.0 [94.0–120.0] |
| after / chromium / 0     |       1.5 [1.3–1.9] |          31.2 [30.6–31.8] |
| after / chromium / 200   |       7.3 [7.2–7.5] |       127.0 [109.2–135.3] |
| after / firefox / 0      |       2.0 [2.0–3.0] |          32.0 [31.0–32.0] |
| after / firefox / 200    |    14.0 [13.0–16.0] |        109.0 [94.0–115.0] |

All 24 production measurements passed with one worker and tracing disabled, with actual committed parent assertions after fractional native pointer movement. Both builds used isolated output directories. Large-document rendering still contains long frames; these are measurements, not a claim of a rendering performance fix.

### Completing a lost release before later pointer movement

Comparison used local `main` at `dca961c8` (`Vs hotfix2 (#39)`). Its
`PageDragProvider` delegates pointer end/cancellation to dnd-kit, and
`PageDragController.handleDragEnd` commits the current `displayedPlacement` after
validating live canonical destination and source policy. The application tracker
updates raw coordinates but contains no unconditional buttons=0 cancellation.

The Page controller's old buttons=0 branch discarded its current target. The
regression isolates two kinds of missed release with trusted native browser input:
a footer stops bubbling, or a pre-application listener intentionally withholds
pointerup from every editor listener. Releasing and immediately moving to (0, 0)
then left the source in its old lane. The original build passed the four normal
quick-release checks and failed all eight stopped/lost-release checks; serial
reruns confirmed all eight. This demonstrates the lost-release defect, rather
than claiming that ordinary rapid movement always makes the browser lose events.
The exact platform cause of the user's unavailable release remains untraced.

Real pointerup now completes in window capture and resolves its actual coordinates
before descendant handlers can stop bubbling. If pointerup is unavailable, the
first pointermove reporting the primary button released completes the last
_displayed_ target after a live permission check. It never resolves that later
movement's coordinates. A neutral last held position performs no move. An explicit
Escape, blur, pointercancel or detach still cancels without committing. The host
mutation continues to validate current hierarchy and permissions; cleanup, focus
restoration and aggregated failures stay with the gesture owner. Native clicks
remain untouched, as requested.

The shared `finish` cleanup is reused by both release paths; `releaseTarget`
contains the different target-selection rules. No new manager, API, registration
capability, geometry cache or type-specific rule was introduced. Review covered
native registration phase, source/foreign target identity, permission revalidation,
host move delegation, auto-scroll stop and feedback/pointer disposal. Unit checks
cover revoked permission, frozen target coordinates, exactly one move and resource
release. The existing release-outside-viewport and native-click navigation checks
remain in the behavioral run.

Final verification: 74 unit checks and 258 Chromium/Firefox behavioral checks passed
with 12 workers. All 12 rapid-release cases passed again after extracting the shared
fixture used by performance measurements. Page build, isolated production demo
build, both package type checks and formatting passed. Scoped lint has no errors
and four existing long-function warnings; the new helpers/tests stay within the
function-length rule. Full workspace suites were not run.

Serial production measurements for column drop, three samples per browser/size; median [min–max], ms:

| Release / browser / repeat | Synchronous move | Two-frame rendering proxy |
| -------------------------- | ---------------: | ------------------------: |
| before / chromium / 0      |    1.4 [1.2–1.8] |          31.4 [31.1–31.5] |
| before / chromium / 200    |    7.2 [7.1–8.1] |       112.5 [111.4–112.7] |
| before / firefox / 0       |    1.0 [1.0–3.0] |          30.0 [30.0–31.0] |
| before / firefox / 200     | 15.0 [14.0–15.0] |         93.0 [90.0–111.0] |
| after / chromium / 0       |    1.3 [1.3–1.5] |          31.2 [31.2–31.5] |
| after / chromium / 200     |    7.7 [6.8–8.9] |       115.5 [105.5–116.0] |
| after / firefox / 0        |    2.0 [2.0–3.0] |          31.0 [31.0–32.0] |
| after / firefox / 200      | 16.0 [14.0–16.0] |         96.0 [94.0–105.0] |
| lost / chromium / 0        |    1.2 [1.1–1.4] |          16.5 [16.3–16.5] |
| lost / chromium / 200      |    8.0 [6.9–8.5] |       110.1 [105.6–119.9] |
| lost / firefox / 0         |    2.0 [2.0–2.0] |          18.0 [15.0–19.0] |
| lost / firefox / 200       | 15.0 [14.0–15.0] |         95.0 [91.0–100.0] |

All 36 serial measurements passed with tracing disabled and asserted the committed parent after native pointer input. Before/after timings compare normal delivery on isolated production builds; the lost-release scenario is measured only after fixing it because it previously performed no move. The different release/move phase changes the two-RAF proxy phase, so shorter lost-release frame timings are not a claim of a rendering speedup. Large documents still have long frames.

### Ending layout correction (2026-10-25)

The earlier unconditional 48px `BlockEditorEnd` was incorrect: it inserted a
second ending area before the host's existing trailing controls and increased
embedded and canvas content height. That implementation and its theme token
are superseded by the following contract.

`BlockTree` renders roots and virtual reserves only. Canvas cards also add no
ending spacer. `BlockEditorEnd` now requires a single existing ref-forwarding
child and composes a data-only full-bounds declaration onto it. The React Page
host applies it to its existing `data-page-end-slot`; it supplies no dimensions.
Hosts without trailing presentation retain ordinary final-block edge insertion.
The embedding-specific zero-height override is no longer needed.

The trailing child remains mounted across empty/populated transitions, preserving
the portal target for Add block controls. Undefined root identity disables model
reads and regions without replacing that child. Canonical sibling subscriptions
still retain hidden next siblings and work independently of virtual root DOM.
Ownership review covered creation in PageSurface, composition through
BlockEditorEnd/BlockDropTarget, the shared placement hook/store subscriptions,
TrailingBlock's portal consumer, and React ref/subscription cleanup. No new
manager dependency, lifecycle forwarding API, or persisted shape is introduced.

Verification: the no-spacer regressions failed on the original production build
in all eight Page/canvas/embedding browser cases; serial reruns reproduced them.
After the change, 53 unit tests, 156 existing DnD browser cases, eight focused
ending/embedding cases, two virtual-final-boundary cases, and two empty/insert/
undo/reinsert portal cases passed in Chromium/Firefox. Browser behavior used
12 workers. Page build, production demo build, standalone demo build and both
package type checks passed.

The older `empty-document.spec.ts` remains unchanged. Its two parallel failures
also reproduced serially; a baseline run reproduced the same setup failures:
Chromium's outdated root selector does not reach the document rows, and a
local selector correction exposed an embedding intercepting Firefox's selection
clicks. That diagnostic selector edit was reverted. The dedicated new test avoids
that unrelated selection setup and exercises native trailing-control insertion
and keyboard undo directly.

Serial production end-drop timings, three samples per browser/size; median [min–max], ms:

| Build / browser / repeat | Synchronous move | Two-frame rendering proxy |
| ------------------------ | ---------------: | ------------------------: |
| before / chromium / 0    |    1.0 [1.0–1.1] |          31.1 [30.9–31.2] |
| before / chromium / 200  |    7.9 [7.8–8.0] |       117.2 [114.6–119.4] |
| before / firefox / 0     |    2.0 [2.0–2.0] |          32.0 [32.0–32.0] |
| before / firefox / 200   | 14.0 [14.0–15.0] |          92.0 [92.0–94.0] |
| after / chromium / 0     |    1.1 [1.0–1.2] |          31.0 [30.8–31.1] |
| after / chromium / 200   |    8.6 [8.2–8.8] |       114.2 [111.3–125.3] |
| after / firefox / 0      |    2.0 [2.0–3.0] |          32.0 [31.0–32.0] |
| after / firefox / 200    | 15.0 [14.0–16.0] |         94.0 [94.0–134.0] |

All 24 measurements passed and asserted canonical root append. The original
spacer and replacement existing trailing element have different geometry but
commit the same move. Results show comparable cost, not a claimed speedup;
large documents still produce long frames. Full workspace suites were not run.

### Existing top-padding insertion (2026-10-25)

Populated `BlockEditor` views now declare insertion before their first displayed
root on the existing editor root's top padding. No leading element, spacer,
minimum height, Add block control or host-specific hit-test callback is added.
`coverage: "padding"` extends the existing edge primitive: current CSS padding
supplies the hit band and the content-box edge supplies feedback. Zero padding
has no extra hit area. Bounds remain query-local and scale with the anchor.

`BlockEditorRoot` composes the same native element through `BlockDropTarget`.
It observes only the first displayed ID and borrows the existing canonical
placement hook, preserving projected hidden previous siblings without a mounted
first-root requirement. There is one fixed display-list subscription per view;
unchanged first IDs do not rerender this declaration. Empty views retain the
host's existing empty receiving parent. React still owns region/ref/subscription
cleanup; the host owns its controller and no manager interface is widened.
The scope moves outside the same root element so declarations can borrow its
context; the public root, ref, attributes and portalled trailing controls stay
identical. Ownership review covered all BlockEditor consumers, the shared root
placement store/hook, target composition/cleanup and both geometry consumers
(target resolution and sibling-layout edge matching).

A Chromium regression at padding minus 0.25px reproduced with 12 workers and
again serially. Native hit rounding selected the first block, while its inner
layout incorrectly stopped lookup for a point outside that layout's actual
bounds. The shared resolver now permits explicit ancestor discovery only outside
those bounds; occupied layouts and explicit exclusions still stop discovery.
This keeps native hit authorization and adds no nearest-target fallback.

Final validation: 103 focused unit tests and 174 DnD/rapid-release browser
checks passed after the fractional-boundary correction. Chromium and Firefox
behavior used 12 workers. The eight selected embedding cases initially returned
seven passes and one Firefox repeat=200 startup timeout while sharing the machine
with the DnD run; that case passed on its required serial rerun. Page build,
isolated production demo build, Page/React/demo types and scoped lint passed
(lint retains five existing long-function warnings). Full workspace suites were
not run. Tests cover projected hidden siblings, live parent updates, cleanup,
all logical padding sides/RTL, zero padding, transformed geometry, actual prepend
and undo, unchanged layout, and the fractional padding-to-first-block transition.

Serial production prepend measurements after the final runtime change, three
samples per browser/size; median [min–max], ms:

| Hit area / browser / repeat                | Synchronous move | Two-frame rendering proxy |
| ------------------------------------------ | ---------------: | ------------------------: |
| existing first-block edge / chromium / 0   |    1.0 [1.0–1.1] |          31.4 [31.3–31.5] |
| existing first-block edge / chromium / 200 |    8.7 [8.2–9.1] |       321.1 [318.7–326.2] |
| existing first-block edge / firefox / 0    |    2.0 [2.0–3.0] |          32.0 [31.0–32.0] |
| existing first-block edge / firefox / 200  | 15.0 [14.0–16.0] |       375.0 [369.0–401.0] |
| top padding / chromium / 0                 |    1.0 [0.9–1.1] |          31.6 [31.3–31.7] |
| top padding / chromium / 200               |    8.6 [8.4–8.9] |       353.8 [351.0–358.3] |
| top padding / firefox / 0                  |    2.0 [2.0–2.0] |          32.0 [30.0–33.0] |
| top padding / firefox / 200                | 15.0 [15.0–16.0] |       383.0 [383.0–394.0] |

All 24 measurements passed and assert that the dragged last root becomes the
first canonical root. The baseline serves the preceding ending-layout fix and
uses its existing first-block edge; the final build uses the added top-padding
area. Both commit the same move in default demo settings, including repeat=200,
with tracing disabled and no concurrent builds/browser tests. Large-document
prepend is slow through both hit areas; these samples do not establish a speedup
or solve that existing rendering cost. The earlier 24 start/end measurements also
passed before the fractional-hit correction; they are not substituted for the
final prepend measurements above.

### Simplify root-list free space (2026-10-25)

The preceding padding-specific implementation is superseded. Public edge coverage
again has only `edge | bounds`. The padding geometry helpers and the separate
`BlockEditorRoot` component are removed. There is no replacement public mode,
start/end component, host geometry callback, invisible element or size token.
The ordinary BlockEditor root/ref/context structure and live empty-background
registration are restored; no extra subscription observes the first root.

The existing tree's mounted-anchor getter is also registered on its direct editor
root. This reuses the same ordered snapshot instead of building a second list.
The shared gap resolver recognizes existing free space before/after a registered
vertical root list and reuses that endpoint's canonical edge declaration. Explicit
trailing bounds targets retain priority. Outer-list insertion ignores trailing
child-depth choices, so the entire free area inserts a sibling, rather than
unexpectedly nesting under the last block as X changes. Hidden canonical previous/
next siblings stay intact. Virtual first/last endpoints must actually be mounted;
the last marker is checked on the nearest indexed item to avoid borrowing a marker
from an enclosing occurrence. Native hit authorization, explicit exclusions and
live model/source acceptance remain in the existing resolver/commit path.

Ownership review covered BlockEditor/BlockTree creation and view attachment,
shared MountedDropItems order publication, registration/getter passing, root and
canvas consumers of the existing `data-block-root-list` contract, region geometry,
canonical root placement, trailing-control portals, and effect/ref disposers.
The outer helper borrows only the mounted-anchor getter, not the registry object
or its mutation/lifecycle API. Its registration adds no DOM and is released on
editor replacement, boundary-policy changes or unmount. No persisted shape,
manager forwarding API or controller ownership is changed. Existing before/after
rendered gestures and undo are kept; zero leading space adds no new target.

Validation after the final runtime change: 99 focused unit checks and 178
Chromium/Firefox DnD/rapid-release checks passed with 12 browser workers. Fourteen
focused outer-space, zero-leading-space, ending and trailing-control checks also
passed. The selected embedding run passed six cases and hit startup timeouts in
the two repeat=200 editing cases under concurrent browser load; both passed their
required serial rerun. Package/host/demo type checks, Page build, isolated
production demo build and standalone demo build passed. Scoped lint has no errors
and six existing long-function warnings; new helpers stay within 50 lines.

The broader standalone virtualization run passed 24 cases and failed four
(two selection scenarios in both browsers). All four failures reproduced serially
on the final build and on an isolated baseline reconstructed from HEAD runtime
sources: block-2 remains mounted after receiving a native caret, while those tests
expect it to be absent. This baseline uses copied source files and only absolute
local tsconfig paths for relocation; no worktree/index files were swapped.
The final-boundary/no-spacer checks pass. Those selection scenarios were left
unchanged; full workspace checks were not run.

Production pointer measurements, default demo and repeat=200, three serial samples
per browser/size/placement; median [min–max], ms:

| Build / placement / browser / repeat | Synchronous move | Two-frame rendering proxy |
| ------------------------------------ | ---------------: | ------------------------: |
| before / start / chromium / 0        |    1.0 [0.9–1.1] |          31.6 [31.3–31.7] |
| before / start / chromium / 200      |    8.6 [8.4–8.9] |       353.8 [351.0–358.3] |
| before / start / firefox / 0         |    2.0 [2.0–2.0] |          32.0 [30.0–33.0] |
| before / start / firefox / 200       | 15.0 [15.0–16.0] |       383.0 [383.0–394.0] |
| before / end / chromium / 0          |    1.3 [1.2–1.5] |          31.1 [30.7–31.5] |
| before / end / chromium / 200        |    6.9 [6.7–8.3] |       117.1 [112.7–134.0] |
| before / end / firefox / 0           |    2.0 [1.0–2.0] |          31.0 [30.0–33.0] |
| before / end / firefox / 200         | 15.0 [14.0–16.0] |          92.0 [92.0–94.0] |
| after / start / chromium / 0         |    1.2 [0.9–1.3] |          31.3 [31.0–31.9] |
| after / start / chromium / 200       |    8.0 [7.9–9.0] |       346.0 [335.3–352.7] |
| after / start / firefox / 0          |    2.0 [2.0–2.0] |          32.0 [31.0–32.0] |
| after / start / firefox / 200        | 15.0 [15.0–16.0] |       378.0 [368.0–379.0] |
| after / end / chromium / 0           |    1.2 [1.2–1.3] |          31.4 [30.7–31.4] |
| after / end / chromium / 200         |    8.1 [7.6–8.5] |       117.7 [110.9–123.3] |
| after / end / firefox / 0            |    1.0 [1.0–1.0] |          31.0 [30.0–33.0] |
| after / end / firefox / 200          | 14.0 [13.0–17.0] |          92.0 [91.0–99.0] |

All 24 final measurements passed and assert the committed first/last canonical
root. Prepend uses the existing top area; append uses the existing trailing
control area, whose explicit declaration retains priority. The added free-space
append branch is additionally covered by native-pointer/undo checks and bounded
endpoint unit cases. Final timing runs used the isolated current production build,
no tracing, and no concurrent builds or browser tests. Baseline values reuse the
preceding padding implementation's isolated production measurements: its start
run after the fractional correction and its end run on the unchanged explicit
ending-target path. Saved assets were checked to contain the old padding
registration; current assets contain none. Timings remain comparable, with noisy
large-document rendering; no speedup or fix for that existing cost is claimed.
The pre-existing staged changes were preserved; this simplification is in the
working tree and has not been restaged.

### Continue edge strips into side gutters (2026-10-25)

Compared `main` at dca961c8cbd7893c009832746c27d1619308590e, especially
`extensions/block-drag/placement/resolver.ts`, `pointer/target.ts` and the fixed
layout metadata. Main resolved ordered-list background using its own list and
kept direct fixed-column card gaps from projecting into child placement. Its
whole-document collection/list scans were not copied. The user explicitly chose
continuation of existing top/bottom strips, with no new half-row targets in the
middle of side gutters.

The shared Page layout resolver now projects unoccupied cross-axis gutters onto
one registered linear item's existing edge strip. Native ownership, clipping to
the registered host, explicit exclusions and source acceptance stay in the same
path. Binary search and query-local rectangle caching avoid a full forest scan.
The original descriptor and actual pointer retain outline depth and merged/
separate feedback; gutter targets still pass registered pair-identity checks.
Physical linear gaps span that same host cross axis, preventing a dead patch
between the continued strips. Grid intersections and their separately declared
backgrounds remain unchanged; unmounted virtual intervals gain no targets.
Feedback stays at the same block boundary, independent of the wider hit area.

Kanban card lists use their existing `--rivto-drop-target-size` parameter at 16px
and `allowChildPlacement={false}` for direct card-edge bands. Their ordinary
outline context is retained, so nested outline ownership/outdent levels are not
reset by switching the entire list to sibling-only placement. Full-width direct
card edges insert in the column; bodies still accept nested content. The shared
edge cap is one third of its anchor axis, preserving a central body for small
nested blocks even when they inherit the larger token. No new public mode,
property, target wrapper, layout spacing or pointer handler was introduced.

Ownership/API review covered registered native-hit resolution, current mounted
layout snapshots and their cleanup, both pair/gutter geometry consumers, shared
BlockDropItem depth propagation and source/model validation, BlockChildren's
existing option and theme contracts, and the Kanban renderer/CSS owner. The new
pair-identity helper borrows only the selected element/region, preserving original
descriptor identity checks. No manager dependency, lifecycle ownership, command,
model shape or declaration union changed; size documentation now states its cap.

Regression evidence: the 24 initial gutter/card-edge cases failed on the isolated
pre-fix production build with 12 workers and again serially. Failure was missing
edge feedback at the requested positions, not fixture setup. Final tests verify
native versus continued feedback equality, neutral side middles, actual root/
child order and undo, first/last card edges across the width, and nesting into a
small descendant card body. The previous zero-leading-space test expected no
feedback where a continued first-item strip now intentionally exists. After its
two failures reproduced serially, its assertions were updated to prove no added
space above the root, a neutral side middle, and an active real item strip.

Final checks: 107 Page unit tests, one Kanban model/undo test, and all 218 selected
Chromium/Firefox DnD, rapid-release and Kanban browser checks passed. Behavioral
runs used 12 workers. Page/React/demo type checks, Page build and isolated demo
production build passed. Formatting passed and scoped lint has no errors; only
the existing long fixture/performance callbacks warn. New runtime helpers and the
modified pair resolver stay within 50 lines. Full workspace suites were not run.

Serial production measurements, three samples per browser/size/placement;
median [min–max], ms:

| Build / placement / browser / repeat | Synchronous move | Two-frame rendering proxy |
| ------------------------------------ | ---------------: | ------------------------: |
| before / gutter / chromium / 0       |    1.0 [1.0–1.3] |          31.1 [30.6–31.2] |
| before / gutter / chromium / 200     |    5.3 [4.8–5.3] |          80.0 [72.9–85.6] |
| before / gutter / firefox / 0        |    2.0 [1.0–3.0] |          32.0 [30.0–34.0] |
| before / gutter / firefox / 200      | 10.0 [10.0–11.0] |          75.0 [75.0–82.0] |
| before / card / chromium / 0         |    1.5 [1.4–1.9] |          31.4 [31.3–32.1] |
| before / card / chromium / 200       |    7.1 [6.4–7.3] |       115.5 [115.4–117.2] |
| before / card / firefox / 0          |    2.0 [2.0–2.0] |          31.0 [31.0–32.0] |
| before / card / firefox / 200        | 15.0 [15.0–16.0] |         98.0 [94.0–100.0] |
| after / gutter / chromium / 0        |    1.1 [1.1–1.2] |          31.3 [30.5–31.7] |
| after / gutter / chromium / 200      |    5.2 [5.2–5.8] |          71.6 [70.2–79.8] |
| after / gutter / firefox / 0         |    2.0 [1.0–2.0] |          31.0 [30.0–31.0] |
| after / gutter / firefox / 200       | 11.0 [10.0–11.0] |          74.0 [73.0–81.0] |
| after / card / chromium / 0          |    1.5 [1.5–1.7] |          31.1 [31.1–31.4] |
| after / card / chromium / 200        |    7.0 [6.9–7.1] |       109.0 [107.6–109.4] |
| after / card / firefox / 0           |    1.0 [1.0–2.0] |          31.0 [30.0–31.0] |
| after / card / firefox / 200         | 13.0 [13.0–16.0] |         96.0 [95.0–102.0] |

All 48 measurements passed and assert committed canonical order. Stock demo
registrations and default virtualization settings were retained at normal size
and repeat=200, with tracing off and no concurrent builds/browser tests. Baseline
uses an existing legal narrow native edge; the final build uses the continued
left gutter or the wider card edge at its center. Both perform the same source
move. Card assertions support the stock lane's one existing card without adding
a synthetic fixture. Costs are comparable; no rendering speedup is claimed.
New changes remain unstaged. The user committed the prior top/bottom work as
c325bc86 during this task; that commit and its unrelated content were preserved.

### Share container edge policy and stabilize nested controls (2026-10-25)

Kanban card lists, Bento tile lists and TODO storage now declare `targetSize={16}`
on `BlockChildren`. This shorthand sets the existing inherited CSS geometry token;
linear `BlockDropItem` and wrapping `BlockDropWrapper` read the same value. The
native spacing and one-third edge cap remain unchanged. Explicit style tokens take
precedence, and nested lists may override the inherited size. Ordinary editor lists
retain the existing 8px default.

Kanban and TODO storage omit direct-child append bands through the existing
`allowChildPlacement={false}` option. This preserves terminal descendant ancestry,
unlike switching an outline list to sibling-only placement. Direct edge strips sort
siblings across their full width; the center and nested bodies still accept inside
drops. Bento already declares sibling edges. Its bespoke content-end append strip
intersected the enlarged outer edge, so it was removed in favor of the same body
inside declaration. The former Bento inset-edge browser assertion now verifies a
real body drop and its persisted parent instead. The unused `contentRegions` wrapper
option and `indicatorInset` feedback option were removed after checking all callers;
the historical sections above describe the earlier implementations they supersede.

In-flow left-top controls previously grew when a collapse toggle appeared. A leaf's
handle and a branch's handle-plus-toggle therefore had different widths, consuming
most of the visible child indentation. Page now reserves two control positions
using the public control-size and slot-gap parameters. React's handle follows that
control size when inside a row, while its existing perimeter hitbox remains intact.
The collapse button also reads the control-size token through its own width utility,
so the host's former fixed-width utility cannot override a smaller public theme.
Default outline indentation still belongs to DefaultBlockLayout; custom container
hosts do not acquire an implicit indentation.

Ownership review covered BlockChildren -> BlockList -> BlockDropItem and
BlockDropWrapper -> useBlockDropRegions, plus container layout registrations,
BlockRow controls contexts, Page slot CSS and the React handle. No model shape,
controller dependency, object owner or subscription was added. Registration and
unmount cleanup retain the existing hooks. The new size option only supplies the
already-public style token; it does not register an extra region or allocate DOM.

Behavioral validation: the initial 36 new container-edge/nesting checks produced
24 failures and 12 passes on the isolated original production build. All 24
failures reproduced with one worker. The final main-demo run passed 380 checks
with 12 workers across Chromium and Firefox; two existing TODO keyboard-order
checks remain skipped. The standalone Page production demo passed six geometry
checks, including disabled demo CSS and public control sizes of 20px and 14px.
The tests assert real pointer moves, committed parent/order, undo, multilevel
indentation and stable content positions when a leaf becomes a branch or collapses.

The wider run also exposed two stale TODO test expectations already failing on
the original build in both browsers, confirmed serially. The storage's child inset
is its header inset plus outline indentation (31px = 7px + 24px), and inside feedback
belongs to the whole block shell. The assertions now check those contracts while
retaining the actual move result. The slash-create drag centers its real destination
before measuring the gesture, avoiding viewport-edge autoscroll in Firefox. Bento's
old inside-placement test now targets its central row and asserts hierarchy outline
instead of the removed content-end line. These were test corrections, not additional
runtime fixes to TODO filtering or slash commands.

Focused unit checks passed: 107 Page declaration/component checks and seven Kanban,
Bento and TODO-storage operation checks. Page/package and both demo production builds,
Page/React/main-demo type checks and formatting passed. Scoped ESLint has no errors;
14 length warnings remain in existing long functions and test callbacks. No full
workspace suite was run. The index present at task start was preserved; this task's
changes remain unstaged.

Production performance used the unchanged default demo and `?repeat=200`, with one
worker, tracing disabled and three samples per browser, size and placement. Both
runs passed all 36 samples and assert committed canonical hierarchy/order. The
existing card, Bento-seam and TODO-control scenarios exercise real native handles,
90 pointer moves, synchronous host commands and two-frame rendered completion.
The baseline uses the prior legal narrow card edge; the final run uses the wider
central edge. The transaction, document and browser settings are otherwise equal.
These measurements show comparable cost, not an application-wide speedup.

Times below are median [minimum–maximum], in milliseconds. Builds were served from
`/tmp/gutter-drop-validated` (before) and `/tmp/container-drop-complete` (after), on
isolated loopback previews. Logs: `/tmp/container-drop-perf-before.log` and
`/tmp/container-drop-perf-after.log`. No builds or other browser runs overlapped
these measurements.

| Browser  | Target  | Repeat | Sync before      | Sync after       | Rendered before     | Rendered after      |
| -------- | ------- | ------ | ---------------- | ---------------- | ------------------- | ------------------- |
| chromium | bento   | 0      | 1.6 [1.3–1.6]    | 1.7 [1.2–2.3]    | 31.5 [30.9–31.5]    | 31.3 [31.3–31.4]    |
| chromium | bento   | 200    | 7.2 [6.9–7.3]    | 7.2 [6.8–7.3]    | 99.7 [96.1–123.9]   | 97.0 [96.5–109.6]   |
| chromium | card    | 0      | 1.3 [1.2–1.5]    | 1.4 [1.2–1.4]    | 30.8 [29.8–32.0]    | 31.3 [30.6–31.3]    |
| chromium | card    | 200    | 7.0 [6.9–7.1]    | 7.0 [6.8–7.4]    | 109.4 [108.4–120.8] | 112.3 [110.8–113.5] |
| chromium | control | 0      | 1.4 [1.4–1.7]    | 1.5 [1.4–1.6]    | 31.8 [31.8–31.9]    | 31.8 [31.2–32.0]    |
| chromium | control | 200    | 10.3 [10.2–19.1] | 10.6 [10.0–10.8] | 61.2 [58.2–137.6]   | 59.4 [59.0–60.2]    |
| firefox  | bento   | 0      | 2.0 [1.0–2.0]    | 2.0 [1.0–2.0]    | 31.0 [31.0–32.0]    | 31.0 [31.0–32.0]    |
| firefox  | bento   | 200    | 14.0 [14.0–15.0] | 13.0 [13.0–14.0] | 88.0 [88.0–93.0]    | 87.0 [87.0–90.0]    |
| firefox  | card    | 0      | 2.0 [1.0–2.0]    | 1.0 [1.0–2.0]    | 32.0 [30.0–32.0]    | 30.0 [30.0–32.0]    |
| firefox  | card    | 200    | 15.0 [14.0–16.0] | 14.0 [14.0–14.0] | 96.0 [92.0–96.0]    | 93.0 [93.0–93.0]    |
| firefox  | control | 0      | 2.0 [2.0–2.0]    | 2.0 [2.0–3.0]    | 32.0 [31.0–33.0]    | 30.0 [28.0–31.0]    |
| firefox  | control | 200    | 20.0 [19.0–20.0] | 17.0 [17.0–19.0] | 92.0 [92.0–94.0]    | 90.0 [89.0–94.0]    |

### Select insertion across full row gutters (2026-10-25)

The user replaced the earlier strip-only requirement with full-row side coverage.
The local `main` resolver at `dca961c8cbd7893c009832746c27d1619308590e`
was inspected again: ordered background belongs to its own list, with canonical
before/after destinations and independently handled grid seams. The current Page
implementation keeps that ownership without importing main's global tree scans.

`resolveLayoutGutter` now chooses the existing before edge in the leading half
of a mounted item and its after edge in the trailing half. Horizontal lists use
inline halves with RTL reversal. The actual pointer still selects declared
outline depth, and the existing sibling-pair resolver preserves merged/separate
feedback. Missing edges, zero-size edges, explicit exclusions, rejected moves and
unmounted intervals do not invent targets or fall through into another layout.
Inside-body declarations and top/bottom inset strips remain independent.

Wrapping grids use the same rule only in exposed side gutters outside the first
or last tile of an aligned row. Inter-tile seams keep their original axis and
canonical boundary; background underneath a shorter tile keeps the parent's
background append declaration. `layoutRowRange` shares the existing binary row
search between gutter and gap lookup. The scope remains the registered list's
actual bounds; no layout boxes, padding, whole-document search or container-type
branches were added. `dropGaps={false}` still disables layout gutter resolution.

The helper contract review covered BlockChildren/BlockDropLayout registration,
BlockList/BlockDropWrapper anchors, BlockDropTargets discovery and permission,
and feedback/commit consumers. The new private item helper receives only the
flow axis and cached reads it uses. No public API, controller dependency,
subscription, lifecycle owner or cleanup path changed.

Browser regressions now enter the side gutter at 45% and 55% of the row height,
beyond either inset strip. The 16 root cases failed on the original production
build with 12 workers, and all failures reproduced with one worker. An additional
48 container cases cover Kanban, Bento and TODO storage on Page and Edgeless,
including actual parent/order and undo. Kanban's card-list host has no default
inline padding, so that fixture supplies native list padding to exercise the
same registered layout extension point; it creates no hit-area DOM. The zero-top-
space test retains its no-spacer assertions while accepting the new row gutter.

Unit coverage checks vertical/horizontal and RTL halves, declared-edge identity,
zero/missing edges, source rejection, grid seams, short-tile background and
bounded rectangle reads with 5 and 2,000 mounted items. Both actual physical gaps
and middle-of-row gutters stay within ceil(log2(item count)) + 2 rectangle reads.

Final verification passed: 428 main-demo browser checks with 12 workers across
Chromium and Firefox, 112 focused Page unit checks, Page/package and production
demo builds, Page/React/demo type checks, formatting and diff whitespace checks.
The two existing TODO keyboard-order browser cases remain skipped. Scoped lint
has no errors and two existing long-test-function warnings. The full workspace
suite was not run, and the pre-existing index was preserved.

Production pointer performance passed 12 before and 12 after samples: three per
browser at default size and `?repeat=200`, with one worker and tracing disabled.
Each sample performs 90 pointer movements and asserts the actual committed order.
The baseline uses its legal inset edge; the final gesture enters the left gutter
at 55% row height. Both commit the same canonical gap. No build or other browser
run overlapped these measurements. Cost is comparable; this is not a speedup claim.
The original and final builds were served from `/tmp/container-drop-complete` and
`/tmp/row-gutter-final`; raw logs are `/tmp/row-gutter-perf-before.log` and
`/tmp/row-gutter-perf-after.log`.

Times are median [minimum–maximum] in milliseconds. Rendered completion is the
existing two-animation-frame proxy after the synchronous host move command.

| Browser  | Repeat | Sync before     | Sync after      | Rendered before  | Rendered after   |
| -------- | ------ | --------------- | --------------- | ---------------- | ---------------- |
| chromium | 0      | 1.0 [1.0–1.1]   | 1.0 [1.0–1.3]   | 31.2 [30.4–31.5] | 31.1 [30.9–32.0] |
| chromium | 200    | 5.3 [5.1–5.3]   | 5.5 [5.1–5.8]   | 72.8 [71.1–79.7] | 73.2 [69.5–76.8] |
| firefox  | 0      | 2.0 [2.0–3.0]   | 2.0 [1.0–2.0]   | 30.0 [29.0–31.0] | 31.0 [30.0–32.0] |
| firefox  | 200    | 10.0 [9.0–11.0] | 10.0 [9.0–10.0] | 75.0 [73.0–82.0] | 75.0 [72.0–81.0] |

### Reserve collapse width only when the block has children (2026-10-25)

The user requested removing the empty collapse position from leaves. The shared
inside slot no longer has a two-control minimum width; it sizes naturally from
its rendered controls. React already returns no collapse button when the canonical
child ID list is empty, so no new property, model subscription, DOM attribute or
container-specific selector is needed. In-flow branches occupy handle + toggle +
gap, while leaves occupy only their handle. Collapsing a branch retains the toggle;
removing its final child releases the toggle and its horizontal space.

This intentionally replaces the earlier constant-width invariant: acquiring a first
child now shifts in-flow text by one control size plus one slot gap. The shared
outline host retains its own indentation, independently of that conditional control
width. Tests verify physical subtree indentation and visible nested text offsets,
rather than requiring leaves and branches to start at the same text coordinate.
They cover first-child insertion, collapse, final-child deletion and public control
size changes on Page and Edgeless in Kanban, Bento and TODO storage. The standalone
Page check uses package CSS with demo chrome disabled and 20px/14px control sizes.

Baseline main-demo checks produced eight failures and four passes; all eight
failures reproduced with one worker. TODO storage already uses outside controls,
so its four unchanged cases passed. Runtime ownership is unchanged: the Page slot
owns geometry and existing React/Page collapse contributions decide visibility
from canonical child IDs, including when descendants are collapsed or unmounted.

Final verification: 428 main-demo browser checks passed with 12 workers across
Chromium and Firefox; the two existing TODO keyboard-order cases remain skipped.
Six standalone Page checks passed, including disabled demo CSS and public theme
overrides. The published Page CSS and both production demo builds passed. Formatting,
diff whitespace and scoped ESLint passed; one existing long-fixture warning remains.
No Jest check was added for this CSS deletion: browser measurements cover the actual
rendered width and child transitions. No full workspace suite was run. The existing
index was preserved; these changes remain unstaged.

The existing Kanban card DnD benchmark passed 12 before and 12 after samples on the
default demo and `?repeat=200`, serially with tracing disabled and three samples per
browser/size. Every sample asserts the committed card order after real pointer
input. An additional 12 inside-drop baseline samples passed as an adjacent control;
only the paired card samples are compared below. Builds and other browser tests
were not run concurrently with the measurements. The before build was
`/tmp/row-gutter-final`; the after build was `/tmp/collapse-space-after`.

Times are median [minimum–maximum] in milliseconds. Rendered completion uses the
existing two-frame proxy after the synchronous host move. Cost remains comparable.
Raw logs: `/tmp/collapse-space-card-perf-before.log` and
`/tmp/collapse-space-card-perf-after.log`.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before     | Rendered after      |
| -------- | ------ | ---------------- | ---------------- | ------------------- | ------------------- |
| chromium | 0      | 1.4 [1.2–1.6]    | 1.4 [1.3–1.4]    | 31.2 [31.1–31.4]    | 30.9 [30.8–31.2]    |
| chromium | 200    | 7.1 [6.9–8.4]    | 6.9 [6.9–7.0]    | 113.0 [108.3–115.6] | 119.7 [107.2–120.8] |
| firefox  | 0      | 2.0 [1.0–2.0]    | 2.0 [2.0–2.0]    | 31.0 [30.0–32.0]    | 30.0 [30.0–31.0]    |
| firefox  | 200    | 14.0 [12.0–14.0] | 14.0 [13.0–15.0] | 94.0 [92.0–94.0]    | 92.0 [90.0–93.0]    |

### Preserve nested text indentation with conditional controls (2026-10-25)

The previous natural-width-only change reintroduced the reported nested text bug.
With a 20px control and 4px control gap, the parent's extra 24px collapse contribution
cancelled a 24px outline indent. The earlier test compared subtree boxes at the
first level and switched to 14px controls before adding a second level, so it did
not catch the default-theme text alignment regression. The new checks assert the
actual paragraph content coordinate, not merely a block shell's indentation.

Reproduction on the original production build showed `nested` and `deep` at the
same X coordinate (0px difference). A screenshot was inspected before and after;
the corrected default difference is 24px. The before/after captures are preserved
as `/tmp/nested-indent-before.png` and `/tmp/nested-indent-after.png`. The corrected
serial baseline produced 16 real failures in Kanban/Bento and eight passes in TODO
storage, whose controls are outside. An initial fixture iteration also left the
parent collapsed between theme samples; that setup error was corrected before
classifying the serial regression results.

Ordinary outline layout now compensates the parent's inline collapse width for
child rows that do not render their own toggle. The entire leaf row and handle
move together; its control slot retains natural width. A branch already has its
own toggle and needs no compensating row offset. Direct leaves in container lists
keep their natural width with no empty collapse position. The internal
`--rivto-outline-control-offset` resets at custom child hosts and autonomous editor
roots, preventing compensation from leaking across layout/surface boundaries.
A standalone toggle contributes its own width without a nonexistent neighboring
gap. Control sizes, control gaps and outline indentation use existing public theme
tokens; no new public geometry option or container-type switch was added.

The existing React collapse marker `data-collapse-toggle` is now also emitted by
Page's native collapse contribution. This shares the semantic marker without
opting the host button into Page's separate `data-block-control` styling. Its
presence follows the existing canonical child-ID condition and ordinary React
mount/unmount. The owning paths inspected were DefaultBlockLayout, BlockChildren,
BlockRow, BlockSlots, native/host collapse contributions and editor-root CSS. No
new subscription, context, DOM wrapper, geometry observer, manager reference or
lifecycle resource was introduced. The direct row/child relationships belong to
the ordinary outline composition; concrete container renderers remain unchanged.

Final checks passed: 440 main-demo browser tests with 12 workers in Chromium and
Firefox, six standalone Page geometry/theme tests with demo CSS disabled, and 56
Page component unit tests. The two existing TODO keyboard-order cases remain
skipped. The 24 focused regression cases cover Page/Edgeless, all three containers,
LTR/RTL, 20px controls with 24px indentation and 14px controls with 12px indentation,
first-child insertion, collapse and final-child removal. The standalone one-toggle
case also asserts actual text indentation while its leaf control slot stays 0px.
Page/package and both demo builds, Page/React/demo types, formatting and whitespace
checks passed. Scoped ESLint has no errors and four existing long-function warnings.
The full workspace suite was not run. The pre-existing Git index was preserved.

The existing native Kanban card DnD benchmark passed 12 before and 12 after samples
on default size and `?repeat=200`, with three samples per browser/size, one worker
and tracing disabled. Every sample asserts the committed card order. Builds and
other browser runs did not overlap measurements. Cost is comparable within these
samples, not a speedup claim. Raw logs: `/tmp/nested-indent-perf-before.log` and
`/tmp/nested-indent-perf-after.log`; production builds: `/tmp/collapse-space-after`
and `/tmp/nested-indent-after`.

Times are median [minimum–maximum], in milliseconds. Rendered completion is the
existing two-frame proxy after the synchronous host move command.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before     | Rendered after      |
| -------- | ------ | ---------------- | ---------------- | ------------------- | ------------------- |
| chromium | 0      | 1.6 [1.3–1.9]    | 1.2 [1.1–1.3]    | 30.8 [27.9–31.1]    | 31.4 [30.8–31.5]    |
| chromium | 200    | 7.2 [6.9–7.8]    | 7.1 [7.0–7.3]    | 117.5 [111.6–124.3] | 108.7 [108.0–109.9] |
| firefox  | 0      | 2.0 [2.0–3.0]    | 2.0 [2.0–2.0]    | 32.0 [30.0–32.0]    | 30.0 [29.0–30.0]    |
| firefox  | 200    | 14.0 [13.0–14.0] | 15.0 [14.0–16.0] | 93.0 [93.0–95.0]    | 94.0 [91.0–98.0]    |

## Shared own-content geometry and inside feedback — 2026-10-25

The regression was shared by ordinary outlines and container children. Edge inset
thickness was limited by the complete shell, whose height grows with descendants.
A 16px inherited edge could therefore consume the center of a populated block's
28px own row. Independently, an outline edge could select an inside destination
while retaining a between-line indicator. The previous leaf/edge checks did not
exercise the center of a populated block's own content.

BlockContent now registers its existing DOM ref as an occurrence-local content
region, alongside the existing shell and row roles. Shared Page geometry protects
the middle third of this owned content, falling back to the primary row when
content is omitted or empty. It still respects the shell's one-third cap, local
scale, logical direction and existing padding. The lookup reads registered owner
regions only: no global DOM scan, descendant body inference, virtual-hole fill,
extra wrapper, geometry observer or container-specific resolver was introduced.

BlockDropTargets now normalizes every validated inside action, including an
outline-derived action, to the receiving complete shell and removes its line.
BlockDropFeedback selects outline versus line from the destination kind, without
reading model state or geometry. Between placement retains its shared/separate
line. Canonical permission and commit revalidation keep their existing owners.
The contract is documented in the Page layout README and the blocks, containers
and performance-testing skills; the block skill's obsolete React BlockTree and
registration examples were replaced with the current Page/host APIs.

Ownership review covered BlockContent/useBlockRegion, BlockLayoutRegions, the
controller and borrowed editor API, drop geometry, target validation and feedback.
The controller retains one concrete registry and destroys it. Primitive refs
register/release their own DOM lifetime; consumers borrow only register/get or get
capabilities. The weak registration lookup exposes no lifecycle API and stays
internal to the package. Geometry consumes declared bounds, validation consumes
canonical destinations, and feedback consumes the resolved frame. No concrete
block types, host editor dependencies or presentation-policy callbacks were added
to the shared resolver. Existing container declarations remain layout policy.

The new browser matrix covers ordinary outlines, Kanban, Bento and TODO storage
in Page and Edgeless, both first-level and nested populated bodies, target sizes
8/16/32, edge-derived nesting, complete outline feedback, committed child order
and undo. On the original production build, 64 cases failed and 48 passed with
12 workers; all 64 failures reproduced serially with the wrong between feedback.
After the fix, 552 main-demo checks passed with 12 workers in Chromium/Firefox,
including the new matrix and existing indentation, selection, controls, container
and rapid-release scenarios. Six standalone Page theme/geometry cases passed in
both browsers. Two existing TODO keyboard-order cases remain skipped. Focused
Page unit suites passed 123 checks, including horizontal RTL content protection,
registered-only lookup/replacement/cleanup and feedback transitions. Page/host/demo
type checks, package and both demo builds, scoped lint, formatting and skill
validation passed; scoped lint retains one existing long-load-function warning.
The full workspace suite was not run, and the existing Git index was preserved.

The production native Kanban-card benchmark passed 12 before and 12 after samples
at normal size and `?repeat=200`, three samples per browser/size, one worker and
tracing disabled. All samples assert the committed order. No builds or other
browser tests overlapped measurements. Synchronous cost and rendered completion
remain comparable within these samples; this is not a speedup claim. The latter
is the existing two-animation-frame proxy. Builds: `/tmp/nested-indent-after` and
`/tmp/shared-drop-after`; logs: `/tmp/shared-drop-perf-before.log` and
`/tmp/shared-drop-perf-after.log`.

Times are median [minimum–maximum], in milliseconds.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before     | Rendered after      |
| -------- | ------ | ---------------- | ---------------- | ------------------- | ------------------- |
| chromium | 0      | 1.2 [1.1–1.3]    | 1.2 [1.2–1.3]    | 31.7 [31.5–31.8]    | 31.7 [31.5–31.8]    |
| chromium | 200    | 6.9 [6.7–7.0]    | 6.8 [6.7–6.8]    | 114.0 [113.0–120.7] | 115.2 [108.8–129.7] |
| firefox  | 0      | 1.0 [1.0–2.0]    | 2.0 [1.0–2.0]    | 31.0 [30.0–32.0]    | 31.0 [30.0–31.0]    |
| firefox  | 200    | 14.0 [13.0–15.0] | 14.0 [14.0–14.0] | 93.0 [92.0–95.0]    | 94.0 [92.0–95.0]    |

## Restore shared outline nesting outside container content — 2026-10-25

The previous own-content fix did not restore the reported boundary gesture.
During the earlier full-width sibling-zone adjustment, Kanban and TODO storage
had explicitly disabled direct-child append bands with allowChildPlacement=false.
Bento retained sibling-only wrapper edges after its custom content-end region was
removed. Body drops and nesting in deeper ordinary rows therefore passed while
indented direct-card boundaries could not nest. The relevant layout restrictions
were in the existing working changes; they are not new restrictions from main.

Linear BlockDropItem shells and wrapping BlockDropWrapper items now call the same
useBlockDropEdges builder. BlockList passes its existing dropPlacement policy in
canonical item context. Grid block-end edges expose the same outline nesting
bands as linear items; inline grid seams still sort siblings. Wrapping items
provide their trailing ancestry around the existing subtree, so terminal children
can use those canonical levels. Kanban cards, TODO items and Bento tiles retain
outline placement. Structural column collections keep their deliberate siblings
policy. The redundant allowChildPlacement API was removed throughout its callers;
there is no separate per-container pointer algorithm or replacement option.

The item/context path was reviewed separately from behavior. BlockChildren owns
canonical traversal, BlockList passes parent/neighbors and placement policy, the
shared hook builds declarations, and each existing item owns registration cleanup.
Linear BlockDropItem stays inside its optional filtering item. Grid/projection
depth reset surrounds the wrapper, allowing that wrapper to supply its own depth
to descendants. No host manager, permission capability, lifecycle wrapper or extra
DOM was added. Native discovery and live canonical permission/commit validation
retain their existing owners. The new context field has the wrapper as its current
consumer; the removed option has no remaining runtime consumers.

New native-input checks distinguish lower edges, physical gaps and exposed row
gutters from body drops on direct children, with ordinary outlines as a control,
in Page and Edgeless. On the unchanged production build, 12 ordinary-outline cases
passed and all 36 container cases failed; the 36 failures reproduced serially.
All 48 passed after the fix, asserting complete receiving feedback, committed
children and undo. Existing sibling tests now exercise the leading depth band;
they no longer incorrectly require the indented band to sort siblings. Before
edges and inline grid seams retain their ordinary sorting assertions.

The first broad run caught a filtering lifetime regression in the context change:
a hidden linear item retained its old anchor when its boundary owner surrounded
the filter. Both browser failures reproduced serially. Keeping the boundary owner
inside the filtering item fixed it. A generic unit regression now checks visible,
hidden and restored mounted anchors while canonical hidden neighbors remain.
The final broad run passed 600 checks in Chromium/Firefox with 12 workers. After
factoring the outline boolean without changing policy, the exact final production
build passed all 50 boundary/filter checks, plus six standalone Page geometry/theme
checks. Four focused unit suites passed 126 tests, including wrapping outline versus
siblings policy, terminal ancestry, and reactive filtering. Page/host/demo types,
package and both demo builds, formatting, skill validation and scoped lint passed.
Scoped lint retains existing long-function warnings. Two existing TODO keyboard
order cases remain skipped; the full workspace suite was not run. The pre-existing
Git index was preserved. Container and performance-testing skills now require
outside-content boundary checks separately from body-only coverage.

The native Kanban-card benchmark passed 12 before and 12 after samples using the
same leading sibling-band point on unchanged/final production builds, default
size and `?repeat=200`, three repetitions per browser/size, one worker, tracing
disabled. Moving the point from the old full-width band's center to the leading
band preserves the measured sibling operation under the restored outline policy.
All samples assert the committed order; no builds or other tests overlapped the
measurements. Results remain comparable within these samples, not a speedup claim.
Rendered completion remains the existing two-animation-frame proxy. Builds:
`/tmp/shared-drop-after` and `/tmp/edge-nesting-final`; logs:
`/tmp/edge-nesting-perf-before.log` and `/tmp/edge-nesting-perf-after.log`.

Times are median [minimum–maximum], in milliseconds.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before     | Rendered after      |
| -------- | ------ | ---------------- | ---------------- | ------------------- | ------------------- |
| chromium | 0      | 1.3 [1.3–1.3]    | 1.4 [1.2–1.5]    | 31.3 [30.8–31.4]    | 31.3 [30.3–31.7]    |
| chromium | 200    | 7.1 [7.0–8.0]    | 7.3 [7.1–8.2]    | 112.0 [109.7–114.5] | 110.7 [107.7–125.4] |
| firefox  | 0      | 1.0 [1.0–2.0]    | 2.0 [1.0–2.0]    | 31.0 [30.0–31.0]    | 31.0 [31.0–32.0]    |
| firefox  | 200    | 14.0 [13.0–14.0] | 14.0 [13.0–17.0] | 93.0 [93.0–93.0]    | 93.0 [92.0–107.0]   |

## Correct boundary-line feedback independently of inside destination — 2026-10-25

The earlier feedback normalization was incorrect. It discarded an edge/gap's
indicator whenever its canonical destination was inside, replacing an indented
insertion line with a whole-block outline. The subsequent tests encoded that same
mistake by expecting a body outline at the boundary. A fresh body-hover check was
therefore green while the requested visible line in the gap had disappeared.

The common resolver now preserves supplied boundary geometry. It attaches the
receiving shell outline only for inside regions without an insertion line.
BlockDropFeedback similarly honors a supplied line, including child append, and
uses the complete receiving shell for body/background inside regions without a
line. Moving between these regions releases the previous outline or hides the
retained line. No container renderer, geometry algorithm, permission rule, model
mutation path or public configuration option was changed for this repair.

The corrected contract is documented in Page's public/layout READMEs, the indicator
type and the blocks/containers/performance-testing skills. Region feedback and
canonical destination are independent: inside may mean a body hover or a child
insertion through a boundary, so destination kind alone cannot select decoration.
The source gesture and foreign receiving attachment both borrow the same feedback
class. Their creation/update/clear/destruction paths and the resolver's frame
lookup were reviewed; no lifecycle or dependency interface change was needed.

New tests move across both edges and their physical gap at sibling and child
levels, reverse horizontal direction, enter the content body, return to the gap,
commit either sibling or child insertion, and undo it. They run on ordinary
outlines, Kanban, Bento and TODO storage in Page/Edgeless and LTR/RTL. The line's
measured depth and fixed Y are checked at each point; its actual screenshot pixel
must match the visible opaque indicator color. A body hover must instead show the
receiving outline with no line. These checks failed all 64 browser cases before
the repair with 12 workers; all 64 failures reproduced with one worker. The two
focused unit regressions also failed before the repair: the resolver erased the
line and feedback retained the body outline for the same receiving parent.

After the repair all 64 new cases pass. The affected main-demo suites pass 664
checks with 12 workers in Chromium/Firefox, plus six standalone Page geometry/theme
checks. Four focused Page unit suites pass 126 tests. These include cleanup when
switching body/line feedback and fixed-depth geometry across both sides of a gap.
A representative complete screenshot was inspected and saved outside the repo at
`/tmp/drop-visible-line.png`. Page/host/demo types, package and both demo builds,
formatting, skill validation and scoped lint passed. Scoped lint retains the
existing 59-line load-helper warning. Two existing TODO keyboard-order cases remain
skipped; the full workspace suite was not run. The existing Git index was preserved.

The existing production native Kanban-card sibling benchmark passed 12 after
samples, compared with the 12 recorded samples on the exact preceding production
build `/tmp/edge-nesting-final` using the same benchmark and leading-band point.
This benchmark covers common DnD cost; the new boundary/body correctness matrix
separately verifies the changed child-insertion paint. Both sizes (default and
`?repeat=200`) and both browsers use three repetitions, one worker and tracing off,
with committed order assertions. No agent-run builds or other browser tests
were active during the after measurements. Results remain comparable within these
samples. Rendered completion is the existing two-animation-frame proxy. Raw logs:
`/tmp/edge-nesting-perf-after.log` and `/tmp/drop-visible-perf-after.log`; the new
production build is `/tmp/drop-visible-after`.

Times are median [minimum–maximum], in milliseconds.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before     | Rendered after      |
| -------- | ------ | ---------------- | ---------------- | ------------------- | ------------------- |
| chromium | 0      | 1.4 [1.2–1.5]    | 1.3 [1.2–1.3]    | 31.3 [30.3–31.7]    | 31.7 [31.4–31.8]    |
| chromium | 200    | 7.3 [7.1–8.2]    | 7.6 [7.1–8.2]    | 110.7 [107.7–125.4] | 110.5 [107.1–111.2] |
| firefox  | 0      | 2.0 [1.0–2.0]    | 2.0 [1.0–2.0]    | 31.0 [31.0–32.0]    | 31.0 [31.0–31.0]    |
| firefox  | 200    | 14.0 [13.0–17.0] | 14.0 [14.0–14.0] | 93.0 [92.0–107.0]   | 93.0 [91.0–96.0]    |

## Keep Bento background append separate from row-gutter continuation — 2026-10-25

The reported point was on Bento's free background; its header still accepted an
inside drop. Declared background append existed, but inferred row-gutter boundary
continuation took priority over it. Hovering exposed side space therefore selected
insertion beside/under a tile instead of appending a tile to the board.

The shared layout now exposes gutters, mapped from BlockChildren.dropGutters.
Omission preserves existing continuation when gaps are enabled. Explicit false
skips only the inferred row-gutter action; native item edges, real physical seams,
outline depth and declared background regions retain their existing behavior.
Bento declares dropBackground, dropGaps and dropGutters=false: the board background
appends to Bento while actual tile boundaries retain their insertion lines. Other
layouts retain the default continuation. No type switch or custom pointer handler
was added to Page, and presentation dimensions and DOM structure are unchanged.

The API/ownership path reviewed was BlockChildren props, useBlockDropLayout's
committed options/getter, borrowed BlockDropLayoutRegistration and the bounded
resolveLayoutGutter read. The existing host ref owns installation and cleanup;
there is no new subscription, observer, manager reference or lifecycle resource.
Bento is a present consumer of the new declaration. Shared direct registration
and component tests cover true/false policy, preserved physical gaps, one child
occurrence and no dropGutters HTML attribute. Defaults and documentation were
updated in the public/layout READMEs and container skill.

A new native-input matrix asserts actual background hits on both side gutters and
bottom padding in Page/Edgeless, full receiving-board outline, canonical append and
undo without nesting in either tile. Before the fix, all eight side-background
cases failed and four bottom-background controls passed; the eight failures
reproduced serially. All twelve pass after the fix. Existing Bento gutter cases
now assert its explicitly declared background policy; physical edge/seam and depth
assertions remain. The final affected suites pass 676 checks with 12 workers in
Chromium/Firefox, plus six standalone Page geometry/theme checks. Focused Page
unit suites pass 130 tests. A complete background-outline screenshot was inspected
and saved at /tmp/bento-background-inside.png.

Page/React/demo type checks, Page/package and both demo builds, formatting, skill
validation and scoped lint passed. Scoped lint retains existing long-function
warnings. Two existing TODO keyboard-order cases remain skipped, and the full
workspace suite was not run. This run performed no staging; index updates made
concurrently were left untouched.

The native Bento seam benchmark passed 12 before and 12 after samples on production
builds /tmp/drop-visible-after and /tmp/bento-inside-after, default size and
`?repeat=200`, three samples per browser/size, one worker, tracing disabled. All
samples assert the same committed sibling order. The initial unchanged/changed
benchmark attempts both failed their existing order assertion: on a wrapped row
the old midpoint selected the newly supported child-depth band. The benchmark now
uses the leading sibling band for that wrapped seam, without weakening the order
assertion or timing budget; identical corrected input was measured on both builds.
No builds or other browser runs overlapped the paired measurements. Results remain
comparable within these samples. Rendered completion is the existing two-frame
proxy. Raw paired logs are /tmp/bento-inside-perf-before-fixed.log and
/tmp/bento-inside-perf-after-fixed.log; initial failed logs retain the unsuffixed
before/after names.

Times are median [minimum–maximum], in milliseconds.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before   | Rendered after   |
| -------- | ------ | ---------------- | ---------------- | ----------------- | ---------------- |
| chromium | 0      | 1.3 [1.2–1.3]    | 1.4 [1.2–1.5]    | 29.6 [29.3–31.5]  | 29.5 [28.5–29.6] |
| chromium | 200    | 7.0 [6.8–7.1]    | 7.0 [7.0–7.1]    | 81.8 [81.6–100.9] | 83.2 [80.8–98.6] |
| firefox  | 0      | 2.0 [1.0–2.0]    | 2.0 [1.0–2.0]    | 31.0 [31.0–32.0]  | 30.0 [30.0–31.0] |
| firefox  | 200    | 15.0 [14.0–17.0] | 15.0 [14.0–15.0] | 89.0 [86.0–90.0]  | 90.0 [89.0–91.0] |

## Configure numeric row-gutter distance instead of a boolean — 2026-10-25

The accepted API replaces dropGutters/gutters with dropGutterSize/gutterSize.
The public BlockDropGutterSize type accepts finite nonnegative local CSS pixels or
row. Zero disables continuation; row (including omission) retains the complete
host cross axis. Bento declares 16px: nearby side space continues its tile boundary,
while farther background appends to the board. Physical seams, native item edges,
canonical depth choices and host clipping keep their existing owners. No deprecated
boolean alias, new hitbox DOM or presentation spacing was added.

The shared gutter resolver measures cross-axis distance from the selected item's
existing bounds and applies its query-local scaleX/scaleY. Vertical/grid gutters
use X distance, horizontal gutters use Y distance. The finite boundary is inclusive;
negative and nonfinite numeric extents throw when the gutter is resolved. The helper
adds no DOM measurement, cache, model traversal, subscription or lifecycle resource.
The complete API path reviewed was the public type export, BlockChildren prop,
committed BlockDropLayout options/getter, borrowed registration and geometry read.
Consumers use the same registration object and existing cleanup. Bento is a current
numeric consumer; explicit zero/row retain the user-requested disabled/full-row modes.
Public/layout READMEs and the container skill document defaults, units and scaling.

Six new geometry/validation cases failed on the old implementation before edits;
all pass after the change. Numeric tests cover both cross-axis sides in vertical,
horizontal and grid flow under 2x scaling, using viewport distances 31.5/32/32.5 for
a 16px local limit. Additional checks preserve physical gaps and exercise omitted,
zero, numeric and row settings through the public component without leaking props
to HTML or duplicating children. The four focused Page suites pass 140 tests.

All sixteen new native-input cases failed on the previous production build and
reproduced serially: the old disabled Bento gutter could not provide the requested
near-tile continuation. The new tests sweep near/on/beyond the 16px boundary in
Page/Edgeless and LTR/RTL, commit both child and board placement, and undo them.
Firefox's native pointer delivery floors half-pixel X coordinates: a requested
16.5px right-side distance arrived as 16px, while 17px arrived as 17px. The initial
four Firefox-only far-point failures reproduced serially and were diagnosed from
delivered pointer events. Browser checks therefore use 15/16/17px; fractional
limits remain covered by DOM-free unit geometry. No runtime tolerance or timing
budget was widened. All sixteen cases pass with those actual cross-browser inputs.

The final affected main-demo suites pass 692 checks in Chromium/Firefox with
12 workers, plus six standalone Page geometry/theme checks. Page/React/demo types,
Page/package and both demo builds, formatting, skill validation and scoped lint
passed. Scoped lint retains existing long-function warnings. Two existing TODO
keyboard-order cases remain skipped; the full workspace suite was not run. No
staging was performed by this run.

The production native Bento sibling-seam benchmark passed twelve after samples,
compared with the twelve recorded samples on the exact preceding build using the
same leading-band point and unchanged benchmark. Both browsers and default size /
`?repeat=200` use three repetitions, one worker, tracing off, and assert committed
sibling order. This covers common Bento DnD cost; the new correctness matrix covers
the finite gutter/background transition. No agent-run build or other test overlapped
the after timings. Rendered completion is the existing two-frame proxy; measured
cost remains comparable within these samples. Builds: /tmp/bento-inside-after and
/tmp/gutter-size-after. Logs: /tmp/bento-inside-perf-after-fixed.log and
/tmp/gutter-size-perf-after.log.

Times are median [minimum–maximum], in milliseconds.

| Browser  | Repeat | Sync before      | Sync after       | Rendered before  | Rendered after   |
| -------- | ------ | ---------------- | ---------------- | ---------------- | ---------------- |
| chromium | 0      | 1.4 [1.2–1.5]    | 1.4 [1.2–1.4]    | 29.5 [28.5–29.6] | 29.2 [29.0–31.5] |
| chromium | 200    | 7.0 [7.0–7.1]    | 7.0 [7.0–7.1]    | 83.2 [80.8–98.6] | 85.2 [83.2–92.8] |
| firefox  | 0      | 2.0 [1.0–2.0]    | 2.0 [1.0–2.0]    | 30.0 [30.0–31.0] | 31.0 [31.0–32.0] |
| firefox  | 200    | 15.0 [14.0–15.0] | 14.0 [14.0–14.0] | 90.0 [89.0–91.0] | 87.0 [87.0–89.0] |

## Extend numeric item surroundings on all four sides — 2026-10-25

Numeric dropGutterSize now expands the complete item rectangle, including exposed
top/bottom edges and corners, using local scale on both axes and host clipping.
The row setting retains its legacy cross-axis continuation. Candidate lookup uses
binary searches in the containing and adjacent flow rows, with at most two local
anchors per row, rather than a global nearest-block scan. Virtual-hole restrictions
remain; registered endpoint and consecutive-neighbor gaps retain their ownership.
Existing edge declarations supply before/after, depth and canonical destinations.
No type-specific pointer logic, layout boxes or new API flags were introduced.

Physical gap lookup now precedes inferred expansion; a second local pass can
normalize an inferred edge against its shared canonical boundary. This priority
fix resolved two Chromium fractional-seam failures (both reproduced serially)
caught by the first focused browser run. The corrected focused run passes all 56
selected Bento cases in Chromium/Firefox: top/bottom and left/right 31/32/33px
transitions, board background, short-tile background, physical seams, commit and
undo in Page/Edgeless. The sole geometry unit file passes 77 cases, including all
four sides/corners under scale, adjacent rows, seam priority and a 1000-item grid
with fewer than 100 measured anchors. Page types/package build, main-demo build,
formatting and focused lint pass; lint retains the existing long-load warning.

Only these focused checks were run at the user's request. No whole editor suite,
full workspace run or separate browser timing benchmark was launched. The large-
grid measurement-count regression covers the newly added lookup's bounded work.
Ownership review covered the shared layout resolver, query-local cache, declared
regions and unchanged commit validation; the new private helpers borrow geometry
and declarations without adding managers, subscriptions or lifecycle resources.

## Match numeric grid-gutter feedback to the exposed side — 2026-10-25

The all-side expansion initially retained the old row-half selector, so its side
areas still proposed block edges and painted horizontal lines. Numeric grid
surroundings now select inline edges on the exposed left/right side and block
edges above/below; corners retain the existing block-edge priority. Logical inline
sides respect RTL. Linear layouts and the row setting retain their established
flow-based declarations; missing/disabled edges are not invented. Physical seams
still resolve first. No public API, renderer or lifecycle dependency was added.

The focused geometry file passes 79 tests, including explicit line orientation,
four sides/corners, RTL and bounded large-grid work. The same 56 selected Bento
browser checks pass in Chromium/Firefox with 12 workers, now asserting vertical
side feedback and horizontal top/bottom feedback, persisted destinations and undo.
Side continuation sorts tiles rather than nesting them; body and indented bottom
placement retain nesting. Page types/package build, main-demo build and focused
lint pass, with only the existing long-load-helper warning. No broad editor suite
or separate timing benchmark was run, following the requested narrow test scope.
