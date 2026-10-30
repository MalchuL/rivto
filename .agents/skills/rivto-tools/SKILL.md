---
name: rivto-tools
description: Create or extend Rivto edgeless tools, add presets or tools to existing toolbar groups, and change tool gestures, previews or shared settings. Use rivto-elements for persisted element definitions, renderers and property editors.
---

# Rivto Tools

Use the registered class-based tool API. Keep interaction state in the receiving
edgeless surface, creation behavior in creation tools, and group settings in the
existing settings coordinator. Do not add built-in name checks to common code.

## Choose the existing extension point

- **Ordinary element placement:** use `elementTypes.register({ creation: ... })`.
  It already creates an `EdgelessCreationTool` with ID `element:<type>` and supports
  click placement, canvas drag and toolbar drag. Do not register a second tool for
  the same contribution or change this API to accommodate ordinary placement.
- **Another preset for an existing type:** register a distinct tool whose
  `createTool(options)` returns `new EdgelessCreationTool({ ...options, type, create })`.
  Its input factory supplies explicit preset properties; it does not insert records.
- **Custom creation gesture:** subclass `EdgelessCreationTool`. Override gesture
  and preview methods where needed. Set `supportsPlacement = false` when ordinary
  toolbar placement does not make sense, as for freehand drawing or connectors.
- **Interaction without element creation:** subclass `EdgelessTool`. Its base
  contract covers lifecycle, normalized pointer input, capabilities and preview
  notifications; placement data/methods belong to `EdgelessCreationTool` only.
- **Extend an existing tool's behavior:** inspect its class and callers, and change
  the owning class or a demonstrated shared contract. For an independently selectable
  variation, register a separate instance factory/preset with a distinct ID. Do not
  mutate another extension's registration, patch a live instance, or duplicate an ID.

If a requested behavior cannot be expressed through current contracts, extend the
appropriate owning class/registration contract. Do not work around it by exposing
private state, adding a closed tool union, or branching on tool/type/group names in
the toolbar, pointer adapter, selection or transform code.

## Read the current contracts

Paths are relative to the repository root. Verify them before copying examples.

- [EdgelessTool](../../../packages/react-rivto-editor/src/managers/edgeless-tools/edgeless-tool.ts)
  and [EdgelessCreationTool](../../../packages/react-rivto-editor/src/managers/edgeless-tools/edgeless-creation-tool.tsx):
  public methods, normalized input, capabilities and placement ownership.
- [Toolbar registrations](../../../packages/react-rivto-editor/src/managers/edgeless-toolbar/types.ts)
  and [tool context](../../../packages/react-rivto-editor/src/managers/edgeless-tools/edgeless-tool-context.ts):
  factories, group contributions, activation, default selection and disposal.
- [Tool group](../../../packages/react-rivto-editor/src/managers/edgeless-tools/edgeless-tool-group.ts)
  and [settings contracts](../../../packages/react-rivto-editor/src/managers/elements/creation-defaults-types.ts):
  shared settings and remembered-field policies.
- [Built-in registration](../../../packages/react-rivto-editor/src/extensions/edgeless/visuals/register-toolbar.tsx):
  presets, brushes, connectors and group renderers.
- [Host gesture example](../../../demo/src/CustomGestureTool.tsx): custom creation
  class, local React preview, commit/cancel and registration cleanup.
- [Architecture and reading order](../../../dev_notes/edgeless-tools.md).

## Register or append to an existing group

Register in the extension's `setup(editor)` and retain/return the owned disposers.
`registerTool` accepts `id`, `title`, optional `icon`, `group`, `order`, and
`createTool(options)`. Construct a fresh instance from the supplied options; never
return an editor-wide singleton. Keep its ID equal to `options.id`.

To append to an existing group, set the new tool's `group` or an element's
`creation.group` to that group's ID. **Do not register the shared group again** or
replace its renderer. Define custom IDs in constants in their owning extension;
reference built-ins through exported `VISUAL_TOOL_IDS`, `VISUAL_TOOL_GROUPS` and
`VISUAL_ELEMENT_TYPES`. Keep tool identity distinct from persisted element type.

A group can arrive after its tools: unresolved members remain hidden until it
exists. Removing registrations must cancel/dispose affected instances without
deleting document elements. Use `defaultToolId` only when owning a new group's
initial choice. `default: true` is the surface-wide fallback and must be unique;
adding a preset does not require changing it. Reset through `tools.reset()`, never
a hardcoded Select ID. A grouped fallback is unavailable while its group is absent.

