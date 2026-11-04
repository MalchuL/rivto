# Block drop placement behavior

Every block owns a child list. Its registered behavior chooses how boundaries
between its direct children select destinations; a block's own child list retains
its independently configured behavior. Boundary placement does not decide whether
a block can have children or replace move permission checks.

`outline` exposes sibling, child and eligible terminal ancestor levels. `siblings`
keeps direct-item boundaries at the owning list's sibling level. Body/inside drop
targets remain independent. Bento and Kanban columns use `siblings`; ordinary
blocks default to `outline`. A local list does not expose a sibling of its owner
while the pointer remains inside that list.

| Setup | Pointer and feedback | Result and undo |
| --- | --- | --- |
| Ordinary block in editor | Sweep a lower edge across outline depth bands; line tracks the selected sibling or child level. | Move to the selected canonical parent and position; undo restores the original hierarchy. |
| Ordinary item in Bento or Kanban | Sweep either direction across its lower edge; the line remains at its list's sibling level. Its body can show inside feedback. | Edge inserts a sibling; inside appends to the item when allowed. Undo restores order. |
| Expanded ordinary item in Bento or Kanban | Its own outer boundary stays sibling-only. Enter its child list to select that list's outline levels. | Insert at the selected child-list destination; undo restores the source. |
| Container inside ordinary block | The ordinary list controls the container's outer edge; the container controls its own child list. | Insert at the indicated owner and position; undo restores hierarchy. |
| Container inside Bento or Kanban | Its outer direct-item boundary stays sibling-only; entering its child area uses its own policy. | Edge inserts beside the container; inside and nested-list targets use the indicated parent. Undo restores hierarchy. |
| Container inside container inside ordinary block | Each entered list applies its own policy and local boundary. | Place at the indicated level without escaping an enclosing local list; undo restores hierarchy. |
| Custom block with registered policy | Its child boundaries follow the registered policy, irrespective of its visual layout. | Destination matches feedback; undo restores hierarchy. |

The focused checks cover empty and populated lists, leaf and expanded items,
physical gaps and gutters, bidirectional sweeps, rejected moves, cross-container
moves and a second drag after undo in Page and Edgeless.

## Inline controls and deeply nested outlines

An ordinary outline inside a layout with in-flow controls uses the measured
space occupied by the row's controls for both pointer depth and line placement.
The same calculation applies to any layout that places controls inside the row;
it does not identify container types. Outlines with outside controls keep their
existing geometry. Direct sibling-only container boundaries retain their own
placement policy.

When a preceding block ends in multiple nested descendants, a shared gap must
offer the same destination and line on both sides of the seam. The registered
terminal descendants supply those depths, including when their rows contain
inline controls. The browser regression exercises four levels, both directions,
different control sizes, Page and Edgeless, and right-to-left layout; it verifies
the destination and undo as well as the line position.

The updated regression passed 240 Chromium and Firefox cases. The container
placement and deep-outline suites passed 180 cases; boundary feedback and
container-bottom checks passed another 88. The Page drop-target and feedback
unit suites passed 154 tests. Production-preview pointer measurements passed in
both browsers with default content and `repeat=200`: the combined control and
Bento-region median two-frame times changed from 31.2 to 30.7 ms in Chromium and
31.5 to 31.5 ms in Firefox at default size, and from 279 to 315.6 ms and 292.5
to 304 ms respectively with `repeat=200`. The large-document samples were noisy;
the after ranges were 276.8–334 ms and 291–334 ms. A separate 12-case run of
the actual container-outline performance scenarios also passed.
The corresponding median synchronous command times were 1.4 to 1.6 ms and
2 to 2 ms at default size, and 7.3 to 8.2 ms and 18 to 17.5 ms at `repeat=200`
for Chromium and Firefox respectively.

The lower edge of a terminal descendant must retain the same depth as the
adjacent gap when the pointer is outside that descendant's content horizontally.
Own-content protection applies only when the pointer is inside the content in
both axes. The regression also sweeps up to ten pixels into the final row and
commits the drop there, checking the resulting parent and undo.
The corrected lower-edge check passed 240 Chromium and Firefox scenarios, with
204 container-placement and bottom-boundary checks and 64 direct boundary
checks. Production-preview control and Bento-region measurements compared with
the preceding implementation gave median synchronous / two-frame times of
1.7 / 31.3 ms in Chromium and 2 / 32 ms in Firefox at default size, and 7.4 /
272.2 ms and 19.5 / 292 ms at `repeat=200`. The preceding medians were 1.6 /
30.7 ms, 2 / 31.5 ms, 8.2 / 315.6 ms and 17.5 / 304 ms respectively. Large
document two-frame measurements ranged from 268.5 to 303.6 ms in Chromium and
285 to 312 ms in Firefox after the change.

## Verification results

- The cross-container matrix and bottom/deep-outline suites passed 168 checks in
  Chromium and Firefox. Updated bottom-boundary coverage passed 24 checks, including
  a custom registered sibling policy. An explicit Kanban-inside-Bento-inside-ordinary
  pointer fixture passed in both surfaces and browsers.
- The complete declarative-region run passed 726 of 730 checks; four Kanban gutter
  checks retained the old child-depth expectation and failed in parallel and serial.
  After updating that expected destination, all four passed in the parallel rerun.
  Separate edge, gap, gutter, RTL and endpoint checks passed 136 cases, and nested
  container boundary/keyboard checks passed 56 cases. Earlier runs with obsolete
  expectations were reproduced with one worker before updating those assertions.
- Page unit suites passed 223 tests; React behavior and projection suites passed 25.
  Workspace type checks and production demo build passed. Full lint passed with
  525 existing or advisory warnings and no errors.
- Production-preview native pointer drops, three samples per scenario in each
  browser, passed at default size and `repeat=200`. Median command / two-frame
  rendered times were 1.4 / 30.9 ms (Chromium) and 2 / 31 ms (Firefox) at default
  size, and 7.7 / 283.6 ms and 17 / 290 ms respectively at `repeat=200`. The
  corresponding previous large-document medians were approximately 7.6 / 281.9 ms
  and 16.5 / 290.5 ms. These are interaction samples, not startup benchmarks;
  large documents still showed occasional long frames.
- Ownership review: the host owns the behavior registry and Page block projection;
  Page receives only the projected per-node policy. Mounted child lists use their
  existing addressed node subscription, and no new manager or duplicate block tree
  is introduced. Policy is presentation guidance, not movement authorization.

The full workspace browser suite was not run. The custom browser fixture uses an
independent registered block type with Bento's layout rather than a novel visual
layout; its placement policy is independently registered and tested.
