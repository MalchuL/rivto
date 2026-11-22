# Root migration refactoring

## Comparison and scope

The review used the branch's merge base with local `main`, `50db9e92`, through
`819ff1a1` on `vs/rivto-root-migration`. Local `main` was at `a49ae45f`.
The branch delta contains 1,183 files. The review followed the changes through
Root, Page, Edgeless, the React host, editor core, document-model tests, demo
configuration, documentation, and Playwright coverage. The deleted keyboard
package is part of the move into Root. The edits below are the follow-up changes
in the worktree. An AST scan covered 1,122 added or modified JavaScript and
TypeScript files, including tests and demo code. It inventoried 11,407 functions
and methods with bodies and highlighted repeated positional arguments for
caller-by-caller inspection.

## Ownership and implementation

| Area | Applied change and reason |
| --- | --- |
| Panel registration | Replaced seven positional arguments with `registerPanel(root, options?)`. The host supplies the mounted occurrence and names its callbacks. Removed the unused document model from registry entries. Updated direct callers and fixtures that exercise replacement, rollback, focus, and removal. |
| React keyboard and selection | Four Page shortcuts share collapsed-caret and occurrence checks. Backspace behaviors still require offset zero. Forward Delete checks against the current block length. Selection, keyboard, and Edgeless consumers now borrow the existing viewport or registration operations their code uses. |
| Root input | The default `InputEvents` root contract requires observation and attachment checks. Group routing borrows listener identity without acquiring observer disposal. Normalized target and adjacent-occurrence lookups carry `RegionIdentity` through the browser adapter. Horizontal and vertical caret navigation share the mounted occurrence, selectors, mount callback, and current-attachment check. Direction determines traversal and how contentless owners are treated. Keyboard teardown stores its single transport disposer directly and still releases registrations in reverse order before disconnecting. |
| Root descendant lookup | `findOwnedRegion` uses a document-order DOM tree walker that prunes excluded subtrees. A captured row rechecks the nearest boundary on later accesses. Moving it into a nested block now prevents stale reads and writes. The regression moves the same element so a test of detached nodes alone cannot pass it. |
| Page drop geometry | Drop ancestor callbacks receive identity, attribute, matching, and containment operations. The resolver and measurement code expose the subset needed at each call. Layout-gap resolution carries its mounted items, point, flow direction, and cached measurements together through endpoint, pair, and gutter lookup. Binary searches use the same bounds. |
| Edgeless input and observation | CanvasView passes the mounted attachment snapshot and event registration into input hooks and size observation. Consumers can track replacement without reaching into the concrete viewport's attachment table. Drag admission and transform keyboard handling share the Alt/Shift update callback. |
| Edgeless cleanup | Six teardown paths share ordered failure collection. Each caller retains its rollback message and single-error policy. The size observer now runs both disposers even when attachment unsubscribe throws, and clears ownership before either callback can reenter. |
| Clipboard and core panels | Copy, cut, and each paste strategy borrow their specific block commands, selection methods, document identity, or history batching. The block and element facades borrow the document operations that enforce their boundaries. No extra runtime manager or forwarding layer was added. |
| Clipboard work | Resolving selected roots returns their original blocks in selection order. Paste uses the last root as a sibling anchor without cloning its subtree. Partial text copies clone the fields of each retained block and recurse only into selected children. Both newline strategies now use one validation and insertion path while retaining their selection-read order. The exported low-level insertion signature stays compatible. Ancestry resolution still reads and indexes the detached document forest. |
| Document-model coverage | Batch parent tests use the adapter's map and array operations to create duplicate, moved, and malformed placements. The cost assertion observes the backing array so reads through separate adapter wrappers count toward the same total. |
| Demo | Review capture takes the existing named block or element window settings. Block capture and element capture have separate read contracts. Snapshot assembly takes the captured forest and elements directly. The demo declares the Root package imported by its keyboard inventory. |
| Browser benchmarks | Eighteen scenarios share one native delivery timer. Each scenario owns its real input and editor-state assertions. The timer matches capture and bubble by event identity, records synchronous and two-frame durations, and releases its browser listeners and Playwright handles. |
| Documentation | Updated the host registration migration note, Edgeless viewport usage, and native-listener review. Historical source links point at the revision they describe. |

