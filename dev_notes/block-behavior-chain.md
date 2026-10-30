# Prioritized block behavior chain

## Agreed scope

Move interaction policy out of React `BlockListPropsManager`, preserving the
existing outcomes while selecting behavior through explicit operation contexts.
The core defaults/validation manager, persisted shapes, and property validation
stay unchanged. Block factories remain separate from block-type registration.

## Ownership and applicability

Core `BlockListPropsManager` owns persisted defaults and validation; React owns
extension registration cleanup. The list extension installs three independent
behaviors: checkbox matches only checkbox, numbered matches all numbered modes,
and ordinary list matches all remaining marker values, including an absent marker.
Each preserves its original Enter conditions, marker deletion, inherited split
properties, checkbox reset, focus scheduling, and caller-owned transaction.
Ordinary split properties still replace any writing-factory listProps; relying
only on core defaults would change precedence and is intentionally avoided.

Collapse behavior checks current collapsed state for rendering, navigation,
selection, and drag. Native container behaviors independently match their native
types, preserving specialized Enter and column structural deletion. The container
base is abstract and no longer inherits generic outline handling; TODO storage
also has a concrete applicability predicate. Generic actions remain in the
ordinary registered DefaultBlockBehavior.

## Registration and dispatch

```ts
runtime.blockBehaviors.register(containerBehavior); // default priority 0
runtime.blockBehaviors.register(checkboxBehavior, -100);
runtime.blockBehaviors.register(numberedBehavior, -100);
runtime.blockBehaviors.register(listBehavior, -100);
// Runtime creation registers DefaultBlockBehavior at -1000 through the same API.
```

Larger priorities run first; equal priorities preserve registration order.
Priorities are finite and are not reserved. Each disposer removes only its own
registration; extension teardown owns their cleanup. Type-indexed get/has/delete
and the special fallback getter are removed. Behavior definitions own their
native-type checks; blockTypes registration delegates the same behavior instance
without introducing another implicit restriction.

The required isAvailable predicate receives a single BlockBehaviorAvailabilityContext:
editor and detached shallow persisted block fields. This context is common to all
methods. There is no union, kind, method name, movement data, or drag dependency in
availability. The called method owns operation-specific eligibility. Predicates
are synchronous, do not mutate state, and are reevaluated from current data rather
than cached by native type. Native applicability is a direct block.type comparison;
the former isBlockTypeAvailable wrapper and operation-context types are removed.

For movement, the registry checks source blocks and the current receiving parent
through the same availability predicate. Each registration matching any of these
blocks calls canMove once, in priority order. Candidate order follows sources, then
parent, stopping at the first availability match. Registrations without canMove
are skipped before availability. It does not call the permission hook
once per matching source, and never deduplicates candidates by ID: foreign sources
may collide with local parent IDs. The movement method alone receives BlockMoveContext:
sources, core destination, destination editor, and a parent resolved once or null.
The public registry query keeps its existing sources/destination request shape.
Root insertion evaluates source applicability without inventing a receiving block.

Dispatch skips omitted/unavailable handlers and stops at handled or rejected;
unhandled continues to the next applicable behavior. Inherited methods are invoked
normally. No reference comparison, special fallback append, or hidden default
priority by registration scope remains. resolveAll(context) selects applicable
instances. Action order is prepared only when registrations change; applicability
is reevaluated per query. Split properties are supplied by the onSplit that handles
the operation, with no separate property merge order or registration traversal.

canMove({ sources, destination }) checks source and receiver policies together.
The destination uses core parentId and optional beforeId; omitted beforeId appends.
It rejects empty sources, missing destination parents, and missing or mismatched
insertion neighbors. Foreign data is used directly, including colliding local IDs.
Root insertion supplies parent null, while source policies continue to apply.
Native structural behaviors match the supplied block type. Registry selection over
sources and receiving parent preserves their existing drag child/parent limits.

Drag geometry is extension annotation data under definition.metadata[PAGE_DRAG_METADATA_KEY]:
dropAxis, dropPlacement.allowChildPlacement, acceptsDropContainer, and fixed.
Universal handle hover belongs to metadata[BLOCK_HANDLE_METADATA_KEY]. BlockTypeManager owns
the complete definition and passes metadata directly to core without merging records.
Already defined native types are conflicts; registration rollback and cleanup release
the owned definition together with its presentation. Core lifecycle notifications
update metadata readers through blockTypes.subscribe(); core API stays
unchanged. getDefinition(type)?.metadata reads annotations and blockTypes.subscribe
reports shared annotation changes. Registering metadata does not enable extensions.
childDropIndent and gapDropZone remain global extension settings. The old resolve
metadata query, acceptsDrop, drop roles, separate drag registration, and behavior
geometry fields are removed. Parent onChildIndent/onChildOutdent intercept child
outline operations before the child chain; handled/rejected stop the operation.
CanonicalDropPlacement, with adjacent IDs and depth, remains
inside dragging for visual placement and stale-gap validation. Drag converts it
to core destination before asking canMove for preview and again at commit.

Keyboard block moves and outline Tab/Shift+Tab also ask canMove. Outdent preflights
both lifted roots and the following siblings adopted by the last lifted root,
before any writes. Single-root outline checks read shallow nodes, not a forest.
Core operations, persisted schema, rich action context, and mutation ownership
remain unchanged. Direct core mutations are not routed through React permissions.

