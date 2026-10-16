# Hardcoded block behavior inventory

Date: 2026-10-14. Checkout: `rivto-qol_5`.

This inventory records the pre-refactor source. See
[Block factory contract refactor](block-factory-refactor.md) for the implementation
and its validation results.

This investigation covers explicit block types, block construction, conversion,
empty-content checks, clipboard fallbacks, and type selectors in `packages/`,
`app/`, and `demo/`. The main opportunities are in host applications and demo
construction. Shared editor behavior already delegates most writing and
separator decisions to registered facilities. No runtime code was changed.

## Existing facilities

- `ReactEditorApi.createDefaultBlock()` supplies the host writing-block input.
  The default implementation is installed by
  `packages/react-rivto-editor/src/extensions/built-ins/page/default-writing-block/register.ts:26-30`.
- `ReactEditorApi.isEmptyBlock()` supplies the host emptiness policy.
  `default-writing-block/utils.ts:19` implements its default as
  `block.type === type && block.content === ""`. This is the intended owning
  implementation, rather than a duplicated paragraph check elsewhere. The
  default predicate does not inspect children, props, or plugin data.
- `blockTypes.separatesBlockElements(type)` and
  `getDefaultBlockElementSeparatorType()` use registered metadata in
  `packages/react-rivto-editor/src/managers/blocks/block-type-manager.ts:144-150`.
- `insertBlockElementSeparator()` in
  `packages/react-rivto-editor/src/elements/block-element-projection.ts:299`
  inserts the registered separator type. It currently constructs
  `{ type, content: "" }` itself; separator registration exposes a type/role,
  rather than a complete creation factory.
- Container factories already exist: `createColumnsBlockInput`,
  `createKanbanBlockInput`, `createTableBlockInput`, `createBentoBlockInput`.
  Seeded container slash conversion uses `convertLeafToContainer`.

## Places to review for centralization

