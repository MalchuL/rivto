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
