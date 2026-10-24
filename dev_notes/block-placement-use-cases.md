# Block placement contract and verification matrix

This matrix covers the shared Page renderer used by Page and Edgeless. Geometry
proposes a destination; the host's existing `canMove` and commit commands remain
responsible for permissions, history and persisted order. A successful indicator
alone is not evidence of a successful move.

## Reference behavior and adaptation

`main` uses `extensions/block-drag/pointer/{target,hit}.ts` to distinguish native
rows, nearby rows, container chrome and root edges. The fixed parent's axis is
used for structural children. Kanban cards retain free outline nesting: horizontal
pointer movement in a gap may select a child destination. `placement/geometry.ts`
chooses semantic depth; `placement/indicator.tsx` uses canonical adjacent block
bounds, including complete subtrees, to draw a shared line.

The current branch adapts those contracts rather than copying the old surface-wide
queries. Mounted primitive refs register shell, row, body, children, slot and item
ownership in one editor-owned registry. Hover, selection and outline targeting
resolve an owned region through that registry, independently of wrapper depth.
The registry does not subscribe to model data or cache rectangle measurements.

`BlockChildren.dropAxis` describes flow. `dropPlacement="outline"` preserves depth
projection; `"siblings"` constrains background gaps to that list. Explicit sibling
targets retain their declared destination; a container-owned inside region on its
header uses the nearby insertion comparison described below. Bento and structural Kanban/Columns
lists declare sibling placement. Kanban cards, column writing and TODO storage
retain outline placement. `BlockDropWrapper.axis` selects vertical, horizontal or
four-sided grid strips without overlaying text. `BlockRow slots="manual"` and
`BlockSlot` allow contributions to move in JSX while retaining block ownership.

Header targeting compares squared distance to actual insertion feedback, after
the host rejects forbidden destinations. Candidates include the outer sibling
gaps and the nearest mounted child branch. Structural levels descend only when
their immediate gaps reject the source. This is a local search, not a global scan
of every permitted gap. Padding, wrappers and declared flow determine geometry;
there are no Bento/Kanban/TODO type switches in Page. Explicit sibling strips,
ordinary outline depth, and exposed outer rims preserve their existing behavior.

## Destination and feedback cases

For each accepted move, check the actual parent and ordered children after release,
feedback removal, and undo restoring the source hierarchy. A between destination
is `{parentId, previousId, nextId}` after excluding moving roots. An inside
destination names its receiving parent; it must remain visually distinct from a
between line.