| Location | Hardcoded behavior | Assessment |
| --- | --- | --- |
| `app/chulane/src/editor/create-page-editor.ts:82` | Inserts `{ type: "paragraph", content: leftover }` when recovering legacy text. | A React runtime already exists; this bypasses its default writing factory. |
| `app/rivto-editor/renderer/main.tsx:115,305` | Inserts `{ type: "paragraph", content: "" }` at startup and for New Document. | Two direct writing-factory bypasses. |
| `app/chulane/src/editor/snapshot.ts:13,74` | Locally defines `WRITING_BLOCK_TYPE = "paragraph"` and builds complete seed blocks. | Intentional snapshot construction without importing the React package; still a host contract coupled to the built-in type. A runtime factory is not directly available here. |
| `app/rivto-editor/renderer/documents.ts:115-136` | Markdown export branches on `kanban`, `table`, `separator`, `paragraph`, `columns-column`, `bento`, and `columns`. | A centralized app exporter that knows individual plugin types, hierarchy, empty-state labels, and separator formatting. Registered clipboard converters already provide a related formatting facility, but substituting them requires checking export semantics. |
| `demo/src/App.tsx:607,694` | Constructs `{ type: SEPARATOR_BLOCK_TYPE, content: "" }` directly for initial data and repeated cards. | Uses a constant rather than the registered-separator insertion helper. Deliberate demo data, but coupled to the built-in separator. |
| `demo/src/App.tsx` writing inputs | 37 explicit `type: DEFAULT_WRITING_BLOCK_TYPE` inputs, including nested seeds and test fixtures. | Constant reuse removes literal duplication, but does not use the host factory. Exact lines are in the appendix. |
| `demo/src/DocumentsDemo.tsx:152,156,162,181` | Four literal paragraph inputs for source documents. | Explicit demo snapshot data rather than generic editor behavior. |
| `demo/src/EditorLifecycleTest.tsx:19` | Literal paragraph inserted directly into the model. | Lifecycle test harness data. |
| `packages/react-rivto-editor/src/extensions/built-ins/separator/separator-block.tsx:87` | Reuses any block with no text and no children as a separator. | Checks `!block.content`, not `isEmptyBlock(block)`. Consequently, an empty custom block with meaningful props can meet this condition. Whether replacement is desirable is a policy decision. |
| `packages/react-rivto-editor/src/block-behaviors/default-block-behavior.ts:206` | Backspace reset eligibility uses `block.content !== ""` plus `isEmptyBlock(block)`. | Intentionally distinguishes an empty custom block from an empty writing block. Still assumes empty text is enough to consider resetting a custom type. |
| `packages/react-rivto-editor/src/managers/events/selection.ts:76` | Creates a fallback caret when `emptyBlock?.content === ""` and there is no DOM selection. | Text-host emptiness rather than writing-block identity; replacing this with `isEmptyBlock` would change custom editable block behavior. |
| `packages/react-rivto-editor/src/block-behaviors/utils/text-ops.ts:82` | Reset uses only `createDefaultBlock().type`. | Preserves identity via `setBlockType`, but does not apply other fields returned by the host factory. Type conversion and creation are different operations. |
| `packages/react-rivto-editor/src/extensions/built-ins/clipboard/clipboard.ts:80-81` | Default clipboard type comes from `createDefaultBlock().type`, unless explicitly overridden. | A type-only boundary rather than a complete factory contract. |
| `packages/react-rivto-editor/src/managers/clipboard/clipboard-format-registry.ts:255,293,300` | HTML fallback creates `{ type: context.defaultBlockType, content, ... }`. | Configurable type, but host factory fields are unavailable. List parsing additionally hardcodes `checkbox`, `numbered_list`, and `list` at 289-293. |
| `packages/react-rivto-editor/src/managers/clipboard/clipboard-manager.ts:611,620` | Canvas-to-page fallback resolves the writing type, then creates `{ type: writingType, content: formats.plain }`. | Another type-only writing construction path. |
| `packages/rivto-editor-core/src/managers/clipboard-manager/strategies/utils.ts:131-136` | Plain-text paste creates each new line with `{ type: defaultBlockType, content }`. | Core correctly avoids knowledge of paragraph, but the supplied contract is only a type. Registry definition defaults can still apply; custom per-creation factory fields do not reach this path. |
| `packages/react-rivto-editor/src/elements/block-element-projection.ts:312,315-316` | Registered separator insertion constructs a bare input in both panel and editor branches. | Correct metadata lookup, but creation shape is fixed. This is the current helper implementation, not a caller bypass. |

The 37 demo writing inputs and their location count should be checked against
the generated appendix when changing this file; the appendix records actual
source matches for this checkout.

## Type checks and construction inside the owning extension

These are still explicit checks/construction, but normally belong where they
are. Centralizing them into generic editor code would weaken ownership.

| File under `packages/react-rivto-editor/src/extensions/` | Checks or construction |
| --- | --- |
| `containers/columns/columns.tsx` | Column input factory at 69-75; board factory at 84-93; board guard and column filtering at 108,112; count growth constructs a column directly at 121-126 rather than calling `createColumnInput`; column filter at 220; definition/parent restrictions at 281-293; settings guard at 300. |
| `containers/columns/columns-behavior.ts` | Structural column and parent checks at 40,44,49; same-type selected-column check at 92. These protect relocation/deletion semantics. |
| `containers/kanban/kanban.tsx` | Board/column creation at 53-62; Add Column constructs a column directly at 128-129; board renderer guard at 253; settings guard at 274; definitions at 278,287. Add Card already calls the writing factory at 205. |
| `containers/table/table.tsx` | Cell, row, and table factories at 102-145; table/row guards at 173,208,239; renderer/selection guards at 312,320,333; resize context guard at 451; definitions at 621,630,639; settings guard at 653. Row and cell insertion already use their local factories. |
| `containers/bento/bento.tsx` | Factory at 157-158; board and parent checks at 357,361; definition at 403; settings guard at 421. |
| `todo-item/todo-item.tsx` | Storage and TODO definitions at 64,83. Their creation defaults belong to these registrations. |
| `todo-item/todo-item-actions.ts` | TODO type guard before property changes at 51. |
| `todo-item/todo-prompt-controller.ts` | Avoids converting an existing TODO at 74,175; converts to the TODO type at 181 and applies parsed content/props. |
| `todo-item/todo-storage.tsx` | TODO guards/filtering/order preservation at 130,149,162,173; storage renderer guard at 276. |
| `embedding/embedding.tsx` | Embedding definition at 210; settings guards at 221,226. |
| `built-ins/separator/separator-block.tsx` | Local `insertSeparator` converts/inserts `separatorType` at 89,94-100; built-in type supplied at 130,177; definition at 141; HTML `<hr>` parser constructs the built-in type at 149. Local insertion also resets list props explicitly at 91,98. |
| `built-ins/error/error-block.tsx` | Error-block input at 51 and definition at 65. An invalid-block fallback necessarily knows its own type. |
| `built-ins/page/default-writing-block/register.ts` | Configured writing type and bare default factory at 26-30; built-in paragraph keyword at 34 even when the host chooses a different type. |

