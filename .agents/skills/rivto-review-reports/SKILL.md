---
name: rivto-review-reports
description: Reproduce and resolve Rivto editor failures captured as JSON Review reports in reports/. Use when investigating a report or marking it solved.
---

# Rivto Review Reports

Use Review reports as portable evidence, not as document source code. Each file
combines a short human problem statement, the original block placement, and a
detached native v6 editor snapshot that can be loaded without reconstructing the
failure by hand.

## Read the report

Reports are timestamped JSON files in the repository-root `reports/` directory,
which is intentionally ignored by Git. A block report has this stable shape:

```json
{
  "reportId": "review-block-id",
  "problem": "What the reporter observed",
  "savedAt": "2026-09-15T21:32:21.516Z",
  "solved": false,
  "solutionText": "",
  "reportBlock": {
    "previousReportSiblingId": "previous-id-or-null",
    "nextReportSiblingId": "next-id-or-null",
    "parentReportId": "parent-id-or-null"
  },
  "snapshot": {
    "version": 6,
    "blocks": [],
    "elements": [],
    "pluginData": {}
  }
}
```

Interpret the fields as follows:

- `problem` is the reporter's editable description and the starting hypothesis,
  not a sufficient assertion by itself. It may be empty or contain text retained
  by slash conversion; confirm the failure from the captured state.
- `reportId` identifies the live Review block at capture time. The block is
  absent from the snapshot by default because `includeReportBlock` defaults to
  `false`.
- `reportBlock` describes where that Review block lived in the original block
  hierarchy. Its sibling IDs are immediate siblings, not neighboring snapshot
  roots. `parentReportId: null` means the Review was a document root; null sibling
  IDs mean no sibling existed on that side.
- Placement IDs are evidence, not guaranteed snapshot members. A window boundary
  or excluded Review block can leave an ID outside the captured forest.
- `snapshot` is the loadable evidence payload. Its `blocks` are root subtrees;
  never flatten nested children into extra roots. Its `elements` contain captured
  canvas records and related block cards.
- `solved: false` means the report is open. `solved: true` means a fix was
  reproduced, implemented, and verified by a regression check.
- `solutionText` starts empty. For a solved report, it must briefly state the
  actual cause and verified fix; do not fill it with a plan or speculation.

Files without `reportBlock` are canvas-element reports. Their snapshot remains
usable in the same way, but block sibling and parent interpretation does not
apply.

## Reproduce from sample data

1. Select an unsolved report and read `problem`, `reportBlock`, and the snapshot
   before changing code.
2. Load `report.snapshot` through the native `editor.load(...)` API. In the demo,
   the **Restore Review report** file input performs the same operation.
3. Observe the claimed behavior against the restored document. Use placement
   metadata only to understand the Review's former context; loading does not
   recreate an excluded Review block or reposition it from those IDs.
4. If the report does not reproduce, inspect whether the failure depends on
   browser interaction, selection state, or state intentionally outside the
   capture window. Do not mark it solved merely because reproduction is
   incomplete.

Keep the JSON unchanged while diagnosing. The snapshot is evidence of the input
state; rewriting it to fit a proposed test destroys that evidence.

## Turn a report into a regression test

Use the narrowest layer that demonstrates the defect:

- Document invariants, hierarchy, loading, or portable data: a document-model
  or core test that loads `snapshot` directly.
- Commands, undo, selection, or clipboard without browser behavior: a focused
  core test.
- React rendering or extension behavior without real browser interaction: a
  colocated React test.
- Slash conversion, DOM selection, pointer behavior, or the real Save/Restore
  path: Playwright.

For local reproduction, treat the ignored report file as fixture input. A
committed CI test must not depend on `reports/`; copy the smallest relevant
snapshot into the test or a tracked fixture following the nearest suite's
convention, while leaving the original report unchanged. Load that snapshot,
perform only the operation needed to trigger the problem, and assert the
smallest observable invariant from `problem`. Prefer semantic structure and
content over literal IDs; assert captured IDs only when identity or placement is
the defect.

Do not load the full report object into the editor. Only `snapshot` is an
`EditorSnapshot`; `reportBlock`, `solved`, and the top-level metadata belong to
the test/report workflow.

## Close a solved report

Fix the shared owner of the failing behavior, add or update a regression check,
and run the focused check against the report data. After the problem is actually
fixed and verified, update both top-level fields:

```json
"solved": true,
"solutionText": "The verified cause and the fix that resolved it."
```

Every verified solved problem must be marked `solved: true` and have a non-empty
`solutionText`. Do not mark a report solved for a workaround, an unverified
patch, a skipped test, or an inability to reproduce. If one fix covers several
reports, mark and describe only the files whose stated problems were individually
verified.