| ID  | Input / combination                                              | Expected destination and geometry                                                              | Focused coverage                                                        |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| P01 | Empty receiving list                                             | Inside its owner; no invented sibling                                                          | drop-target unit tests; page-drag-gap; kanban                           |
| P02 | Before first of one/two/many                                     | Between null and first; full first boundary                                                    | container-placement-matrix; kanban; drop-boundary-regressions           |
| P03 | Interior gap approached from either neighbor                     | Same canonical gap and same midpoint line outside padded shells                                | outline-drop-target unit test; page-drop-parity; container-padding-drag |
| P04 | After last of one/two/many                                       | Between last and null; complete trailing subtree boundary                                      | container-placement-matrix; kanban; page-drag-gap                       |
| P05 | First/middle/last/only source; unchanged destination             | Source omitted from neighbors; no duplicate or cycle                                           | drag-source-gaps; drop-target unit tests                                |
| P06 | Multiple selected sources, adjacent or disjoint                  | Move roots once in canonical order; retain stationary-edge feedback across source placeholders | Page demo drag; drag-source-gaps                                        |
| P07 | Ordinary body center at child depth                              | Inside row owner when allowed                                                                  | outline-drop-target unit tests; Page demo drag                          |
| P08 | Gap at sibling / child / outdent X                               | Outline projects depth; explicit sibling strips do not                                         | container-outline; container-placement-matrix; page-drag-gap            |
| P09 | Expanded row with body slots and descendants                     | First-child gap belongs to child host; subtree edge outside all descendants                    | drop-boundary-regressions; page-drag-gap                                |
| P10 | Collapsed or empty outline                                       | Hidden descendants cannot own geometry; model remains canonical                                | block-editor units; outline-drop-target units                           |
| P11 | First/last child touching ancestor rim                           | Explicit child region wins; exposed container chrome still sorts container                     | block-drop-boundaries; drop-boundary-regressions                        |
| P12 | Whole container beside ordinary block or another container       | Destination is their common parent, not an accidental inner child                              | page-drop-parity; page-drag-container-boundary                          |
| P13 | Container moved into another container, depth two/three          | Receiving parent permission enforced; descendants remain one subtree                           | nested-containers; page-drag-container-boundary                         |
| P14 | Structural lane/row into incompatible parent                     | No accepted move; no model change                                                              | page-drag-container-boundary; behavior unit suites                      |
| P15 | Grid same row / wrap / uneven heights / RTL                      | Canonical sibling order; shared vertical or horizontal line according to actual rectangles     | page-drop-parity; bento; block-drop-target units                        |
| P16 | Kanban column flow and card flow                                 | Horizontal structural gaps; vertical card outline depth                                        | kanban; container-outline                                               |
| P17 | TODO filtered children, hidden canonical neighbors, empty result | Filtering does not rewrite persisted neighbors; invalid stale gaps rejected                    | todo-storage; drop-target unit tests                                    |
| P18 | TODO manual/status ordering and nested storages                  | Owning behavior determines accepted order; transient filter context stays local                | todo-storage; container-layout                                          |
| P19 | Item padding, row padding, body slot, neutral wrappers           | Owner regions stay distinct; between feedback uses full bounds                                 | region units; block-editor composition units; container-padding-drag    |
| P20 | Manual slots, inside/outside controls, custom strip axes         | Single contribution per requested slot; reachable owner handle; strips never cover content     | block-editor units; block-row-hover; container-layout                   |
| P21 | Page / Edgeless / modal / nested occurrence                      | Geometry and hierarchy stay within routed occurrence; same ID elsewhere is not an anchor       | container-placement-matrix; panels; page-nested-drag; Page demo drag    |
| P22 | Scroll, zoom, resize during gesture                              | Fresh viewport geometry; scaled indentation; final pointer re-resolved                         | outline-drop-target units; Page demo drag; bento                        |
| P23 | Escape, pointer cancel, blur, source deletion, target unmount    | Cleanup restores feedback/source state; unavailable destinations cannot commit                 | Page demo drag; drop-target lifecycle units                             |
| P24 | Ancestor into descendant, forbidden/stale gap                    | Permission or live destination validation rejects mutation                                     | drop-target units; page-drag-container-boundary                         |
| P25 | Table compatibility                                              | Shared changes preserve row/cell ownership and ordinary cell outline                           | container-outline; container-layout; page-drop-parity                   |
| P26 | Container title with changed header/child padding                 | Nearest permitted local insertion follows measured bounds; never header-half-to-distant-bottom | block-container-header units; container-header-placement               |
| P27 | Header above structural lane, rejected host, collapsed children   | Descend nearest structural branch when needed; omit forbidden/hidden/source candidates          | block-container-header units; container-outline header performance     |

The test names above identify intended coverage, not a claim that every suite has
passed on this branch. Run results and remaining gaps must be reported separately.

## Ordered cross-container combinations

`container-placement-matrix.spec.ts` enumerates all 16 ordered combinations below
in Page and Edgeless, using real handles and release. Each combination exercises
first, interior, last and nested placement plus undo. Bento's writing list is the
outline inside its tile; direct tile-grid boundaries have separate P15 coverage.