`demo/src/App.tsx` additionally constructs explicit Slider, Counter, TODO,
TODO-storage, and Embedding inputs. Those are examples of concrete plugins,
whereas Table, Columns, Kanban, and Bento seed construction already uses their
factories. `demo/src/extensions/reports/review-report-model.ts:204,218` checks the
report block type in its own copy/reference handling; its block factory is at
127. `demo/src/blocks/custom-block-definitions.ts:12,20` defines Slider and
Counter types; `demo/src/blocks/custom-blocks.tsx:240,247` constructs Counter
inputs in its own HTML and plain-text clipboard parsers.

## List properties and CSS

List modes are `block.listProps.type`, not native block types. Explicit list
behavior is present in:

- `block-behaviors/utils/text-ops.ts:56`: `convertEmptyToList` sets list defaults.
- `blocks/block-slot-controls/block-slot-controls.tsx:35`: checkbox controls.
- `extensions/built-ins/page/list/utils.ts:22`: default list properties.
- `extensions/built-ins/page/list/shortcuts/register.ts:26-31,51,61,72,80,90,95`:
  mode commands, conditions, defaults, and formatter matching.
- `extensions/built-ins/page/list/shortcuts/utils.ts:5-10`: textual prefix map.
- `managers/clipboard/clipboard-format-registry.ts:289-293`: HTML list mapping.
- `app/rivto-editor/renderer/documents.ts:79,140-145`: export checkbox and
  numbered-list inference, including `type.includes("numbered")`.

The first six paths above are relative to `packages/react-rivto-editor/src/`.

Explicit `[data-block-type="..."]` selectors are in the owning extension CSS:
`containers/bento/bento.css`, `containers/columns/columns.css`,
`containers/kanban/kanban.css`, `containers/table/table.css`,
`embedding/embedding.css`, and `todo-item/todo-item.css`. No such selectors were
found in React package CSS outside `extensions/`. These are presentation
contracts, not insertion or emptiness policy.

## Paths already using shared behavior

- Enter splitting: `block-behaviors/utils/text-ops.ts:38` uses the full default
  input before overriding split text and inherited list props.
- First child: `ContainerBlockBehavior.appendWritingBlock` in
  `block-behaviors/container-block-behavior.ts` uses the writing factory.
- Page-end insertion: `extensions/built-ins/page/trailing-block/component.tsx:42`
  uses the writing factory.
- Edgeless creation: `surfaces/edgeless/edgeless-surface.tsx:366-370` checks
  registered separator metadata, calls the separator helper, then uses the
  writing factory.
- Card creation: `extensions/built-ins/built-ins.ts:257` calls the separator
  helper.
- Canvas paste: `extensions/built-ins/clipboard/element-paste-strategy.ts:124`
  calls the separator helper.
- Projection segmentation: `elements/block-element-projection.ts:547` uses
  registered separator metadata, not empty paragraphs.
- Empty-block merge handling: `extensions/built-ins/page/block-merge/utils.ts:53`
  uses `isEmptyBlock`.
- Generic type conversion: `managers/blocks/block-type-manager.ts:89,93` uses
  the registration's type, not a built-in type.

These paths are relative to `packages/react-rivto-editor/src/`.