## Composition contracts

- Split properties merge from low to high priority; later registrations win ties,
  matching the previous list-property merge order. When no behavior provides properties, the result is
  `undefined`, preserving writing defaults.
- Child visibility requires all applicable predicates to permit the children.
  Any explicit `false` hides them, regardless of priority.
- Semantic move predicates use a false veto for source and receiver restrictions.
  Priority orders checks but cannot override refusal. These checks do not replace
  hierarchy validation by block managers.
- Structural deletion calls each behavior instance once for the entire selection,
  even when selected blocks have different native types. A handled or rejected
  result claims the complete selection. Already visited chains are skipped before
  constructing another recursive block snapshot.

The default action order remains native container behavior, applicable list behavior,
and generic outline behavior. List-property defaults still merge in their core
registration order, independently of behavior priority.

## Previous chain verification (before operation-context migration)

The unchanged baseline passed all 415 React Jest tests. The final implementation
passes 424 tests across 68 suites. Existing expectations and checked behavior were
retained; moved list actions are called through the chain or their new owning
class. Added tests cover priorities, stable ties, missing/inherited methods,
individual disposal, extension cleanup, split continuation, visibility/drop vetoes,
metadata inheritance, invalid registration, and table-cell Enter before list logic.

Production-demo browser checks passed in Chromium and Firefox with
`--workers=12`: 150 existing checks across collapse, selection, history deletion,
columns, clipboard/drag, bullet threading, and block-number work bounds. Eight
new browser checks cover shared structural deletion, claim/continue semantics,
column-content preservation, undo, and bounded snapshot reads for 1 and 200
selected blocks. The final deletion edit was followed by all 26 new/deletion
checks passing. No parallel failures required a serial retry.

Workspace type checks and build passed, including package declarations and docs.
Final React type checks and workspace lint passed; lint reports warnings only.
The final production demo was rebuilt before interaction measurements.

Interaction measurements use the unchanged demo defaults at `repeat=0` and
`repeat=200`, production Vite preview on port 5189, and serial Chromium/Firefox
runs with no concurrent checks or builds. Actual keyboard input exercises normal
Enter splitting, separator insertion, empty checkbox Enter, and collapse. Each
case has one warm-up and three equivalent measured samples, restoring state with
undo. Timings separate synchronous keyboard dispatch (including subscribers)
from two animation frames as a rendering proxy. Checks assert document state,
DOM/caret, children visibility, and undo, so a fast no-op fails.

### Before/after measurements

Values are milliseconds: median [minimum, maximum] across three measured samples.
Rendering is measured from command start through two animation frames. These
samples detect gross regressions; they do not establish a speedup or characterize
the complete timing distribution. The large demo retains substantial rendering
and subscriber cost, as it did before this refactor.

| Browser  | repeat | Interaction          | Command before → after                | Rendering before → after                    |
| -------- | -----: | -------------------- | ------------------------------------- | ------------------------------------------- |
| chromium |      0 | split Enter          | 1.7 [1.6, 1.7] → 1.6 [1.6, 1.9]       | 28.2 [28.1, 28.6] → 28.1 [27.7, 28.3]       |
| chromium |      0 | separator insertion  | 1.2 [1.2, 1.3] → 1.1 [1.1, 1.3]       | 28.3 [27.6, 28.6] → 28.4 [27.4, 28.5]       |
| chromium |    200 | split Enter          | 26.7 [24.5, 47.9] → 21.1 [20.0, 22.8] | 457.7 [430.4, 532.8] → 335.1 [332.9, 337.6] |
| chromium |    200 | separator insertion  | 24.0 [21.9, 29.2] → 21.4 [21.2, 22.8] | 382.3 [355.7, 429.7] → 340.7 [333.4, 379.2] |
| firefox  |      0 | split Enter          | 2.0 [2.0, 4.0] → 2.0 [2.0, 4.0]       | 26.0 [25.0, 26.0] → 26.0 [25.0, 26.0]       |
| firefox  |      0 | separator insertion  | 2.0 [2.0, 2.0] → 2.0 [2.0, 3.0]       | 26.0 [26.0, 26.0] → 26.0 [25.0, 26.0]       |
| firefox  |    200 | split Enter          | 36.0 [36.0, 40.0] → 32.0 [32.0, 33.0] | 460.0 [411.0, 471.0] → 391.0 [374.0, 404.0] |
| firefox  |    200 | separator insertion  | 40.0 [36.0, 42.0] → 36.0 [36.0, 37.0] | 452.0 [431.0, 453.0] → 403.0 [397.0, 409.0] |
| chromium |      0 | empty checkbox Enter | 1.1 [0.8, 1.3] → 0.7 [0.6, 0.7]       | 28.4 [28.3, 29.1] → 29.5 [28.9, 29.9]       |
| chromium |      0 | collapse             | 0.9 [0.7, 0.9] → 0.7 [0.5, 1.0]       | 25.6 [25.4, 26.0] → 27.0 [26.8, 27.3]       |
| chromium |    200 | empty checkbox Enter | 5.9 [5.7, 6.1] → 5.6 [5.4, 5.6]       | 87.6 [86.1, 114.2] → 72.6 [72.0, 73.5]      |
| chromium |    200 | collapse             | 5.4 [5.3, 6.5] → 5.5 [4.8, 5.9]       | 274.2 [270.3, 280.5] → 250.6 [238.5, 253.3] |
| firefox  |      0 | empty checkbox Enter | 1.0 [1.0, 1.0] → 1.0 [1.0, 1.0]       | 28.0 [27.0, 28.0] → 27.0 [27.0, 28.0]       |
| firefox  |      0 | collapse             | 1.0 [1.0, 1.0] → 2.0 [1.0, 2.0]       | 28.0 [28.0, 31.0] → 28.0 [28.0, 28.0]       |
| firefox  |    200 | empty checkbox Enter | 6.0 [5.0, 7.0] → 7.0 [5.0, 7.0]       | 25.0 [24.0, 25.0] → 25.0 [24.0, 25.0]       |
| firefox  |    200 | collapse             | 6.0 [5.0, 6.0] → 5.0 [5.0, 7.0]       | 163.0 [149.0, 167.0] → 141.0 [141.0, 141.0] |