| Source → destination | Bento | Kanban | Columns | TODO storage |
| -------------------- | ----- | ------ | ------- | ------------ |
| Bento                | C01   | C02    | C03     | C04          |
| Kanban               | C05   | C06    | C07     | C08          |
| Columns              | C09   | C10    | C11     | C12          |
| TODO storage         | C13   | C14    | C15     | C16          |

Secondary dimensions are pairwise rather than a full Cartesian product: multiline
and atomic content, colored cards, empty/one/many lists, expanded/collapsed trees,
filtered siblings, groups, wrapping/RTL, zoom/scroll, custom padding and slots.
Do not treat this finite matrix as proof of every arbitrary host layout.

## Ownership and cost review

The controller creates and destroys the region registry. Committed primitive refs
register and release their elements; React view unmount does not destroy the
editor. Primitive borrowers receive register only; lookup records borrow get only,
without registry destruction. Shells remain Page-owned, and BlockChildren remains
the only subtree iterator. Host
renderers and container policies are unchanged. Standalone DOM fixtures use a
bounded ownership traversal that stops at child shells and foreign editors.

Addressed registry lookup visits only one owner's small region set. Vertical gap
hit testing retains binary search over mounted placements. Shared indicator
geometry measures adjacent bounds, not every document block. Performance checks
must assert the completed move/content update as well as command and frame timing
at demo defaults and `?repeat=200`, with one worker and tracing disabled.

## Verification recorded 2026-10-24

- Page unit suite: **228 passed**. The new padded/wrapped-row regression fails
  on the original branch: the line is 12px inside the intended gap in one case,
  and the wrapped row selects the wrong canonical destination in the other.
- Main production integration sweep: **332 passed**, Chromium and Firefox,
  12 workers. Includes all 16 ordered container pairs in both surfaces, nesting,
  source gaps, mixed root boundaries, Table compatibility, selected-subtree
  painting, padding, Kanban controls, Bento resize and RTL/wrapped grids.
- Page and React type checks, Page package build and both production demo builds
  passed. Focused lint has zero errors; 30 function-length warnings remain in the
  checked existing and modified files.
- Standalone Page smoke: initially 24 passed / 12 failed; all 12 failures also
  failed serially on the unchanged baseline. The stale 16px root-gap assertion
  was corrected to the existing 4px default. Package geometry with demo chrome
  disabled and public parameter overrides then passed all four focused browser
  checks. Ten baseline failures remain in root-wrapper, counter and virtualized
  group-selection scenarios; this work does not claim that standalone suite is green.
- Production timings: four baseline editing checks and eight final editing/DnD
  checks passed with one worker and tracing off. Inputs use demo defaults and
  `repeat=200`, without enabling virtualization. Every sample asserts the actual
  edit or move and restored focus/order, so fast no-ops do not pass.

Times below are milliseconds, median (minimum–maximum). Editing samples are paired
against the archived original production build. Frame values are two-animation-frame
proxies rather than proof of every deferred browser layout task completing.

| Browser / size      | Editing command before → after | Input-to-two-frames before → after  |
| ------------------- | ------------------------------ | ----------------------------------- |
| Chromium normal     | 0.5 (0.5–0.7) → 0.6 (0.4–0.7)  | 23.0 (18.7–26.3) → 25.3 (23.1–29.9) |
| Chromium repeat=200 | 0.6 (0.5–0.8) → 0.7 (0.5–0.8)  | 31.8 (21.8–38.0) → 28.8 (20.3–30.8) |
| Firefox normal      | 1 (0–1) → 1 (0–5)              | 22 (19–24) → 22 (17–26)             |
| Firefox repeat=200  | 1 (0–1) → 1 (1–1)              | 43 (40–71) → 41 (39–44)             |