## Independent review and API impact

Reviewers traced creation, registration, use, replacement, and destruction across
package boundaries. Feedback led to a narrower clipboard document identity
return, one source of membership for clipboard-root selection, and explicit
cleanup on benchmark failure. Reviewers also identified the stale captured row,
the skipped size observer disconnect, and the demo's undeclared dependency.
Both lifecycle failures were reproduced before their fixes. A second review
traced RTL and wrap-row bounds, virtual holes, local caret navigation and
remount order. An independent clipboard comparison exercised 256 combinations
of nested selections, input order and copy mode against the branch revision.

Direct users of the concrete panel registry must switch to the options argument.
An `InputEvents` consumer whose factory uses additional Root operations must
declare its specific Root type. Page ancestor predicates can only use the
documented geometry operations. No persisted schema changed.

## Verification

- Workspace build and type checks passed, including package declarations, demo and docs. The integrated demo and standalone Page and Edgeless production demos built successfully.
- Workspace ESLint reported 638 warnings and zero errors. Prettier passed on the changed TypeScript, TSX and test JavaScript files. The shared Playwright timer also passed a standalone strict TypeScript check.
- `pnpm test` passed 806 tests across CRDT, document model, graph, editor core and Root. The standalone suites passed 611 Page tests, 142 Edgeless tests, 949 React tests and 17 demo tests. Together these runs exercised 2,525 tests.
- Chromium and Firefox passed 108 integrated behavior checks for panel focus and event registration, row hover, clipboard replacement, Page drag gaps and Edgeless preset routing. The standalone demos passed 22 Page layout checks and two Edgeless viewport resize/remount checks. Behavior runs used 12 workers.

### Browser performance

Performance checks used serial Chromium and Firefox runs against Vite
production previews. The baseline was a separate source archive of `819ff1a1`
built with the same frozen lockfile. Integrated scenarios used demo defaults
and `?repeat=200`. Standalone Page used one and 200 boards. The standalone
Edgeless scenarios exercised attachment, tool cancellation, transform start,
and toolbar dismissal, including fixtures with 10,000 elements.

The Page pointer check read **five nodes** in both builds, in both browsers,
for both Kanban and Bento at both sizes. It recorded zero block-ID reads and
zero notifications. A content edit read 15 nodes for Kanban and 22 for Bento
at both sizes. The resolver's median at 200 boards was 0.5 → 0.6 ms for
Chromium Kanban, 0.3 → 0.3 ms for Chromium Bento, and 1 → 1 ms for both in Firefox.

Selected integrated measurements are medians with sample minima and maxima in
parentheses. Each row compares the same browser, operation and fixture size.
The two-frame value includes event delivery and is a rendering proxy. Row hover
and horizontal caret entries below are for Page mode.

