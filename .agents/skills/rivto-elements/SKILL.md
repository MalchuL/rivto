---
name: rivto-elements
description: Create or change Rivto edgeless element types, renderers, creation tools and property editors in the React package or host extensions. Implement live transform previews by default, with document changes committed when the gesture ends. Use rivto-blocks or rivto-containers for document blocks instead.
---

# Rivto Elements

Build custom canvas elements through the same registration contract as built-in
figures. **Unless the user explicitly requests otherwise, implement live visual
updates during interaction, including resize, from the first version.** Updating
only the bounding box and waiting for release to update its contents is incomplete.
Live feedback does not mean writing intermediate geometry into the document.

## Read the current owners

Paths below are relative to the repository root. Inspect the relevant contracts
before copying an example; public APIs may evolve.

- `packages/react-rivto-editor/src/managers/elements/types.ts`: registrations,
  renderer/property props and behavior capabilities.
- `packages/react-rivto-editor/src/managers/elements/edgeless-operations.ts`:
  creation, property previews, grouping, selection and transactions.
- `packages/react-rivto-editor/src/elements/visuals/visual-element.tsx` and
  `src/hooks/elements/use-edgeless-element-style.ts` under the same package:
  shared host and DOM geometry preview lock.
- `packages/react-rivto-editor/src/elements/visuals/register-elements.ts`:
  ordinary registrations for built-in figures; no central type dispatcher.
- `packages/react-rivto-editor/src/extensions/edgeless/edgeless-transform.ts`:
  preview, commit and cancellation; read when changing transform behavior.
- [Element API documentation](../../../packages/react-rivto-editor/docs/edgeless-elements.md).
- [Mindmap example](../../../demo/src/extensions/mindmap/mindmap.tsx): host-only
  registration, shared UI controls, settings and responsive SVG/HTML content.
  Its [model](../../../demo/src/extensions/mindmap/model.ts) demonstrates flat
  internal tree data and iterative validation/layout when arbitrary depth matters.

## Register the element and preserve the shared host

In `ReactEditorExtension.setup(editor)`, call `editor.elementTypes.register` and
return its disposer. Supply a unique stable `definition.type`, defaults,
validation/normalization, and a `render` component. Add `title`, `creation`,
`properties`, `behavior` and `clipboard` only as needed. The creation contribution
adds a toolbar entry; its factory returns input for its own type, and the common
placement tool supplies the final frame. Preparation must not insert a second
record. Unregistering presentation must not delete persisted elements.

Prefer an icon-only creation toolbar button: provide `creation.icon` and keep
`creation.title` as its accessible name and tooltip. The toolbar falls back to
visible title text when no icon is supplied.

A renderer returns only content. The shared host owns position, rotation, IDs,
selection markers, slots and transform controls. Use its `reactPanel`, `operations`,
`selected` and `zoom`; do not construct another `EdgelessOperations` instance or
maintain a second canvas selection/tool store. For common double-click label
editing, opt into `behavior.editableLabel` and use the supplied editing state.

Keep type-specific code with the registration or renderer. Do not introduce a
`switch (element.type)`, built-in whitelist, or private built-in-only context in
shared hosts, property shells or creation operations to support a new type.
Use `behavior.resize` for property changes required by committed frame updates.
Use `behavior.absoluteGeometry` only for world-space geometry with its own controls;
it disables ordinary resize/rotate controls. Declare `relatedElements` when an
object must follow selected referenced elements into groups. Do not use these
capabilities merely because the example connector uses them.

## Live previews are the default

For a persisted element (`preview: false`), `element.frame` is the **persisted**
geometry. During a transform the controller
changes the host's DOM size/transform and keeps its geometry locked against React
rerenders. It does not publish every pointer sample as a new renderer snapshot.
The renderer must therefore follow the actual host layout during the gesture.

- For fluid content, use host-relative CSS sizes, flex/grid, or percentages.
- For a diagram whose contents must scale together, use a responsive SVG viewport
  with a natural coordinate system derived from content layout. For example:

  ```tsx
  <svg width="100%" height="100%"
    viewBox={`0 0 ${naturalWidth} ${naturalHeight}`}
    preserveAspectRatio="none" style={{ display: 'block' }}>
    {/* Paths and foreignObject nodes share this coordinate system. */}
  </svg>
  ```

  `none` follows both resized axes independently. Choose another aspect-ratio
  policy only when the element's intended behavior requires it. HTML controls can
  live inside `foreignObject`; do not hide that interactive subtree with
  `aria-hidden`. A canvas/WebGL renderer may need imperative redraw from actual
  host dimensions; keep that preview outside React/document geometry state.