Final real-drag command / release-to-two-frames medians: Chromium normal
0.9 / 24.8ms, large 1.8 / 34.3ms; Firefox normal 1 / 20ms, large 4 / 15ms.
Drag frame ranges were 20.7–25.7ms and 32.3–36.5ms in Chromium, 19–21ms and
13–15ms in Firefox. These drag timings have no paired baseline in this run and
are not presented as a speedup. Addressed-read and rectangle-count unit checks
separately verify that placement does not measure every document subtree.

## Header nearest-position follow-up, 2026-10-24

The former custom-header half split reproduced the reported failure in both new
padding cases before the change: it selected the far container bottom. Shared
nearest-position selection now passes those cases, permission changes, structural
descent, collapsed/source exclusion and neutral-wrapper rim coverage.

- Final Page unit suite: **234 passed**; focused host drag suites: **11 passed**.
- Final browser sweep: **198 passed**, Chromium and Firefox, 12 workers. Covers
  headers with two paddings in both surfaces, mixed-root boundary parity, explicit
  strips, first-child boundaries, all 16 ordered container pairs, nesting and undo.
- Intermediate failures were rerun with one worker: the initial 64 boundary cases
  and subsequent 17 Table-wrapper cases reproduced serially. The shared geometry
  and wrapper-policy corrections precede the final all-green sweep.
- Page and host type checks, Page package build and main production build passed.
  Focused lint: no errors, two existing function-length warnings.
- Production performance: **8 passed**, one worker, tracing off, default demo and
  `repeat=200`, with all default content and virtualization settings retained.
  Real pointer drops assert the resulting order and undo; header drops traverse
  the structural Kanban lane rather than measuring a manager-only operation.

Paired ordinary-gap measurements before → after this follow-up, milliseconds,
median (minimum–maximum):

| Browser / size | Move command | Release to two frames |
| --- | --- | --- |
| Chromium normal | 0.9 (0.7–2.7) → 0.9 (0.9–1.0) | 23.9 (23.1–25.5) → 23.0 (20.7–25.3) |
| Chromium repeat=200 | 1.8 (1.3–1.9) → 1.7 (1.6–2.6) | 30.6 (26.3–36.9) → 30.0 (27.7–48.2) |
| Firefox normal | 1 (0–1) → 1 (1–2) | 18 (11–20) → 19 (16–19) |
| Firefox repeat=200 | 4 (4–5) → 3 (3–4) | 14 (12–15) → 14 (12–48) |

New header-path command / release medians (ranges): Chromium normal 1.1 (1.1–1.1)
/ 25.5 (25.4–26.3), large 1.5 (1.0–1.6) / 28.2 (28.2–28.8); Firefox normal
1 (1–2) / 24 (20–24), large 4 (4–5) / 17 (15–19). Header timing has no successful
paired baseline because the original destination was wrong. Frame timings remain
a rendering proxy, not a claim about all deferred layout work.

API ownership review: inspected `PageDragBoundary` creation/cleanup,
`PageBlockDrag` attachment and commit validation, `BlockDragRouter` local/foreign
routing, `PageDragOccurrence` receiving policy and teardown, and the Page resolver.
The new callback is synchronous, borrowed only during resolution, and never
retained; no new registration or teardown capability is exposed. Foreign receivers
use their own policy. Geometry searches only the local nearest mounted branch,
not every permitted destination in other branches. The earlier standalone-demo
baseline limitations above remain; that unrelated full suite was not rerun here.

## Pointer-release timing regression

A native pointer event keeps the target chosen at dispatch, even if an earlier
`pointerup` listener releases pointer capture. The old release path checked
`event.target.hasPointerCapture(pointerId)` during window delivery. After early
cleanup that returned false, so a still-connected source handle was incorrectly
treated as the element under the destination coordinates. Source exclusion then
cleared a valid preview and no move was committed. Keeping capture until browser
cleanup made the identical drag succeed, reproducing a timing-dependent no-op.