## Previous operation-context migration verification

The immediately preceding implementation passed 424 tests across 68 React suites.
After replacing type/shared registration with context-based applicability and
splitting list behaviors, all 439 tests across 69 suites pass. Existing content,
marker deletion, outline floors, selection, focus, and undo assertions remain;
registry API assertions were migrated to the agreed context-based contract.
New checks cover operation-specific availability, changes to properties without
changing native type, independent source/destination roles, colliding foreign IDs,
root and missing-parent drops, and split precedence over writing-factory listProps.
The previous reference-identity cache assertion was replaced because applicability
is deliberately reevaluated rather than cached by type.

Production Chromium/Firefox behavior runs with workers=12 passed 170 existing/new
checks, followed by 112 container/availability checks and eight embedding-transfer
checks. These are 282 distinct passing browser checks (290 successful executions,
including repeated block-behavior checks). Two already-skipped TODO keyboard-status
ordering cases remain skipped, one per browser. There were no failures requiring
workers=1 retries. The new live-rendering check changes visibility properties on
one of two same-type blocks and verifies only that block's children disappear.
Structural deletion retains bounded recursive snapshot reads for both 1 and 200
selected roots, and native table-cell/empty-TODO-container Enter remains specialized.

Workspace type checks, workspace build (including declarations and docs), final
production demo build, workspace lint, and diff whitespace checks pass. Lint has
warnings only. Core persisted storage/schema/factory contracts were not changed.
The public behavior registration API is intentionally changed: custom behaviors
must supply isAvailable, and container subclasses no longer inherit generic actions.

### Operation-context before/after timings

Fresh production baselines and final measurements use identical demo defaults,
repeat=0/200, and Vite preview on port 5189. Runs are serial in each browser with
no concurrent builds/tests. Each interaction has one warm-up and three measured
samples with undo restoring equivalent state. Keyboard command timing wraps the
complete synchronous keyboard dispatch including subscribers. Pointer command
timing wraps moveBlocks during actual pointer input, including its synchronous
subscribers; it does not include the entire drag gesture or hit-testing time.
Rendering is the interval from command start through two animation frames, not a
claim that all asynchronous layout has settled. Correctness checks cover actual
splits/marker changes, collapse mounting/caret, source order and parent after drop,
selection, preserved content, and undo restoration.

Values below are milliseconds: median [minimum, maximum]. The results show no
gross regression; three samples do not establish a speedup or a timing guarantee.
Large-demo rendering remains relatively expensive before and after this refactor.

