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
| --- | --- | --- |
| chromium / control / 0 | 1.3 [1.2–1.3] | 31.7 [31.2–31.7] |
| chromium / control / 200 | 9.2 [9.2–10.1] | 57.8 [57.5–58.0] |
| chromium / bento / 0 | 1.3 [1.3–1.4] | 31.6 [31.4–31.7] |
| chromium / bento / 200 | 7.0 [7.0–7.1] | 100.1 [95.5–110.9] |
| chromium / end / 0 | 1.2 [1.1–1.2] | 31.2 [31.0–31.6] |
| chromium / end / 200 | 8.0 [7.7–8.3] | 122.3 [119.3–123.1] |
| firefox / control / 0 | 2.0 [2.0–3.0] | 31.0 [30.0–32.0] |
| firefox / control / 200 | 19.0 [18.0–20.0] | 93.0 [90.0–96.0] |
| firefox / bento / 0 | 2.0 [2.0–3.0] | 31.0 [31.0–32.0] |
| firefox / bento / 200 | 14.0 [12.0–15.0] | 89.0 [87.0–93.0] |
| firefox / end / 0 | 2.0 [1.0–2.0] | 31.0 [31.0–32.0] |
| firefox / end / 200 | 15.0 [14.0–16.0] | 97.0 [97.0–98.0] |

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
| --- | ---: | ---: |
| baseline / chromium / control / 0 | 1.4 [1.1–1.5] | 31.4 [31.3–31.4] |
| baseline / chromium / control / 200 | 9.4 [9.3–9.6] | 58.1 [54.0–64.7] |
| baseline / firefox / control / 0 | 2.0 [2.0–3.0] | 31.0 [31.0–31.0] |
| baseline / firefox / control / 200 | 18.0 [18.0–19.0] | 91.0 [91.0–96.0] |
| fixed / chromium / column / 0 | 1.7 [1.6–1.9] | 30.8 [30.4–31.8] |
| fixed / chromium / column / 200 | 6.9 [6.7–7.5] | 112.3 [110.4–119.7] |
| fixed / chromium / control / 0 | 1.2 [1.2–1.3] | 31.5 [31.5–31.8] |
| fixed / chromium / control / 200 | 10.1 [9.4–11.9] | 63.0 [57.8–66.2] |
| fixed / firefox / column / 0 | 2.0 [2.0–2.0] | 32.0 [31.0–32.0] |
| fixed / firefox / column / 200 | 14.0 [13.0–14.0] | 94.0 [93.0–95.0] |
| fixed / firefox / control / 0 | 3.0 [1.0–3.0] | 31.0 [30.0–32.0] |
| fixed / firefox / control / 200 | 18.0 [18.0–18.0] | 91.0 [90.0–93.0] |

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
| --- | ---: | ---: |
| before / chromium / 0 | 1.2 [1.2–1.4] | 31.5 [31.4–31.5] |
| before / chromium / 200 | 7.0 [6.9–10.2] | 137.5 [112.0–146.3] |
| before / firefox / 0 | 2.0 [2.0–2.0] | 32.0 [31.0–32.0] |
| before / firefox / 200 | 13.0 [13.0–20.0] | 105.0 [94.0–120.0] |
| after / chromium / 0 | 1.5 [1.3–1.9] | 31.2 [30.6–31.8] |
| after / chromium / 200 | 7.3 [7.2–7.5] | 127.0 [109.2–135.3] |
| after / firefox / 0 | 2.0 [2.0–3.0] | 32.0 [31.0–32.0] |
| after / firefox / 200 | 14.0 [13.0–16.0] | 109.0 [94.0–115.0] |

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
*displayed* target after a live permission check. It never resolves that later
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
| --- | ---: | ---: |
| before / chromium / 0 | 1.4 [1.2–1.8] | 31.4 [31.1–31.5] |
| before / chromium / 200 | 7.2 [7.1–8.1] | 112.5 [111.4–112.7] |
| before / firefox / 0 | 1.0 [1.0–3.0] | 30.0 [30.0–31.0] |
| before / firefox / 200 | 15.0 [14.0–15.0] | 93.0 [90.0–111.0] |
| after / chromium / 0 | 1.3 [1.3–1.5] | 31.2 [31.2–31.5] |
| after / chromium / 200 | 7.7 [6.8–8.9] | 115.5 [105.5–116.0] |
| after / firefox / 0 | 2.0 [2.0–3.0] | 31.0 [31.0–32.0] |
| after / firefox / 200 | 16.0 [14.0–16.0] | 96.0 [94.0–105.0] |
| lost / chromium / 0 | 1.2 [1.1–1.4] | 16.5 [16.3–16.5] |
| lost / chromium / 200 | 8.0 [6.9–8.5] | 110.1 [105.6–119.9] |
| lost / firefox / 0 | 2.0 [2.0–2.0] | 18.0 [15.0–19.0] |
| lost / firefox / 200 | 15.0 [14.0–15.0] | 95.0 [91.0–100.0] |

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