Release now requests fresh coordinate hit testing through the existing resolver.
Movement retains its synchronous native-hit optimization. This does not reuse a
stale preview destination or bypass permission, adjacency, source or attachment
checks. The change is in the shared pointer controller, with no container-specific
rules, new API, dependencies, listeners or retained state. Creation, event delivery,
permission/commit validation and cleanup retain their existing owners.

The new unit regression failed before the fix. Native Page tests with real pointer
capture failed in both Chromium and Firefox when cleanup preceded window delivery;
the same tests with normal browser cleanup passed. Both failing browser cases also
failed with one worker. After the fix, all four browser cases pass, including the
persisted order, feedback cleanup and one-step undo assertions.

Final verification for the release fix:

- Page units: **235 passed**. Page type checking and the production demo build
  passed. Focused lint has no errors and three existing function-length warnings.
- Browser sweep with 12 workers: **113 passed, 25 failed**. All new release cases,
  header cases, the ordered container matrix and container-outline cases passed.
  The 25 failures were rerun with one worker against a production build restoring
  only the original release statement (a temporary Vite transform, without changing
  workspace sources). **24 failures reproduced on that baseline**: ten scroll
  fixture failures at obsolete direct-root selectors, and fourteen undo checks
  using `Control+z` on this macOS host. Baseline fixture timeouts were capped at
  ten seconds rather than thirty; the missing selectors and failing undo assertions
  were unchanged. The remaining Firefox cross-document case passed serially on
  both baseline and final builds. These older suites are not reported as green.
- Production measurements before and after: **8 checks passed in each run**, one
  worker, tracing off, normal demo and `repeat=200`. Fixture creation is excluded;
  native drops, actual hierarchy changes and undo are asserted. Three warmed
  samples per case measure the synchronous move and release-to-two-frame proxy.

Paired timing results, milliseconds, median (minimum–maximum):

| Browser / size / destination | Move before → after | Release to two frames before → after |
| --- | --- | --- |
| Chromium normal / gap | 1.6 (1.0–1.7) → 1.0 (0.8–1.1) | 19.7 (18.1–23.0) → 24.4 (22.9–24.5) |
| Chromium normal / header | 1.4 (1.0–2.3) → 1.0 (0.8–1.0) | 25.0 (23.3–27.1) → 26.7 (25.6–27.6) |
| Chromium repeat=200 / gap | 1.6 (1.2–1.6) → 1.6 (1.2–1.7) | 35.9 (30.0–36.3) → 31.5 (29.5–38.9) |
| Chromium repeat=200 / header | 1.6 (1.1–1.7) → 1.6 (1.2–1.7) | 29.2 (28.4–29.5) → 33.0 (31.4–33.6) |
| Firefox normal / gap | 1 (1–1) → 2 (1–2) | 7 (5–22) → 17 (15–19) |
| Firefox normal / header | 1 (1–1) → 1 (1–3) | 21 (19–24) → 23 (22–23) |
| Firefox repeat=200 / gap | 4 (4–5) → 4 (4–10) | 13 (13–14) → 23 (13–46) |
| Firefox repeat=200 / header | 5 (4–5) → 5 (5–6) | 24 (20–25) → 19 (16–25) |

The release lookup adds no gesture state or document traversal. Frame values vary
with browser scheduling; these small samples do not establish a speedup. The
large-fixture move medians remain 1.6ms in Chromium and 4–5ms in Firefox.

## Painted Bento rims and nested writing gaps

The shared Page resolver now uses the existing registered `item`/`shell` ownership
for controls outside a child shell. Direct children of a declared grid use the
whole painted shell for rim/center intent and the existing `placementBoundary`
path for canonical neighbors and indicator geometry. This avoids interpreting tile
padding as a text-row boundary, or a resize control as empty board background.
Explicit strips still take priority. Nested child shells keep their own outline
host, including horizontal depth projection. There are no Bento type checks, new
public options, additional listeners, retained geometry or document-wide scans.

New coverage in `e2e/bento-placement.spec.ts` uses native pointer input and checks
persisted parent/order plus one-step undo:

