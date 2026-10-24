# Default rendering inside containers

> **Superseded:** The user rejected this rendering/placement result and requested
> reimplementation of Kanban, Bento, Columns, and Table. This report records the
> experiment and its checks, not an accepted design. See the
> [reimplementation reference](container-reimplementation.md).

Ordinary blocks in Kanban columns, Columns lanes, Bento tiles, table cells, and
TODO storage already share Page's `BlockNode` and `DefaultBlockLayout`. This
change reuses that rendering instead of introducing another container tree.

- Vertical container backgrounds now call the same `listGap` path as the default
  outline. Horizontal pointer movement chooses sibling or child placement; model
  parents and existing move permission checks remain authoritative.
- Horizontal lane/cell gaps and Bento grid/tile resize geometry stay custom.
  Container outer rims and explicit empty targets retain their priority.
- Kanban ordinary blocks no longer receive extra card padding, borders, shadows,
  custom handle positioning/colors, or a separate child spacing value.
- Table control positioning is limited to the structural cell's own boundary
  control. Descendant block controls use Page's default gutter. Removing the cell
  boundary exception made that control unreachable in the clipped table.
- TODO storage retains its positioned child host and toolbar stacking. Its
  indentation uses the shared token; descendant row hover geometry is shared.
  Removing the host stacking broke menu input, so that responsibility stays local.

No persistence, schemas, permissions, dependencies, or lifecycle APIs changed.
The inspected path was container layout -> BlockChildren/BlockList -> BlockNode
-> native drop resolution -> existing host move validation/command. Existing
Page ownership and extension registration/cleanup remain unchanged.

## Verification

- New small/large unit regression failed on the original vertical resolver for
  ignoring outline depth; both cases pass after reusing `listGap`. Rectangle reads
  are bounded logarithmically; this is not a claim about total list enumeration.
- Page: 26 suites / 193 tests passed. React: 91 suites / 566 tests passed.
- Final focused browser run: 108 passed, 2 existing skips, Chromium and Firefox,
  12 workers. Covers all five container families in page and edgeless modes,
  sibling/child placement, indicator alignment, model order, undo, empty targets,
  structural boundaries, table resize, and TODO menus/filtering/sorting.
- Kanban add-card placement check now compares against the actual shared list gap
  instead of the old fixed 10px. Both browsers pass that updated check.
- Page and demo production builds and Page/React typechecks passed. Focused lint
  has zero errors and eight existing function-length warnings. New declarations
  pass the length checks. Formatting and scoped whitespace checks passed.
- Broader container suites exposed eight existing failures: empty Columns
  highlight assertions, Kanban horizontal lane dragging inside the modal (both
  initial modes), and the synced Kanban test's old direct-child selector. All
  eight reproduced serially with the original vertical resolver and original
  Kanban styles restored in an isolated baseline build. They remain outside this
  change. The two extra failures from the old fixed Kanban spacing assertion
  were corrected for the requested default spacing.
- Intermediate table-control and TODO-host regressions were reproduced, corrected,
  and covered by the final green browser run. The obsolete TODO serial run was
  stopped after diagnosis; final TODO coverage passes in both browsers.

## Production pointer timing

Normal demo and `?repeat=200`, unchanged default virtualization settings, real
Kanban pointer moves, one warmup and three equivalent moves restored with undo.
Both production builds used serial browser workers. Command time wraps the
public grouped move including synchronous subscribers; rendering is pointer
release to two animation frames, not a guarantee of settled asynchronous layout.
Values are median (minimum–maximum), milliseconds.

| Browser / extra roots | Command before | Command after | Rendering before | Rendering after  |
| --------------------- | -------------- | ------------- | ---------------- | ---------------- |
| Chromium / 0          | 1.2 (1.1–1.3)  | 1.0 (0.9–1.0) | 26.4 (25.6–26.7) | 25.0 (25.0–25.0) |
| Chromium / 200        | 2.9 (2.2–3.0)  | 2.7 (2.1–2.8) | 62.8 (57.1–73.1) | 60.5 (59.7–61.8) |
| Firefox / 0           | 2 (1–2)        | 2 (2–4)       | 23 (23–23)       | 22 (22–23)       |
| Firefox / 200         | 9 (8–9)        | 9 (9–10)      | 24 (24–25)       | 26 (24–27)       |

All four final timing scenarios pass their placement/order checks. These small
samples do not establish a general speedup. Full workspace E2E and every custom
host extension were not tested. Raw diagnostic logs stay under `/tmp`.