## Scope and verification

Source searches covered literal types, type constants, equality/inequality,
membership checks, insertion/conversion calls, emptiness checks, and CSS type
selectors. Relevant matched implementations were read to distinguish native
blocks from canvas elements, list props, DOM event types, and HTML controls.
`element.type === "block"` identifies a canvas card, not a paragraph or other
document block type; those element checks are outside this inventory.

No built-in document block literals were found in production document-model
or core editor behavior. Core test utilities do explicitly register paragraph
at `packages/rivto-editor-core/src/editor/test-utils.ts:42`; React test utilities
use `DEFAULT_WRITING_BLOCK_TYPE` at `src/test-utils.ts:68,124`.

Tests and browser checks were not run because this is source investigation.
The test-file appendix identifies matching fixture/assertion files rather than
classifying every test literal as a production issue. Source matches establish
coupling and potential policy differences, not reproduced user-visible bugs.

## Exact paragraph and separator construction matches

This includes constants in input objects and definitions; it excludes comments,
imports, exports, DOM roles, and canvas element types.

| File | Lines |
| --- | --- |
| `app/chulane/src/editor/create-page-editor.ts` | 82 |
| `app/chulane/src/editor/snapshot.ts` | 74 |
| `app/rivto-editor/renderer/main.tsx` | 115, 305 |
| `demo/src/App.tsx` | 422, 427, 436, 444, 452, 459, 467, 475, 483, 491, 498, 505, 513, 521, 544, 551, 558, 566, 574, 582, 590, 597, 607, 626, 628, 634, 653, 666, 674, 694, 1120, 1126, 1144, 1150, 1153, 1156, 1357, 1362, 1372 |
| `demo/src/DocumentsDemo.tsx` | 152, 156, 162, 181 |
| `demo/src/EditorLifecycleTest.tsx` | 19 |
| `packages/react-rivto-editor/src/extensions/built-ins/separator/separator-block.tsx` | 141, 149 |
| `packages/react-rivto-editor/src/test-utils.ts` | 68, 124 |
| `packages/rivto-editor-core/src/editor/test-utils.ts` | 42 |

## Package test files

52 files match `paragraph`, `separator`, or `content === ""`. These are
fixture/assertion search matches, not a count of production defects.