| Placement | Combinations | Feedback assertion |
| --- | --- | --- |
| Painted tile rims | First/last tile × top/bottom/left/right × 1/4/7px inset × inline/wrapped | One line; internal gaps centered between full item bounds with the correct orientation |
| Writing gap below an expanded subtree | Sibling/nested depth × inline/wrapped tile | One insertion line, actual receiving parent and complete child order |
| Generic registered grid (unit) | All rims, center nesting, resize chrome, moving-source exclusion, RTL, nesting disabled | Canonical gaps and full-item indicator bounds, without a native container type |

The unit reproduction failed five of the original six new assertions before the
fix. The native first-tile left/right rim reproduction failed all four browser
cases on the saved pre-fix production build, with both 12 workers and one worker.

Main (`442024ae`) was inspected and built separately. Its grid intent and canonical
neighbor behavior informed this adaptation; its old drag engine was not copied.
A portable 40-case sample (4px rims and writing gaps, both browsers) passed 28
cases on main. The 12 failures were rerun serially: one passed, eleven remained.
Those include first-row top rims resolving outside the board, nested expanded-gap
placement remaining at the tile level, and a Firefox inline right-rim case. These
observed legacy failures are not parity requirements. The current branch's new
104-case suite passes, including the stronger insertion-line geometry assertions.

Ownership review: `BlockItem` continues to register through `useBlockRegion`;
registration cleanup and editor registry destruction retain their existing owners.
The resolver borrows region lookup and addressed hierarchy operations; the drag
router still consumes only `resolve`. No manager or lifecycle interface was widened.
The region lookup documentation now explicitly includes registered item owners.

Final browser sweep: **266 passed, 16 failed** with 12 workers, covering the new
Bento suite, current drop parity, headers, container outlines and the ordered
container matrix in both browsers (including Page and Edgeless where supported).
The sixteen failures all target Columns. All sixteen also fail serially both on
the final build and on a comparison build replacing only this resolver with HEAD's
original source, retaining the same concurrent Columns layout edits. Their first
move leaves the source at the root instead of `target-list`. They remain unresolved
outside this Bento change; the broad suite is not reported as fully green.

Production nested-Bento measurements preserve the normal demo, its extensions and
virtualization defaults. Four checks pass before and after, workers=1, tracing off,
three warmed native drops per case, with actual order and undo assertions. Build
comparison substitutes only the resolver. These measure the shared nested-writing
path; painted-rim cases are behavioral tests, not separate timing benchmarks.

| Browser / document | Move before → after, ms median (range) | Release to two frames before → after, ms median (range) |
| --- | --- | --- |
| Chromium / normal | 0.9 (0.8–1.0) → 0.8 (0.7–0.8) | 23.0 (21.6–24.6) → 23.8 (22.3–25.5) |
| Chromium / repeat=200 | 1.7 (1.3–1.8) → 1.7 (1.1–1.9) | 41.8 (33.3–45.7) → 35.2 (32.9–41.4) |
| Firefox / normal | 1 (1–1) → 1 (1–2) | 18 (12–21) → 19 (19–19) |
| Firefox / repeat=200 | 4 (3–5) → 10 (6–11) | 15 (11–49) → 31 (21–39) |

The initial large-Firefox difference prompted one additional paired run, not a
change to budgets or assertions: move medians were **4 (4–24) → 4 (4–5)ms** and
frame-proxy medians **16 (15–55) → 14 (14–16)ms**. This shows scheduling variability;
these small samples do not establish either a speedup or a stable slowdown.

Final Page checks: **243 unit tests passed**, type checking passed, and focused
lint passed with three function-length warnings. The production demo build used
for the browser runs passed. Formatting and whitespace checks passed. Later
unrelated concurrent working-tree changes were not included in those saved
production builds; this report covers the DnD implementation and comparison above.