- Do not compute a live content `scale()` solely from `element.frame.width/height`.
  The mindmap did this initially: the frame resized immediately, but its nodes and
  labels jumped to the new scale only after release.
- Do not add per-pointer `setState`, duplicate geometry stores, document writes,
  or CRDT updates to make the renderer follow a resize. Reuse the existing DOM
  preview path; add no observer/subscription when native layout already works.
- On release, let the shared controller commit the final geometry as one undoable
  action. Escape/pointer cancellation restores the original presentation and
  leaves the document unchanged. Never write the DOM preview back during render.

Local property-panel previews are a separate contract: they may notify renderers
through the existing preview API. The restriction above concerns transform samples,
not ordinary label editing, selection, or a completed button action.

## Declare editable properties and native controls

`definition.defaults` and `validate` describe data; they do not generate a form.
Supply a `properties` component that explicitly chooses editable fields and renders
only the contents. The common shell owns placement, title, collapse/close controls,
selection count and preview/undo lifecycle, even when the creation toolbar is hidden.

Use `common(key)` for same-type multi-selection, `preview(patch)` for validated live
property feedback, and `commit()`/`cancel()` when the UI needs explicit actions.
The shell commits on outside pointer press, selection change or unmount, and cancels
on Escape. Preserve keyboard-only departure: cleanup must save pending settings
before the canvas owner discards previews. Do not recreate this lifecycle per type.
`common` uses `Object.is`, so distinct object values are not deeply compared.
`rememberedProperties` opts style keys into future creation defaults; do not
accidentally remember authored content such as an entire mindmap tree.

Mark internal inputs/buttons with `data-edgeless-ui="true"` and stop their pointer
propagation so they do not start a canvas drag. Give them accessible labels and
preserve native editing/focus. When a control should select its owning element, use
the existing panel-scoped selection command rather than independent React state.
Keep a usable region for selecting/moving the whole element.

Treat snapshots and nested props as read-only. Read current data when invoking an
operation, and mutate through panel/core managers. Batch compound edits such as
adding a branch plus resizing its frame into one undo step. Element envelope fields
and identically named opaque props are different namespaces.

For complex content, decide whether children are internal data or independently
selectable canvas elements. Do not force every composite into groups or every tree
into one element. If unlimited depth is requested, avoid recursive layout and
nested serialization limits; do not claim unlimited browser capacity or introduce
unrequested limits. Check clipboard references/ID remapping when records link to
other elements; structured copy alone cannot infer custom reference semantics.

## Verify before calling it complete

Read and execute [rivto-performance-testing](../rivto-performance-testing/SKILL.md)
for each implementation or fix. Use focused model tests for validation and compound
operations, and real browser input for interactive behavior.

For resizable content, follow
[e2e/mindmap-resize.spec.ts](../../../e2e/mindmap-resize.spec.ts):

- Hold the mouse button, move through several positions and assert that visible
  content scales/reflows on the affected axes **before release**. A host bounding-box
  assertion alone does not catch frozen contents.
- Assert unchanged persisted geometry/content and no document notifications during
  preview. After release, assert the final geometry, no visual jump and one-step undo.
- Check cancellation restores both DOM and document state. Exercise existing
  label/button interactions after changing SVG/HTML structure.
- Cover normal demo and `repeat=200`, Chromium and Firefox, with the actual active
  extensions. Measure synchronous gesture work separately from rendering latency;
  do not substitute direct manager calls for pointer interaction.

For property editors and composite content, reuse
[e2e/mindmap.spec.ts](../../../e2e/mindmap.spec.ts): preview/cancel/commit, multi-selection
where supported, toolbar-hidden settings, keyboard-only mode change, undo/redo and
copy/paste. Check registration disposal and independent panels when lifecycle changes.
State which browsers and scale were tested; a deep model test does not validate a
huge mounted DOM. Do not copy historical timings into new performance budgets.

## Toolbar groups and active tools