| Browser  | repeat | Interaction          | Command before → after                | Rendering before → after                    |
| -------- | -----: | -------------------- | ------------------------------------- | ------------------------------------------- |
| chromium |      0 | split Enter          | 1.5 [1.3, 1.6] → 1.7 [1.5, 1.7]       | 28.1 [27.9, 28.8] → 28.3 [28.1, 28.8]       |
| chromium |      0 | separator insertion  | 1.3 [1.1, 1.4] → 1.2 [1.2, 1.3]       | 27.9 [27.8, 28.6] → 28.6 [28.3, 29.1]       |
| chromium |    200 | split Enter          | 23.2 [19.9, 31.8] → 20.6 [19.9, 22.7] | 322.1 [314.1, 338.3] → 339.4 [320.0, 343.2] |
| chromium |    200 | separator insertion  | 21.9 [21.3, 22.6] → 21.7 [20.7, 22.9] | 337.0 [324.3, 353.7] → 327.0 [326.5, 361.0] |
| firefox  |      0 | split Enter          | 3.0 [2.0, 4.0] → 2.0 [2.0, 4.0]       | 25.0 [25.0, 26.0] → 26.0 [26.0, 26.0]       |
| firefox  |      0 | separator insertion  | 2.0 [1.0, 2.0] → 2.0 [1.0, 2.0]       | 27.0 [26.0, 27.0] → 27.0 [24.0, 27.0]       |
| firefox  |    200 | split Enter          | 34.0 [34.0, 38.0] → 35.0 [34.0, 42.0] | 410.0 [376.0, 420.0] → 414.0 [386.0, 432.0] |
| firefox  |    200 | separator insertion  | 34.0 [33.0, 35.0] → 37.0 [35.0, 38.0] | 387.0 [370.0, 391.0] → 391.0 [375.0, 400.0] |
| chromium |      0 | empty checkbox Enter | 0.7 [0.6, 0.7] → 0.6 [0.6, 0.7]       | 29.4 [29.3, 29.4] → 30.1 [29.4, 30.3]       |
| chromium |      0 | collapse             | 0.7 [0.6, 1.1] → 0.7 [0.5, 0.9]       | 26.7 [26.6, 27.5] → 27.6 [27.3, 28.1]       |
| chromium |    200 | empty checkbox Enter | 5.6 [5.5, 5.8] → 5.3 [5.3, 5.9]       | 71.4 [71.2, 79.7] → 69.6 [69.5, 69.9]       |
| chromium |    200 | collapse             | 5.2 [5.0, 5.9] → 5.3 [4.9, 6.7]       | 248.7 [243.9, 257.2] → 242.8 [123.2, 254.8] |
| firefox  |      0 | empty checkbox Enter | 1.0 [1.0, 1.0] → 1.0 [0.0, 1.0]       | 27.0 [26.0, 27.0] → 26.0 [26.0, 28.0]       |
| firefox  |      0 | collapse             | 1.0 [1.0, 2.0] → 1.0 [0.0, 1.0]       | 28.0 [27.0, 28.0] → 28.0 [27.0, 28.0]       |
| firefox  |    200 | empty checkbox Enter | 7.0 [6.0, 7.0] → 6.0 [6.0, 7.0]       | 25.0 [25.0, 26.0] → 25.0 [24.0, 26.0]       |
| firefox  |    200 | collapse             | 7.0 [6.0, 10.0] → 6.0 [5.0, 7.0]      | 148.0 [144.0, 163.0] → 147.0 [143.0, 155.0] |
| chromium |      0 | pointer drop         | 1.0 [1.0, 1.1] → 1.0 [0.9, 1.3]       | 29.1 [28.5, 29.6] → 29.4 [21.9, 29.8]       |
| chromium |    200 | pointer drop         | 10.0 [10.0, 10.9] → 10.3 [10.1, 13.5] | 182.5 [144.0, 185.7] → 158.2 [152.8, 164.3] |
| firefox  |      0 | pointer drop         | 2.0 [1.0, 2.0] → 2.0 [1.0, 2.0]       | 27.0 [27.0, 29.0] → 27.0 [26.0, 27.0]       |
| firefox  |    200 | pointer drop         | 24.0 [22.0, 27.0] → 22.0 [21.0, 24.0] | 234.0 [230.0, 248.0] → 236.0 [230.0, 251.0] |

## Previous semantic move separation verification

The pre-change baseline passed 439 React tests across 69 suites. The final change
passes 442 tests across 70 suites. Existing behavior assertions for hierarchy,
content, visibility, placement, selection, and undo were retained. Tests using the
removed drop API now use semantic destinations; the metadata-merging test was
replaced by type-owned geometry registration, disposal, rollback, and destruction
coverage. New headless checks exercise movement vetoes without a drag extension,
shallow source reads, and atomic outdent when either the lifted roots or adopted
sibling tail is refused. Foreign source tests retain colliding IDs and check that
source data is passed directly, receiving parents are current, root policies apply,
and missing parents or invalid insertion neighbors are rejected.

Final production browser verification passed in Chromium and Firefox:

- 268 checks with workers=12 across behavior-chain, container-summaries,
  page-drag-container-boundary, columns, bento, kanban, nested-containers,
  todo-storage, selection, structured-selection, clipboard-drag, collapse, and
  bullet-threading. Two existing TODO keyboard-status scenarios remain test.skip.
- These include 16 new checks for veto/allow behavior with real Tab, Shift+Tab,
  Alt+Shift+ArrowUp, and pointer dragging in page and edgeless. They assert unchanged
  state after refusal and actual movement, preserved content, and undo after allowance.
  The initial run had two Chromium edgeless fixture failures, reproduced with
  workers=1: the test read model selection before the DOM caret had been synchronized.
  Setup now captures the existing DOM caret into model selection before the command;
  exact selection assertions were preserved. The final parallel run passed all cases.
- Eight focused embedding checks with workers=12 cover dragging between documents,
  same-document page/edgeless embedding boundaries, cycles, and source handles.
- Four block-number work-bound checks with workers=1 cover Tab/Shift+Tab at repeat=0
  and repeat=200, preserved caret and gutter labels, undo/redo, at most one forest
  read, and fewer than 30 content queries.

Workspace check-types, build (including package declarations and docs), demo build,
and lint passed. Lint reports 457 warnings and zero errors. The complete E2E suite,
WebKit/Safari, and standalone host application builds were not run for this change.
Core mutation APIs and persisted schema were not changed. React permissions apply
at interaction call sites, not when a host directly invokes core mutation commands.