A custom group renderer must render all supplied `items`, including contributions
from other extensions, using `renderTool(item, children?)`. The toolbar owns the
popover and menu state. Supply an accessible `title` and preferably an icon; reuse
`EdgelessToolButton` for custom controls so active styling and keyboard behavior
remain consistent. Mark internal controls with `data-edgeless-ui="true"`.

## Surface ownership and shared settings

The existing `EdgelessToolsProvider` owns one `EdgelessToolContext` per mounted
surface. Use `useEdgelessTools()` for activation and `useEdgelessOperations()` for
its shared operations. Panel/editor references may be dependencies; do not put
mutable tools, previews or settings on those objects or create another store in a
menu component. Switching tools preserves settings; unmounting the surface ends
that session. These settings are not persisted user preferences across reloads.

Read/write shared values through `tool.group.getSettings()`/`setSettings()` or the
`group` instance passed to its renderer. A creation tool's `getSettings()` resolves
its type's effective settings. Type-to-group resolution uses
`behavior.defaultsGroup`, falling back to `creation.group`; a manually registered
tool's toolbar membership alone does not change that mapping.

Declare `creationDefaults` and `rememberedProperties` on an owned group and/or
`rememberedProperties` on the element registration. Keep field lists in constants.
Remember only declared styles and `frame.width`/`height`, not text content, points,
endpoints, position or identity. Property edits must remember values by registered
type/group independently of the active tool. Do not reintroduce `setDrawingBrush`
or per-type setters in common operations. Intentional preset activation may update
group settings; preview and cancellation must not update them.

## Gestures and previews

The common pointer adapter owns browser capture, coordinate conversion and routing
of Escape, pointer cancellation and panel deactivation. Tools receive canvas-space
`EdgelessToolPointer` samples; do not install a parallel document pointer loop.
Set `capturesPointer`, `pansViewport` and `keepsMenuOpen` according to behavior, not
identity. Accept a pointer in `pointerDown` by returning true, retain its ID locally,
and ignore unrelated samples. Hover cleanup must not cancel a captured drag.

Keep unfinished geometry in the tool instance and call protected `changed()` after
preview changes. Return React content from `renderPreview(zoom)`, or supply the
registration's `preview` component. Do not publish every sample through the context
or document. Ordinary creation uses the registered element renderer and retained
raw factory input; do not introduce a placeholder renderer or run the factory again
at commit. Follow [rivto-elements](../rivto-elements/SKILL.md) when changing that
renderer or its live resize behavior.

Commit through the bound operations/managers only when the gesture finishes.
`pointerUp` owns successful gesture cleanup and may retain hover feedback. Use
`finally` to clear transient state when commit fails. `cancel()` discards local
state without document/settings writes and reports whether a gesture was pending.
When overriding `cancel`, `deactivate` or `dispose`, preserve inherited cleanup and
release resources owned by the subclass. Constructors must not create document
records or install external subscriptions; rendering/factory preparation is not a
commit boundary.

## Verify the actual contribution

For implementation or fixes, follow
[rivto-performance-testing](../rivto-performance-testing/SKILL.md). Use focused
unit tests for settings, factories and lifecycle; use real browser gestures for
capture, previews and toolbar integration. Useful existing checks:

- `src/managers/edgeless-tools/edgeless-tool-context.test.tsx` in the React package:
  arbitrary IDs, isolated instances, deferred defaults, disposal and factory reuse.
- [Custom tool](../../../e2e/edgeless-custom-tool.spec.ts): host preview, no records
  before release, cancellation, commit, undo, another panel and unregistration.
- [Toolbar groups](../../../e2e/edgeless-toolbar-groups.spec.ts): append to an existing
  group, custom group contents, keyboard activation, styling and disposal.
- [Creation previews](../../../e2e/edgeless-creation-preview.spec.ts): retained factory
  input, actual rendered content, toolbar drag, no preview writes and matching commit.

Select checks relevant to the change. Cover normal and large fixtures for runtime
changes, and report parallel behavior runs separately from serial timings and
failure reruns as required by repository guidance. Documentation-only skill edits
need link/frontmatter validation, not editor browser or performance runs.
