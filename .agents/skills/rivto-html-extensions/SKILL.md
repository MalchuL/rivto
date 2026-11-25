---
name: rivto-html-extensions
description: Create or change Rivto HTML/CSS/JavaScript blocks and Edgeless elements, their sandbox bridge, or other iframe-based content as extensions. Use alongside rivto-blocks or rivto-elements for the corresponding surface contract.
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
- `packages/react-rivto-editor/src/extensions/html-surface/` is organized by responsibility:
  - `extension.tsx` registers both blocks, the element, slots, context-menu
    conversions, slash commands and the creation tool; `index.ts` is the public surface.
  - `constants.ts` and `types.ts` hold persisted type IDs, node views, widget commands and drafts.
  - `model/` validates widget JSON and diffs edit-form props (pure functions).
  - `sandbox/` owns everything that crosses into the iframe: `compose-src-doc.ts`
    assembles the srcdoc, `frame-messages.ts` types and parses messages in both
    directions, and `runtime/` holds the iframe-side script fragments (bridge API,
    drag regions, text-selection relay, unsafe proxies) that share one documented scope.
  - `frame/` contains `HtmlFrame`, `useHtmlFrame` and `HtmlFrameConnection`, the
    port-owning connection to one composed document.
  - `editing/` holds the per-panel editing store, source editor, CodeMirror field,
    edit button and paste target; `block/`, `element/` and `unsafe/` hold the renderers.
    Both block types render through `HtmlBlockOccurrence`; `unsafe/unsafe-requests.ts`
    is the host side of editor access.
- `frame/html-drag-handles.tsx` draws host targets over widget drag regions and
  `frame/use-html-widget-context.ts` builds `rivto.context`. They belong to the HTML
  surface; "embed"/"embedding" in this repo means nested Rivto content (the
  `embedding` block, `EditorEmbed`), so do not reuse that term for iframes.
- Page exports `IFRAME_TEXT_SELECTION_EVENT` for relaying native text drags out of
  an iframe. `packages/rivto-page/src/editor/pointer/` and Page's block-editor CSS
  own gesture continuity across iframes.
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

`htmlSurfaceExtension(options)` takes the frame limits `maxBlockHeight` and
`maxDragRegions` (see `options.ts`). Pass a new limit the same way: add it to
`HtmlSurfaceOptions` with a documented default, validate it in
`resolveHtmlSurfaceLimits`, and read it from the `limits` the registrations hand
to renderers. Do not reintroduce module constants for such limits.

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

Let each widget draw its own border and choose its corner radius. Keep Page and
Edgeless preview iframes borderless and square. A radius on the iframe clips
authored corners even when the iframe has no border. Avoid decorative wrappers
that combine rounded corners with `overflow: hidden` around the preview.

In edit mode, use the theme radius on the source panel and a smaller radius on
CodeMirror fields. Round the scroller inside the field border so the gutter
follows its corners and long lines remain reachable by scrolling.

Let a Page block's content determine its iframe height. An authored
`html, body { height: 100%; }` makes the measured content depend on the iframe
height that Page sets from that measurement. At fractional browser zoom this
feedback can make the whole block alternate between heights on successive frames.
For widgets shared with Edgeless, leave the document root and body at their
default heights in the widget CSS. The bridge supplies full-height roots in
Edgeless fill mode.

To reproduce a reported jiggle, zoom the browser to 125% or 150% in Page mode
and sample the iframe's bounding rectangle in the parent across animation frames.
After layout settles, its height should stay stable. For a regression check,
hold width and content fixed, change only the iframe viewport height, and assert
that the widget's content height stays the same, as in the
[Page mixer test](../../../e2e/html-widget-interactions.spec.ts).

## Bridge and capabilities

The HTML iframe allows scripts and forms but withholds the parent's origin. Its document is
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
whole-item selection. The HTML renderers build it with `useHtmlWidgetContext` from
the selection and preview they already own. Consult the HTML surface
documentation for the supported methods and missing-value behavior.

For `unsafe-html`, retain host-controlled, occurrence-local and source-specific
opt-in, disabled by default. `rivto.panel` and `rivto.reactEditor` are `null`
when disabled; when enabled they expose bounded asynchronous operations, not live
objects. Recheck the current grant and source on each request, keep panel-local
and shared-editor scopes distinct, and show the existing warning when access is
requested while disabled. Show enabled access with the compact green edit icon
and its accessible description. Never store permission in iframe-writable widget props. The sandbox does not block network requests or pin
external script contents; snapshot data can be sent to remote services. Forms can
submit network requests and navigate their iframe; prevent the default `submit`
action for in-place widget operations, while preserving button and Enter activation.
Install that prevention before waiting for `rivto.ready()` so early input cannot
accidentally navigate the iframe; disable actions until their state is ready.

## Pointer and selection ownership

An iframe is a separate document: its pointer events do not bubble to the parent.
The sandbox additionally prevents direct access to its document. A gesture that
starts in Page can otherwise lose pointer movement or release over any iframe,
leaving dragging or selection stuck. Page's pointer owner temporarily disables
pointer input on frames inside its root during its own gesture and restores it on
release, cancellation or detach. Keep this generic to iframes and keep
gesture completion, drop geometry and selection with the existing surface owner.
Avoid guessed offscreen heights for HTML blocks: activating an offscreen iframe's
real layout can move another control between pointer-down and release. Check real
scroll and pointer behavior before adding content-visibility optimizations.