Fresh before/after timings use production demo builds served on dedicated preview
port 5189, default extensions and virtualization, repeat=0/200, serial Chromium and
Firefox, one warm-up and three samples per interaction. No concurrent test/build
runs contaminated these measurements. Undo restores equivalent state between
samples. Keyboard timing includes synchronous dispatch and subscribers. Pointer
timing covers the moveBlocks command during real dragging, not the complete gesture
or all hit testing. Rendering measures command start through two animation frames;
it does not prove all asynchronous layout has settled. Assertions check the actual
operation, order/parent/content, selection or caret, and undo restoration.

Values are milliseconds: median [minimum, maximum]. Timings are noisy: the Firefox
large-document Enter median increased from 33 to 38 ms while its rendering proxy
decreased from 399 to 374 ms. The data does not establish a speedup or a performance
guarantee. Large-document rendering remains expensive in both builds.

| Browser  | repeat | Interaction          | Command before → after                | Rendering before → after                    |
| -------- | -----: | -------------------- | ------------------------------------- | ------------------------------------------- |
| chromium |      0 | pointer drop         | 1.0 [0.8, 1.0] → 1.1 [0.9, 1.2]       | 29.7 [29.6, 29.8] → 29.7 [29.5, 30.2]       |
| chromium |    200 | pointer drop         | 10.5 [10.0, 13.2] → 11.9 [11.1, 16.0] | 151.2 [147.4, 154.7] → 153.7 [153.1, 156.3] |
| firefox  |      0 | pointer drop         | 2.0 [2.0, 3.0] → 2.0 [2.0, 3.0]       | 28.0 [26.0, 29.0] → 28.0 [27.0, 28.0]       |
| firefox  |    200 | pointer drop         | 27.0 [25.0, 27.0] → 24.0 [23.0, 27.0] | 236.0 [233.0, 240.0] → 222.0 [214.0, 237.0] |
| chromium |      0 | split Enter          | 1.5 [1.5, 1.6] → 1.4 [1.4, 1.6]       | 27.6 [27.5, 27.9] → 28.3 [28.1, 28.8]       |
| chromium |      0 | separator insertion  | 1.4 [1.2, 1.5] → 1.3 [1.2, 1.3]       | 28.0 [27.6, 28.8] → 28.3 [28.2, 28.4]       |
| chromium |    200 | split Enter          | 20.8 [20.0, 21.2] → 20.7 [20.3, 30.9] | 336.9 [336.4, 345.4] → 334.7 [329.7, 341.3] |
| chromium |    200 | separator insertion  | 21.3 [20.5, 22.1] → 22.0 [21.2, 24.1] | 332.5 [327.0, 365.1] → 330.3 [322.9, 351.6] |
| firefox  |      0 | split Enter          | 2.0 [2.0, 4.0] → 3.0 [2.0, 4.0]       | 25.0 [24.0, 26.0] → 25.0 [24.0, 25.0]       |
| firefox  |      0 | separator insertion  | 2.0 [1.0, 3.0] → 2.0 [2.0, 3.0]       | 27.0 [27.0, 29.0] → 26.0 [25.0, 26.0]       |
| firefox  |    200 | split Enter          | 33.0 [33.0, 36.0] → 38.0 [36.0, 39.0] | 399.0 [393.0, 418.0] → 374.0 [372.0, 394.0] |
| firefox  |    200 | separator insertion  | 37.0 [36.0, 39.0] → 38.0 [38.0, 40.0] | 407.0 [391.0, 409.0] → 399.0 [388.0, 401.0] |
| chromium |      0 | empty checkbox Enter | 0.8 [0.7, 0.8] → 0.6 [0.5, 0.6]       | 29.4 [29.2, 29.9] → 29.7 [29.3, 29.7]       |
| chromium |      0 | collapse             | 0.7 [0.7, 1.3] → 0.8 [0.7, 0.8]       | 26.4 [24.8, 26.5] → 27.1 [25.9, 27.8]       |
| chromium |    200 | empty checkbox Enter | 5.6 [5.5, 5.7] → 5.3 [5.1, 6.0]       | 73.3 [70.2, 80.3] → 70.8 [69.1, 76.3]       |
| chromium |    200 | collapse             | 5.4 [5.1, 5.7] → 5.0 [4.9, 5.8]       | 251.5 [127.8, 253.4] → 244.6 [123.1, 247.0] |
| firefox  |      0 | empty checkbox Enter | 1.0 [0.0, 2.0] → 1.0 [0.0, 1.0]       | 27.0 [26.0, 28.0] → 28.0 [26.0, 29.0]       |
| firefox  |      0 | collapse             | 1.0 [1.0, 1.0] → 1.0 [1.0, 2.0]       | 27.0 [26.0, 28.0] → 28.0 [27.0, 28.0]       |
| firefox  |    200 | empty checkbox Enter | 6.0 [5.0, 7.0] → 6.0 [6.0, 7.0]       | 25.0 [24.0, 25.0] → 25.0 [25.0, 25.0]       |
| firefox  |    200 | collapse             | 6.0 [6.0, 7.0] → 6.0 [5.0, 9.0]       | 149.0 [144.0, 160.0] → 142.0 [141.0, 155.0] |

## Previous removal of operation names from availability

Availability now describes data rather than the method being called. The single
block context used kind block and was shared by split inheritance, onSplit,
childrenVisible, structural deletion, and other editing methods. Movement uses
kind move with sources, destination, and the resolved parent. Neither context
contains operation or a method name. Each method owns any eligibility specific
to its operation. Built-in handlers, priorities, transactions, hierarchy checks,
and selection/undo behavior are unchanged.

