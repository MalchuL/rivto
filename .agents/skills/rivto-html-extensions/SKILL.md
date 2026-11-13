---
name: rivto-html-extensions
description: Create or change Rivto HTML/CSS/JavaScript blocks and Edgeless elements, their sandbox bridge, or iframe-based embedded content as extensions. Use alongside rivto-blocks or rivto-elements for the corresponding surface contract.
---

# Rivto HTML Extensions

Use this skill for the package HTML surface, authored widgets that run inside it,
and other extension renderers embedding an iframe. For the owning surface contract,
also read [rivto-blocks](../rivto-blocks/SKILL.md),
[rivto-elements](../rivto-elements/SKILL.md), or
[rivto-containers](../rivto-containers/SKILL.md) as applicable.

## Inspect the current implementation

- [HTML surface documentation](../../../packages/react-rivto-editor/docs/html-surface.md)
  describes the installed extension, script API, interaction markers and unsafe access.
- `packages/react-rivto-editor/src/extensions/html-surface/extension.tsx` registers
  both blocks, the element, slots, slash commands and creation tool; its components,
  hooks, protocol and unsafe bridge live in that extension directory.
- `packages/react-rivto-editor/src/components/embedded-drag-handles.tsx` and
  `src/hooks/editor/use-embedded-content-context.ts` provide reusable host targets
  and presentation context. `packages/rivto-page/src/editor/pointer/` and Page's
  block-editor CSS own gesture continuity across embedded frames.
- `demo/src/extensions/html-surface/` contains host-owned examples;
  `e2e/html-interaction.spec.ts` and `e2e/html-surface.spec.ts` exercise real input,
  editing, iframe controls and both surfaces.

Read the current code before changing these contracts. A native DOM renderer in
the host document is not an iframe: its events and DOM nodes do not cross the
sandbox bridge.

## Build and install the extension

Use `htmlSurfaceExtension()` for authored HTML/CSS/JavaScript when its existing
contract meets the request. It registers an `html` block, an `html` canvas element
and an optional `unsafe-html` block. HTML blocks store source in `content`; elements
store it in `props.html`. Keep reusable registrations, renderers, hooks, protocol,
styles and editing UI in the package; keep showcase samples in the host demo.

For another extension, register each persisted type and its renderer in
`ReactEditorExtension.setup` using the appropriate block or element registry.
Register slots, slash commands or creation tools only when needed, and return a
disposer for every registration. Uninstalling presentation must not delete saved
document data. Use existing manager operations for writes and history, not a
parallel selection store or direct document mutation. Validate persisted data and
consider snapshots, clipboard, undo and source replacement. Follow repository
style, documentation and function-length rules.

Make content follow the actual host size during canvas resize, including the live
preview before the geometry is committed. Use package tokens and nearby UI
primitives for extension chrome. Keep widget animations and subscriptions scoped
to the mounted widget; replacing its source or unmounting must release them.

## Bridge and capabilities

The HTML iframe allows scripts but withholds the parent's origin. Its document is
separate from the host document, so live panel, editor and DOM objects cannot be
passed into it. Validate the message source, frame token and payload at the host
boundary; reject malformed or unsafe property values, ignore detached placement
preview writes, and route accepted writes through the owning panel managers.

The current script API supplies `rivto.ready()` for the first detached snapshot,
`rivto.node`, `rivto.props` and `rivto.context` for current state, and bridge
methods for supported writes. `rivto.subscribe` observes document-data snapshots;
`rivto.subscribeContext` observes presentation changes separately. Neither
subscription calls its listener immediately. `context.mode`, `selected` and `preview`
describe the current block or element occurrence, with `selected` representing
whole-item selection. React renderers can construct the shared presentation state
with `useEmbeddedContentContext`, using the selection and preview they already own;
containers pass their existing layout's selection state. Consult the HTML surface
documentation for the supported methods and missing-value behavior.

For `unsafe-html`, retain host-controlled, occurrence-local and source-specific
opt-in, disabled by default. `rivto.panel` and `rivto.reactEditor` are `null`
when disabled; when enabled they expose bounded asynchronous operations, not live
objects. Recheck the current grant and source on each request, keep panel-local
and shared-editor scopes distinct, and show the existing warning when access is
requested while disabled and while it is enabled. Never store permission in
iframe-writable widget props. The sandbox does not block network requests or pin
external script contents; snapshot data can be sent to remote services.

## Pointer and selection ownership

An iframe is a separate document: its pointer events do not bubble to the parent.
The sandbox additionally prevents direct access to its document. A gesture that
starts in Page can otherwise lose pointer movement or release over any iframe,
leaving dragging or selection stuck. Page's pointer owner temporarily disables
pointer input on frames inside its root during its own gesture and restores it on
release, cancellation or detach. Keep this generic to embedded frames and keep
gesture completion, drop geometry and selection with the existing surface owner.

Gestures starting inside the iframe need real host-side hit targets. Unmarked HTML
backgrounds receive automatic targets; text, native controls and recognized
interactive elements retain their iframe events. Use `data-rivto-interactive` for
custom interactive areas whose handlers cannot be detected, including handlers
delegated to `document` or `window`. An explicit `data-rivto-drag-handle` marks a
noninteractive region and takes precedence over automatic background targets.
Do not mark controls, editable content or text that must remain selectable.
Regions follow layout, scrolling and size and are clipped to the iframe and
rectangular overflow ancestors; continuous CSS transforms on marked regions are
not tracked frame by frame. Placement previews are inert. Removing the last marker
restores automatic targets.

Other embedded renderers can use `EmbeddedDragHandles` with clipped, viewport-relative
regions in a positioned box. Set `blockSelectionAnchor` for Page block content.
An ordinary click in an HTML preview must not select the whole Page block; a
selection modifier can toggle a host region. On canvas, iframe pointer notifications
use the validated frame path and existing selection operations, group targeting and
modifier behavior. Preserve the native event so buttons work on the first click and
iframe text remains selectable. Never replay iframe messages as trusted pointer
events or use them to authorize moving other objects.

For an embedded source editor, place `editorControlProps` on the wrapper containing
the editable surface so Page recognizes the whole control. Check inherited
`user-select` styles, especially in a canvas visual host, and preserve the source
editor's focus, native selection, clipboard and local history.

## Verify behavior

Use real browser input in Chromium and Firefox, with Page and Edgeless wherever
the extension is supported. Cover ordinary clicks, keyboard activation, controls
on the first click, native text selection, modifier and group selection, and both
marked and unmarked drag backgrounds. Check Page selection in both directions
across an iframe, and drag another block over it and release: assert the committed
destination, cleanup and undo. For canvas, check a fast drag, live preview, final
commit, cancellation and undo, including a grouped element. Include populated
containers when the renderer is hosted there.

For source editing, drag across visible, hit-testable text and assert native
selection without structural block selection; exercise typing, clipboard,
local undo/redo, save and document undo. Test frame startup, subscriptions and
cleanup. For unsafe operations, cover disabled and forged requests, source change,
grant revocation and undo. Run the required
[rivto-performance-testing](../rivto-performance-testing/SKILL.md) workflow after
runtime changes, including normal and large demo fixtures and its browser and
performance checks.