| Interaction | Browser | Repeat | Synchronous before → after, ms | Through two frames before → after, ms |
| --- | --- | ---: | --- | --- |
| structural-paste | chromium | 0 | 3.7 (3.5–4.9) → 2.9 (2.9–4.6) | 24.7 (22–30) → 23 (22.9–28.4) |
| structural-paste | chromium | 200 | 22.3 (21.5–26.6) → 22.5 (21–27.7) | 102.8 (98.1–112.1) → 102.5 (99.7–108.3) |
| structural-paste | firefox | 0 | 3 (2–3) → 2 (2–4) | 26 (12–28) → 21 (10–29) |
| structural-paste | firefox | 200 | 13 (11–15) → 13 (12–14) | 67 (58–89) → 61 (59–63) |
| page-gap-resolution | chromium | 0 | 1 (0.9–3.4) → 1 (0.8–2.7) | 15.9 (15.8–15.9) → 16.2 (16–16.2) |
| page-gap-resolution | chromium | 200 | 2.2 (2.1–4.3) → 2.5 (2.3–4.4) | 235.1 (231.7–235.4) → 231.6 (231–234.1) |
| page-gap-resolution | firefox | 0 | 2 (2–2) → 2 (1–2) | 16 (15–17) → 15 (14–15) |
| page-gap-resolution | firefox | 200 | 3 (3–4) → 3 (3–4) | 187 (181–188) → 194 (188–200) |
| horizontal-caret | chromium | 0 | 2 (1.8–2.3) → 1.5 (1.4–2.4) | 25.9 (19.4–26) → 25.2 (18.4–25.6) |
| horizontal-caret | chromium | 200 | 22.9 (22.9–23.8) → 24.2 (22–24.4) | 49 (48.1–49.2) → 49.3 (47–54.1) |
| horizontal-caret | firefox | 0 | 1 (1–2) → 1 (1–2) | 20 (19–21) → 19 (19–22) |
| horizontal-caret | firefox | 200 | 8 (7–8) → 10 (8–14) | 32 (30–35) → 34 (31–40) |
| backspace-merge | chromium | 0 | 3.8 (3.5–5.3) → 3.9 (3.5–5.5) | 22.5 (21.4–25.6) → 23.4 (21.3–28) |
| backspace-merge | chromium | 200 | 36 (35.3–41.4) → 30.8 (29.6–38.1) | 149.9 (143.8–155.1) → 141.1 (133.7–155.3) |
| backspace-merge | firefox | 0 | 2 (2–3) → 3 (3–4) | 28 (18–30) → 28 (19–30) |
| backspace-merge | firefox | 200 | 19 (18–20) → 19 (19–20) | 96 (95–106) → 95 (95–111) |
| block-row-hover | chromium | 0 | 0.3 (0.2–0.3) → 0.3 (0.3–0.3) | 25.2 (23.6–27.7) → 25.1 (21.8–26.8) |
| block-row-hover | chromium | 200 | 0.2 (0.2–0.4) → 0.3 (0.3–0.5) | 15.9 (14.9–25.8) → 21.6 (14.1–30.9) |
| block-row-hover | firefox | 0 | 0 (0–0) → 1 (1–1) | 24 (22–25) → 22 (21–23) |
| block-row-hover | firefox | 200 | 0 (0–1) → 1 (1–1) | 5 (5–6) → 14 (9–17) |
| edgeless-pointer-pan | chromium | 0 | 0.1 (0–0.1) → 0.1 (0–0.2) | 15.8 (15.8–16.5) → 16.1 (16–16.2) |
| edgeless-pointer-pan | chromium | 200 | 0.1 (0–0.2) → 0 (0–0.2) | 16.6 (15.9–17) → 16.2 (16–16.3) |
| edgeless-pointer-pan | firefox | 0 | 0 (0–0) → 0 (0–0) | 16 (15–16) → 16 (15–17) |
| edgeless-pointer-pan | firefox | 200 | 0 (0–0) → 1 (0–1) | 15 (15–15) → 16 (14–18) |

The focused browser set passed 132 behavior cases and 156 performance cases
across Chromium and Firefox. The latter includes all 18 scenarios migrated to
the shared timer, with their fixture sizes and mode combinations. The complete
repository-wide Playwright matrix was outside this run. The measurements above
describe individual interactions and do not establish an editor-wide speedup.

The first large Firefox Page-hover comparison showed a two-frame median of
5 → 14 ms. Repeating it in three fresh pages per build produced nine warm
samples each. The two-frame medians were 11 ms (5–16) before and 6 ms (5–14)
after. Synchronous medians were 0 → 1 ms, with both ranges 0–1 ms. The initial
two-frame increase did not reproduce.