The registry, structural-deletion caller, native/list/collapse predicates,
fixtures, browser registrations, and public documentation use the new discriminator.
The operation-filtering registry test now verifies the intended shared availability:
disabled data skips methods; enabled data calls visibility, split inheritance, and
split handling through the same predicate. It explicitly checks operation is absent
in both block and movement contexts. Existing outcome, hierarchy, content, caret,
and undo assertions in the behavioral suites remain in place.

Validation after the final implementation change:

- All 442 React Jest tests passed across 70 suites; the focused four suites passed
  39 checks before the full run.
- 64 production Chromium/Firefox checks passed with workers=12 across
  block-behavior-chain, collapse, history-delete, and columns. No browser failures
  needed a serial retry. Page and edgeless veto/allow, drag, structural deletion,
  dynamic visibility, caret/selection, and undo remain covered.
- Workspace build, demo build, check-types, and lint passed. Lint reports 457
  warnings and zero errors. The complete E2E suite and Safari were not run.

Fresh baseline and final production builds use the same dedicated Vite preview on
port 5189, demo defaults, repeat=0/200, serial Chromium and Firefox, one warm-up and
three samples with undo restoring equivalent state. No agent-owned builds or tests
ran concurrently with measurements. Keyboard command timing includes synchronous
dispatch and subscribers; pointer timing covers moveBlocks during actual dragging.
Rendering is the interval through two animation frames, not proof all asynchronous
layout has settled. Assertions check the real split/insertion/drop, roots and
parent, content, selection/caret, and undo.

Values below are milliseconds: median [minimum, maximum]. Measurements remain
noisy. Chromium's repeat=200 separator rendering proxy rose from 328.1 to 491.1 ms,
with a 793.7 ms sample; these samples do not isolate the cause or establish a
speedup or absence of regression. No renderer or performance optimization is
part of this API simplification.

| Browser  | repeat | Interaction         | Command before → after                | Rendering before → after                    |
| -------- | -----: | ------------------- | ------------------------------------- | ------------------------------------------- |
| chromium |      0 | split Enter         | 1.5 [1.5, 1.5] → 2.1 [1.8, 2.7]       | 28.2 [27.7, 28.2] → 26.0 [23.5, 26.2]       |
| chromium |      0 | separator insertion | 1.2 [1.2, 1.3] → 2.1 [1.9, 2.5]       | 28.4 [27.9, 28.5] → 27.4 [25.3, 29.4]       |
| chromium |    200 | split Enter         | 22.5 [22.5, 31.6] → 20.9 [20.3, 22.6] | 383.0 [329.5, 388.7] → 371.9 [358.9, 386.3] |
| chromium |    200 | separator insertion | 24.2 [22.8, 24.8] → 26.6 [24.3, 56.4] | 328.1 [326.6, 369.6] → 491.1 [424.8, 793.7] |
| firefox  |      0 | split Enter         | 2.0 [2.0, 3.0] → 3.0 [2.0, 5.0]       | 25.0 [25.0, 26.0] → 22.0 [21.0, 23.0]       |
| firefox  |      0 | separator insertion | 2.0 [2.0, 2.0] → 2.0 [2.0, 2.0]       | 27.0 [27.0, 28.0] → 24.0 [23.0, 25.0]       |
| firefox  |    200 | split Enter         | 34.0 [32.0, 35.0] → 35.0 [34.0, 37.0] | 402.0 [366.0, 405.0] → 379.0 [371.0, 418.0] |
| firefox  |    200 | separator insertion | 35.0 [32.0, 36.0] → 34.0 [33.0, 37.0] | 390.0 [379.0, 396.0] → 392.0 [371.0, 414.0] |
| chromium |      0 | pointer drop        | 0.9 [0.8, 1.2] → 0.9 [0.9, 1.2]       | 29.5 [29.4, 30.2] → 29.6 [29.5, 29.9]       |
| chromium |    200 | pointer drop        | 10.9 [10.3, 11.5] → 10.2 [9.9, 11.0]  | 151.8 [148.2, 170.5] → 155.9 [151.7, 178.0] |
| firefox  |      0 | pointer drop        | 1.0 [1.0, 2.0] → 2.0 [1.0, 2.0]       | 27.0 [27.0, 28.0] → 28.0 [27.0, 28.0]       |
| firefox  |    200 | pointer drop        | 24.0 [23.0, 29.0] → 24.0 [23.0, 25.0] | 233.0 [223.0, 256.0] → 231.0 [217.0, 231.0] |

## Common applicability context verification

The current applicability contract is one interface with editor and detached block
fields. BlockOperationContext, BlockMoveOperationContext, the union, kind, and the
isBlockTypeAvailable wrapper are removed. Native predicates compare block.type
while list/collapse predicates inspect their persisted fields. Method names and
movement arguments never enter isAvailable. Split inheritance, child visibility,
keyboard actions, and structural deletion all pass the same context shape.