- `packages/document-model/src/core/__tests__/document-model.snapshot.test.ts`
- `packages/document-model/src/core/__tests__/document-model.v9.test.ts`
- `packages/document-model/src/core/__tests__/document-reactivity.test.ts`
- `packages/document-model/src/core/__tests__/document-storage.test.ts`
- `packages/document-model/src/core/__tests__/element-roots.test.ts`
- `packages/react-rivto-editor/src/__tests__/react-editor.test.ts`
- `packages/react-rivto-editor/src/__tests__/unified-api.test.tsx`
- `packages/react-rivto-editor/src/block-behaviors/default-block-behavior.test.ts`
- `packages/react-rivto-editor/src/block-behaviors/nesting.test.ts`
- `packages/react-rivto-editor/src/components/editable-label-text.test.ts`
- `packages/react-rivto-editor/src/database-document-model.test.ts`
- `packages/react-rivto-editor/src/editor/editor-storage.test.ts`
- `packages/react-rivto-editor/src/elements/block-element-projection.test.ts`
- `packages/react-rivto-editor/src/extensions/built-ins/clipboard/cross-document-block-transfer.test.ts`
- `packages/react-rivto-editor/src/extensions/built-ins/clipboard/element-paste-strategy.test.ts`
- `packages/react-rivto-editor/src/extensions/built-ins/page/collapse/register.test.ts`
- `packages/react-rivto-editor/src/extensions/built-ins/page/default-writing-block/utils.test.ts`
- `packages/react-rivto-editor/src/extensions/built-ins/page/navigation/utils/scope.test.ts`
- `packages/react-rivto-editor/src/extensions/built-ins/separator/separator-block.test.tsx`
- `packages/react-rivto-editor/src/extensions/containers/bento/bento.test.ts`
- `packages/react-rivto-editor/src/extensions/containers/columns/columns.test.ts`
- `packages/react-rivto-editor/src/extensions/containers/kanban/kanban.test.ts`
- `packages/react-rivto-editor/src/extensions/containers/table/table.test.ts`
- `packages/react-rivto-editor/src/extensions/edgeless/visuals/edgeless-visuals.test.ts`
- `packages/react-rivto-editor/src/extensions/embedding/embedding.test.tsx`
- `packages/react-rivto-editor/src/extensions/todo-item/todo-item.test.tsx`
- `packages/react-rivto-editor/src/extensions/todo-item/todo-storage.test.ts`
- `packages/react-rivto-editor/src/hooks/blocks/block-editing-controller.test.ts`
- `packages/react-rivto-editor/src/hooks/blocks/use-block-selection.test.ts`
- `packages/react-rivto-editor/src/hooks/blocks/use-block.test.tsx`
- `packages/react-rivto-editor/src/managers/blocks/block-list-props-manager.test.ts`
- `packages/react-rivto-editor/src/managers/blocks/block-manager.test.ts`
- `packages/react-rivto-editor/src/managers/clipboard/clipboard-converters.test.ts`
- `packages/react-rivto-editor/src/managers/clipboard/clipboard-format-registry.test.ts`
- `packages/react-rivto-editor/src/managers/selection/panel-selection-manager.test.ts`
- `packages/react-rivto-editor/src/managers/slash/slash-command-registry.test.ts`
- `packages/react-rivto-editor/src/managers/surfaces/surface-manager.test.ts`
- `packages/react-rivto-editor/src/panels/panel-boundaries.test.ts`
- `packages/react-rivto-editor/src/panels/panel-lifecycle.test.ts`
- `packages/react-rivto-editor/src/panels/panel-mode.test.ts`
- `packages/react-rivto-editor/src/panels/panel-slash-boundaries.test.ts`
- `packages/react-rivto-editor/src/panels/panel.test.ts`
- `packages/rivto-editor-core/src/editor/__tests__/block-commands.test.ts`
- `packages/rivto-editor-core/src/editor/__tests__/broadcast-provider.test.ts`
- `packages/rivto-editor-core/src/editor/__tests__/document-editor-methods.test.ts`
- `packages/rivto-editor-core/src/editor/__tests__/element-commands.test.ts`
- `packages/rivto-editor-core/src/editor/__tests__/history-manager.test.ts`
- `packages/rivto-editor-core/src/editor/__tests__/selection-manager.test.ts`
- `packages/rivto-editor-core/src/managers/__tests__/editor-managers.test.ts`
- `packages/rivto-editor-core/src/managers/block-manager/block-manager.test.ts`
- `packages/rivto-editor-core/src/managers/clipboard-manager/clipboard-manager.test.ts`
- `packages/rivto-editor-core/src/panels/panel.test.ts`

## Browser test files

24 files match `paragraph`, `separator`, or `content === ""`. These are
fixture/assertion search matches, not a count of production defects.

- `e2e/bento.spec.ts`
- `e2e/clipboard-converters.spec.ts`
- `e2e/clipboard-drag.spec.ts`
- `e2e/columns.spec.ts`
- `e2e/container-summaries.spec.ts`
- `e2e/edgeless.spec.ts`
- `e2e/embeddings.spec.ts`
- `e2e/empty-document.spec.ts`
- `e2e/history-delete.spec.ts`
- `e2e/kanban.spec.ts`
- `e2e/lists.spec.ts`
- `e2e/markdown-custom.spec.ts`
- `e2e/modal-drag-scroll.spec.ts`
- `e2e/nested-containers.spec.ts`
- `e2e/page-drag-container-boundary.spec.ts`
- `e2e/page-drag-gap.spec.ts`
- `e2e/page-drag-scroll.spec.ts`
- `e2e/panels.spec.ts`
- `e2e/performance.spec.ts`
- `e2e/selection.spec.ts`
- `e2e/structured-selection.spec.ts`
- `e2e/sync.spec.ts`
- `e2e/todo-item.spec.ts`
- `e2e/todo-storage.spec.ts`
