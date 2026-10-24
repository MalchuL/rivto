# Layout-bounded block hover

## Intended behavior

An ordinary outline row responds across its available horizontal area. An explicit
child layout bounds that area to its own list; horizontal/grid items cannot capture
neighboring items. Nested ordinary outlines inherit the local area. Only the
pointed row receives hover feedback; focus feedback remains independent. Parent
headers and exposed outer gutters can reveal the parent's handle. Entering a
visible handle retains ownership through the native event target.

## Ownership and implementation

1. Page's BlockChildren declares whether its child host bounds hover. Custom child
   hosts default to bounded; DefaultBlockLayout explicitly inherits the enclosing
   area. No document block type or drag policy decides hover ownership.
2. One view-owned BlockRowHover per BlockEditorScope observes native pointer input,
   resolves mounted rows inside that occurrence, and marks only the current row.
   It borrows DOM, owns listeners, and releases listeners/feedback on detach.
   Root/outline lists use binary search, skipping zero-height gap wrappers; multi-axis whitespace inspects immediate
   mounted items. Native row/control hits take precedence. No document data reads,
   extra React row subscriptions, model changes, or hit-test overlays are needed.
3. React's handle CSS consumes the row marker and retains keyboard focus feedback.
   Remove viewport-wide pseudo-elements and full-container-hover metadata, including
   registrations, exports, type fixtures, and the old DOM marker effect.
4. Inspect native attachment/replacement, nested occurrences, scroll, pointer exit,
   touch/drag input, clipping, handle reachability, and both surfaces. Preserve the
   four documented container models; this task does not reimplement them.

## Checks

Capture a failing real-pointer regression for nested rows in neighboring layouts.
Compare existing handle-command performance before/after with default demo and
repeat=200, production builds, both browsers, serial workers. Add focused resolver
and cleanup checks, then run relevant browser tests with 12 workers; rerun failures
serially before classifying. Passing tests do not establish visual acceptance.

## Completed ownership review

The view creates and destroys `BlockRowHover` for the mounted root. It borrows
only DOM and never receives an editor/controller manager. Root replacement and
StrictMode cleanup abort its native listeners, clear its single marker, and cancel
scroll reconciliation. Nested occurrence checks apply to both native targets and
ancestor rows/shells. Right-button pointer-down retains the hit target until the
gesture moves so Firefox can deliver context-menu input.

`BlockChildren` consumes the new `hoverBoundary` option instead of forwarding it
as an unknown DOM prop; `DefaultBlockLayout` is its explicit false consumer. Hover
uses computed grid/flex geometry, independently of `dropAxis` and drag permission.
The React handle consumes Page's row marker and retains its existing keyboard
focus/menu feedback. Its metadata subscription and shell-marker effect are gone.
All handle metadata registrations, exports, type declarations/fixtures, runtime
tests, and current authoring docs were inspected and updated. No forwarding API,
extra document subscription, new block type, or persisted field was introduced.

The container reimplementation inventory remains a historical reference; this
hover change does not accept or reimplement the rejected container designs.

## Verification results

- The original implementation failed the nested indentation regression in both
  browsers and both surfaces. The new layout-aware behavior passes all 18 hover
  browser cases: Columns/Kanban/Bento/Table in page/edgeless, wrapped Bento tiles,
  reachable native handles, neighbor ownership, and CSS grid without drag-axis
  metadata. Runs used 12 workers.
- The broader handle/menu, summary, and pointer-drag run passed 64 checks and
  failed two color-menu assertions expecting 8px rounding instead of the current
  4px. Both failed serially on the new build and on the archived pre-hover build,
  which has old handle metadata/overlays and no new hover marker. Their assertions
  and the unrelated rounding were not changed. Earlier Firefox context-menu
  regressions from clearing on pointer-down were corrected before this final run.
- Page: 27 suites / 202 tests passed. React: 91 suites / 566 tests passed. Nine
  focused hover tests cover geometry work at 4/2000 roots, nested occurrences,
  display-contents gaps, pointer-down delivery, cleanup/remount ownership, scroll
  reconciliation/cancellation, and attachment rollback.
- Page/React package builds, Page/React/demo typechecks, scoped formatting and
  whitespace checks passed. Focused lint has zero errors and 14 function-length
  warnings in the affected existing declarations; the new hover implementation
  and fixture methods pass their length checks.
- Full workspace E2E, arbitrary host layouts and all transformed/overlapping canvas
  configurations were not exhaustively validated. The change is ready to try,
  not a claim that the rejected container designs are now accepted.

### Production timing

Existing real-pointer handle/menu collapse and expand scenarios ran at normal
size and `?repeat=200`, with default virtualization, one serial worker, and the
same production demo route in Chromium and Firefox. Each run warmed twice and
recorded four alternating collapse/expand samples. Command time includes the
public grouped update and synchronous subscribers; rendering uses two animation
frames and is not a settled-layout guarantee. Hover itself performs no model
command or document subscription; the unit geometry bounds supplement this
interaction measurement.

Values below are milliseconds: median (minimum–maximum).

| Browser / repeat | Command before | Command after | Rendering before   | Rendering after     |
| ---------------- | -------------- | ------------- | ------------------ | ------------------- |
| Chromium / 0     | 1.25 (0.9–1.5) | 1.1 (0.8–1.4) | 27.35 (26.3–28.8)  | 28.1 (26.5–28.5)    |
| Chromium / 200   | 1.15 (1.0–1.6) | 1.3 (0.9–1.4) | 106.1 (76.3–167.4) | 103.95 (71.0–138.7) |
| Firefox / 0      | 2.0 (1–2)      | 1.0 (0–2)     | 18.5 (10–28)       | 26.5 (11–28)        |
| Firefox / 200    | 2.0 (1–3)      | 1.5 (1–2)     | 51.0 (41–58)       | 47.5 (39–57)        |

All four final timing scenarios completed their behavior checks. The rendering
samples overlap and are noisy; no general speedup is claimed. Final measurement
used the isolated current build on port 5854, after other browser runs and builds
finished. Diagnostic logs remain under `/tmp`.