The registry considers moved source snapshots followed by the receiving parent
as availability candidates. It stops at the first match for each registration and
calls that registration's canMove at most once, preserving priority. A false
permission stops later hooks. Registrations without a permission hook are skipped
before applicability. Foreign source fields are used directly, including IDs that
collide with the local parent; the parent is resolved once. Root moves have source
candidates and parent null. Native shell constraints remain in canMove, and generic
core hierarchy validation still owns mutation invariants.

BlockMoveContext now describes only the permission method's arguments: sources,
destination, destination editor, and resolved parent. The public registry query
continues to accept only sources and destination, using a Pick of that interface.
There is no second movement context type, compatibility alias, role, discriminator,
or drag-specific data. Type-owned drag geometry, core APIs, persisted schema,
transactions, factory logic, and interaction outcomes are unchanged.

Final verification:

- All 443 React Jest tests passed across 70 suites. Five focused suites first passed
  44 checks. The new regression combines several matching sources and a receiver,
  checks exactly one hook call per registration, preserves priority, skips unavailable
  hooks, verifies one parent read without resolving foreign IDs, and checks that the
  query does not mutate the tree. The existing veto check also asserts later hooks
  are skipped after refusal and run after the veto registration is disposed.
- 178 production Chromium/Firefox behavior checks passed with workers=12 across
  block-behavior-chain, collapse, history-delete, columns, bento, kanban,
  nested-containers, todo-storage, container-summaries, and page-drag-container-boundary.
  Two existing TODO keyboard-status scenarios remain test.skip. All browser checks
  passed in parallel; no failure required a serial retry.
- The 16 movement permission scenarios in behavior-chain now select through real
  block properties: indent matches only the receiving parent; outdent, reorder, and
  pointer drag match a moved source. Existing tree/content/selection/undo assertions
  are retained in page and edgeless.
- Eight embedding checks passed with workers=12 for foreign-document transfer,
  same-document page/edgeless movement, cycle restrictions, and source handles.
- Four work-bound checks passed with workers=1 at repeat=0/200, retaining Tab/Shift+Tab
  depth, caret and gutter labels, undo/redo, at most one forest read, and fewer than
  30 content queries.
- Workspace build, demo build, workspace check-types, and lint passed. After the final
  contract documentation review, the React package/declarations were rebuilt, React
  typecheck and all 443 tests passed again, and lint reported 458 warnings and zero
  errors. Transpilation with comments removed proved that the final JSDoc review
  leaves emitted runtime code unchanged, so browser checks and timings remain applicable.
- The complete E2E suite, Safari, standalone host application builds, and the core-only
  Jest suite were not run for this React contract refactor.

Fresh baseline/final timings use production demo builds on dedicated Vite preview
port 5189, default extensions and virtualization, repeat=0/200, serial Chromium
and Firefox, one warm-up and three measured samples. Undo restores equivalent
state. No agent-owned build or test ran concurrently with measurements. Keyboard
command duration includes synchronous dispatch and subscribers. Pointer duration
covers moveBlocks during a real gesture, excluding complete hit-testing duration.
The rendering proxy spans command start through two animation frames and does not
prove all asynchronous layout has settled. Assertions cover actual operations,
roots/order/parent/content, selection or caret, and undo.

Values are milliseconds: median [minimum, maximum]. Three samples do not establish
a speedup or a performance guarantee. Large-document split rendering remains noisy:
Chromium's proxy rose from 362.7 to 419.3 ms while separator insertion fell from
395.3 to 342.2 ms. No performance optimization is claimed for this contract change.

| Browser  | repeat | Interaction         | Command before → after                | Rendering before → after                    |
| -------- | -----: | ------------------- | ------------------------------------- | ------------------------------------------- |
| chromium |      0 | pointer drop        | 1.1 [1.1, 4.0] → 1.1 [0.9, 1.2]       | 29.9 [23.6, 30.1] → 29.3 [28.5, 30.0]       |
| chromium |    200 | pointer drop        | 10.9 [10.4, 11.5] → 11.2 [11.2, 12.2] | 176.0 [174.1, 182.1] → 173.0 [171.1, 176.5] |
| firefox  |      0 | pointer drop        | 2.0 [2.0, 2.0] → 1.0 [1.0, 2.0]       | 27.0 [26.0, 28.0] → 27.0 [27.0, 27.0]       |
| firefox  |    200 | pointer drop        | 25.0 [23.0, 27.0] → 27.0 [26.0, 28.0] | 266.0 [254.0, 267.0] → 250.0 [240.0, 274.0] |
| chromium |      0 | split Enter         | 1.5 [1.3, 1.6] → 1.7 [1.4, 1.8]       | 28.1 [28.0, 28.4] → 27.5 [27.5, 27.5]       |
| chromium |      0 | separator insertion | 1.1 [1.1, 1.2] → 1.6 [1.2, 2.0]       | 28.8 [28.0, 28.9] → 28.3 [27.9, 28.9]       |
| chromium |    200 | split Enter         | 22.0 [20.9, 35.7] → 24.4 [21.9, 34.9] | 362.7 [349.3, 393.0] → 419.3 [418.9, 429.6] |
| chromium |    200 | separator insertion | 23.5 [21.7, 30.5] → 23.3 [21.6, 23.6] | 395.3 [382.7, 428.9] → 342.2 [327.7, 383.9] |
| firefox  |      0 | split Enter         | 2.0 [2.0, 3.0] → 2.0 [1.0, 2.0]       | 24.0 [23.0, 25.0] → 26.0 [24.0, 26.0]       |
| firefox  |      0 | separator insertion | 2.0 [2.0, 3.0] → 1.0 [1.0, 2.0]       | 26.0 [25.0, 27.0] → 25.0 [25.0, 27.0]       |
| firefox  |    200 | split Enter         | 35.0 [34.0, 36.0] → 37.0 [32.0, 47.0] | 407.0 [401.0, 417.0] → 438.0 [380.0, 443.0] |
| firefox  |    200 | separator insertion | 40.0 [39.0, 41.0] → 37.0 [33.0, 38.0] | 438.0 [412.0, 441.0] → 373.0 [371.0, 377.0] |