Use host-side hit targets for gestures that start on the widget background. Unmarked HTML
backgrounds receive automatic targets; text, native controls and recognized
interactive elements retain their iframe events. Native draggable elements and
elements with detected `dragstart`, `dragenter`, `dragover` or `drop` listeners
remain available to HTML drag-and-drop inside the iframe. Use `data-rivto-interactive` for
custom interactive areas whose handlers cannot be detected, including handlers
delegated to `document` or `window`. An explicit `data-rivto-drag-handle` marks a
noninteractive region and takes precedence over automatic background targets.
Do not mark controls, editable content or text that must remain selectable.
Regions follow layout, scrolling and size and are clipped to the iframe and
rectangular overflow ancestors; continuous CSS transforms on marked regions are
not tracked frame by frame. Placement previews are inert. Removing the last marker
restores automatic targets.

Keep ordinary text in an interactive HTML block selectable. When the primary mouse
button stays down and a nonempty native selection crosses the iframe boundary,
the bridge reports movement and release through the originating document's port.
Page resolves the block IDs from host geometry and starts whole-block selection
when the pointer reaches another block. Returning to the source block resumes
native selection. Escape cancels the provisional range. Releasing over the
neighbor commits it. Keep this path internal to the bridge. The widget API has
no need for a command that selects neighboring blocks. The
[iframe selection test](../../../e2e/html-interaction.spec.ts) exercises all three outcomes.

`HtmlDragHandles` draws clipped, viewport-relative regions in a positioned box;
`blockSelectionAnchor` is set for Page block content. An ordinary click in an HTML preview must not select the whole Page block; a
selection modifier can toggle a host region. On canvas, iframe pointer notifications
use the validated frame path and existing selection operations, group targeting and
modifier behavior. Preserve the native event so buttons work on the first click and
iframe text remains selectable. Never replay iframe messages as trusted pointer
events or use them to authorize moving other objects.

For custom pointer-driven controls, capture the actual pointer on pointer-down and
release or cancel it with the gesture; capture keeps fast movement owned by the
widget when the pointer leaves its control. Do not use a host drag marker over
that control. For a range input, update immediate visual feedback on `input` and
commit the intended document value on `change` when one undoable change is desired.
Keep the focused control stable across the widget's own document-update echo;
after a keyboard reorder, restore focus to an enabled control for the moved item.
An iframe's keyboard and paste events belong to its own document, so keep native
input, contenteditable selection and clipboard behavior inside the widget rather
than forwarding those events to Page or the canvas.
Track listener ownership without strongly retaining removed DOM nodes: use weak
references and prune dead entries while preserving controls inside shadow roots.
Disconnect observers on frame replacement. Verify that controls added or replaced
later, including in a closed shadow root, still receive clicks.

For a source editor inside a block or element, place `editorControlProps` on the wrapper containing
the editable surface so Page recognizes the whole control. Check inherited
`user-select` styles, especially in a canvas visual host, and preserve the source
editor's focus, native selection, clipboard and local history.

## Reorder items inside an HTML widget

For an in-widget reorder, follow the [Priority board](../../../demo/src/extensions/html-surface/interactive-samples.ts).
Use native HTML drag-and-drop when the interaction needs browser data transfer.
For local sorting, delegate pointer events to the list and capture the primary
pointer on the pressed row. Leave nested buttons and inputs available to their
own handlers. On the reorderable row, `user-select: none` keeps dragging its
label from selecting text. The bridge stops tracking text selection on
`gotpointercapture` for that pointer or on native `dragstart`, so dragging
outside the widget keeps the gesture with the sorter. Scope `touch-action` to the drag surface so the rest of the widget
can still scroll.

During capture, `event.target` continues to identify the captured element. Find
the hovered row with the iframe document's `elementFromPoint(clientX, clientY)`
and `closest`. Accept another row in the same list. Mark its actual insertion
edge with `data-drop-edge="before"` or `"after"`. Draw the line in the gap with
an absolutely positioned, theme-colored pseudo-element and `pointer-events: none`
so it preserves row geometry and hit testing. Update the marker only when its
row or edge changes. Keep the list DOM and document order stable during movement.

On release, hit-test once more and commit a valid move with one `rivto.setProp`
call so one undo restores the order. Clear the marker and capture on completion,
Escape, pointer cancellation, lost capture, or row replacement. Releasing outside
the list or cancelling leaves the order intact.

Use the [widget interaction tests](../../../e2e/html-widget-interactions.spec.ts)
to check the highlight while the button is held, cancellation, and the committed
order after release. For latency, drag in the production demo at normal size and
with `?repeat=200`. Measure pointer-down to the first movement event separately
from release to the rendered order. Event delivery and visible feedback are
distinct observations.

## Verify behavior

Use real browser input in Chromium and Firefox, with Page and Edgeless wherever
the extension is supported. Cover ordinary clicks, keyboard activation, controls
on the first click, native text selection, modifier and group selection, and both
marked and unmarked drag backgrounds. Check Page selection in both directions
across an iframe, and drag another block over it and release: assert the committed
destination, cleanup and undo. For canvas, check a fast drag, live preview, final
commit, cancellation and undo, including a grouped element. Include populated
containers when the renderer is hosted there.

Exercise a native slider, a form submitted by button and Enter, internal HTML
drag-and-drop, and a pointer-captured drag. Verify that interacting does not move
the canvas element or structurally select the Page block. Cut and paste inside
input and contenteditable fields, including an image URL that must remain text;
also copy and paste a whole HTML block and verify its source and properties.
For a reorderable widget, test keyboard focus and document undo as well as dragging.

For source editing, drag across visible, hit-testable text and assert native
selection without structural block selection; exercise typing, clipboard,
local undo/redo, save and document undo. Test frame startup, subscriptions and
cleanup. For unsafe operations, cover disabled and forged requests, source change,
grant revocation and undo. Run the required
[rivto-performance-testing](../rivto-performance-testing/SKILL.md) workflow after
runtime changes, including normal and large demo fixtures and its browser and
performance checks.