Use `reactEditor.edgelessToolbar.registerGroup` for a group and `creation.group`
for an element's membership. `creation` installs an `element:<type>` tool
atomically; do not also call `registerTool` for the same creation contribution.
Without `group`, the element gets a standalone button. A group describes `id`,
`title`, `icon`, optional `order`, `defaultToolId` and `render`. Register shared
groups once; another extension can add a tool to the group's ID without owning it.

Use `registerTool` for a preset or interaction such as a brush, with a
`createTool(options)` factory returning a surface-local `EdgelessTool` or
`EdgelessCreationTool` instance. Active styling follows the registered ID. Keep
activation local to the receiving surface and perform document writes only through
the eventual placement/drawing operation. For new tools, changes to existing tools
or contributions to existing groups, follow [rivto-tools](../rivto-tools/SKILL.md).
Group and tool registrations return extension-owned disposers. Unknown groups
hide their tools until installed; empty groups stay hidden. Removing an active
tool resolves the registered default without deleting document content. There is
no hardcoded fallback name; an unavailable grouped default waits for its group.

Custom group UI receives all `items`, `renderTool`, `operations`, `reactPanel`,
`tools` and the surface-local `group` instance. Read and write shared settings
through `group.getSettings()` and `group.setSettings()` rather than another UI store.
Render the complete supplied list so other extensions can contribute. Use
`renderTool(item, children?)` to retain registered icons, active styling, accessible
labels, keyboard activation and existing pointer drag behavior. `children` replaces
the visible title; `null` yields an icon-only item. The outer toolbar owns opening,
positioning and dismissal; do not build another popover or menu state per group.

Use the shared `EdgelessToolButton` for custom toolbar controls. Setting
`aria-pressed` on a plain button does not supply the editor's visible active style.
Verify actual computed styling as well as accessibility state. Follow
[e2e/edgeless-toolbar-groups.spec.ts](../../../e2e/edgeless-toolbar-groups.spec.ts)
for group/default activation, contribution to a built-in custom layout, independent
panels, dynamic registration/disposal, Escape, keyboard input and active styling.

## Creation previews use the registered renderer

Placement previews render `registration.render` through `ElementCreationPreview`,
using detached data prepared by `operations.prepareElementCreation`. There is no
placeholder rectangle per custom type and no second drawing implementation for
built-in shapes/text/stickies. An empty text element remains empty in its preview;
the common dashed frame makes transparent content visible. Drawing strokes and
unfinished connector gestures still have their own geometric gesture previews.

The renderer receives `preview: true`, `selected: false`, `editing: false` and a
temporary ID. Use the supplied `element`, including its props and frame; do not
look up the temporary ID in document storage. Guard effects and commands with
`preview`: do not write props, select the draft, register document resources or
autofocus controls. The common host is `inert`, `aria-hidden` and excluded from
pointer hit testing; it has no persisted element ID, slots or selection controls.
Those DOM guards do not make side effects in renderer code safe.

`creation.create(reactPanel)` is a pure input factory, evaluated once on the first
preview of a prospective placement. It may produce temporary data/IDs but must
not insert records. The same raw input is retained through pointer movement and
committed on release; do not call the factory separately for preview and commit.
Its frame width/height supply the initial size, unless a completed drag has already
established a remembered size under the registered type/group policy. Tool switches
preserve that session memory. Pointer placement supplies final
position and drag geometry. A cancelled gesture discards the input.

Preparation shares defaults, remembered properties and pure `behavior.create`
geometry preparation with insertion. Preview props are validated on detached copies;
commit uses the original input and runs core validation once, rather than inserting
already-normalized preview props and normalizing them a second time. Keep validation
and preparation deterministic. Core insertion middleware still runs only at commit.

Creation's live frame is local gesture preview data, not document/editor state.
Do not insert/update/delete temporary document elements or add a runtime store to
animate it. Existing-element resize still uses the DOM preview contract above;
its `element.frame` remains persisted. Toolbar preset dragging mounts the same
renderer in a ghost shell and moves that shell imperatively, without per-pointer
React state updates.

Verify the actual content inside the ghost, not only its outer frame. Follow
[e2e/edgeless-creation-preview.spec.ts](../../../e2e/edgeless-creation-preview.spec.ts):
factory called once, natural initial size, content scaling before release, unchanged
document and zero document notifications during preview, matching committed content
and geometry, one-step undo, cancellation and inert controls. Check native toolbar
preset dragging as well as canvas placement on normal and large documents.