## Split continuation belongs to onSplit

The separate split-property hook and registry merge pass are removed. Each list
behavior now handles Enter in its onSplit: checkbox continuation resets checked,
all numbered modes continue as numbered_list, and ordinary lists use fresh list
defaults. Empty-marker transitions retain their original identity, hierarchy, and
unrelated properties. Priority and tie order follow normal action dispatch; the
first handled or rejected outcome stops the chain, with no property aggregation.
Native container handlers still run before list handlers.

The shared splitBlock function contains the existing complete Enter algorithm:
one-level empty-block outdent, text split, visible-branch child placement,
edgeless card range extension, model selection, and deferred DOM focus. The
caller still owns the transaction. splitBlockAt accepts explicit continuation
listProps; omitting them retains writing-factory defaults without consulting the
behavior registry. It replaces factory listProps when explicit continuation is
provided, while core defaults and validation still run. Neither helper is added
to the package's public exports.

Validation after the implementation:

- All 456 React Jest tests passed in 73 suites. List continuation tests dispatch
  onSplit in both editor modes, cover every built-in list marker plus an absent
  marker, preserve factory override precedence, and verify caret and undo.
- 48 Chromium/Firefox checks passed with workers=12 across lists, collapse, and
  columns. The eight new scenarios per browser cover checkbox/numbered splits in
  page/edgeless, expanded/collapsed children, DOM focus and caret offset, card range,
  and undo. No failures required a workers=1 rerun.
- React package typecheck, JS/declaration/style build, and workspace lint passed.
  Lint reported 465 warnings and no errors.
- demo:build failed both before and after with the same 24 TypeScript diagnostics
  from duplicate/incompatible React and Zod dependency types. The browser checks
  and measurements used successful direct Vite production builds, with the demo's
  typecheck reported separately rather than bypassed silently.
- The full E2E suite and Safari were not run.

Fresh before/after production Vite bundles were served on dedicated port 5197.
Serial Chromium and Firefox runs used demo defaults at repeat=0 and repeat=200,
adding one paragraph root before the existing document for an equivalent split
fixture. The default extensions, demo chrome, and virtualization settings remained
in use. Each list/checkbox scenario had one warm-up and three recorded samples,
restoring equivalent state with keyboard undo after each Enter. Assertions checked
both text halves, unchanged source properties, reset continuation properties,
DOM caret at the new block's start, and removal of the new block on undo.

Command timing includes synchronous keyboard dispatch and subscribers. Rendering
is elapsed time through two animation frames and is only a proxy for rendering,
not proof that all asynchronous layout has settled. No build or other test run
ran concurrently with measurements. Values below are median [min, max] in ms;
these samples do not establish a performance improvement or a universal budget.

| Browser  | repeat | Split marker | Command before → after           | Rendering before → after                    |
| -------- | -----: | ------------ | -------------------------------- | ------------------------------------------- |
| chromium |      0 | list         | 1.1 [1.0, 1.1] → 0.8 [0.8, 0.9]  | 27.4 [27.2, 27.4] → 28.1 [27.5, 28.2]       |
| chromium |      0 | checkbox     | 1.0 [1.0, 1.0] → 0.9 [0.8, 1.2]  | 27.7 [27.6, 28.0] → 28.2 [25.4, 28.3]       |
| chromium |    200 | list         | 4.0 [3.8, 4.2] → 4.4 [4.2, 4.8]  | 174.9 [172.3, 218.0] → 179.3 [174.9, 190.8] |
| chromium |    200 | checkbox     | 4.3 [4.2, 6.0] → 4.3 [3.9, 5.5]  | 207.1 [206.2, 213.3] → 220.2 [213.7, 323.1] |
| firefox  |      0 | list         | 2.0 [1.0, 2.0] → 2.0 [1.0, 2.0]  | 24.0 [24.0, 26.0] → 25.0 [24.0, 25.0]       |
| firefox  |      0 | checkbox     | 1.0 [1.0, 1.0] → 2.0 [1.0, 2.0]  | 26.0 [25.0, 27.0] → 25.0 [25.0, 26.0]       |
| firefox  |    200 | list         | 7.0 [6.0, 10.0] → 6.0 [6.0, 8.0] | 153.0 [149.0, 159.0] → 154.0 [147.0, 163.0] |
| firefox  |    200 | checkbox     | 7.0 [6.0, 10.0] → 7.0 [6.0, 8.0] | 159.0 [153.0, 166.0] → 156.0 [151.0, 169.0] |
