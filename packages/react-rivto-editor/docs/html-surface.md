# HTML surface extension

Install `htmlSurfaceExtension()` in the React editor to register the `html`
block and canvas element, their editing controls, a slash command, and an
Edgeless placement tool. Import `@chulane/rivto-react/styles.css` for the UI.
The exported `HTML_BLOCK_TYPE` and `HTML_ELEMENT_TYPE` identify the persisted
types. Uninstalling the extension removes its registrations, not document data.

A block stores its HTML in `content`; an element stores it in `props.html`.
Each widget runs its markup in an iframe sandbox with `allow-scripts` and `allow-forms`, and no
`allow-same-origin`. The parent posts a detached snapshot for that widget.
A block snapshot contains `kind`, `id`, `type`, `content`, `props`, `listProps`,
`pluginData`, and `childIds`. An element snapshot contains `kind`, `id`, `type`,
`frame`, `zIndex`, `props`, and `childIds`.

The script API is available as `window.rivto` before the authored markup runs:

- `rivto.ready()` resolves with the first snapshot; `rivto.node` is the latest
  snapshot or `null` before it arrives.
- `rivto.props` and `rivto.context` are live shortcuts to the latest snapshot's
  `props` and presentation context, or `null` before it arrives. The context has
  `mode` (`"block"` or `"edgeless"`), `selected` and `preview` in both block and
  element occurrences. `selected` means whole-block or whole-element selection,
  not text selection; detached creation previews report `preview: true`.
- `rivto.subscribe(callback)` invokes the callback on subsequent document-data
  snapshots and returns a function that removes that subscription. Context-only
  changes do not call it, so selection cannot inadvertently rerender widget text.
- `rivto.subscribeContext(callback)` observes later presentation-context changes
  and returns a disposer. Neither subscription invokes its callback immediately;
  both live in the iframe and end when it is replaced or removed.
- `rivto.setProp(key, value)` and `rivto.setProps(props)` merge properties.
  Values must be JSON-compatible, and prototype-related keys are rejected.
- `rivto.setListProps(props)` merges block list properties; it has no effect on
  elements. `rivto.setContent(text)` updates block content or element HTML.
  Replacing source recreates the iframe, including its script state.

Writes go through the current panel's managers and participate in document
history. Placement previews ignore writes. Block iframe height follows its content
up to 720 CSS pixels; an element iframe fills the host frame.

Use `rivto.ready()` for the initial state and `rivto.subscribe()` for subsequent
changes. These are detached snapshots: mutate widget properties with the bridge
methods rather than changing `rivto.props` directly. A widget can use ordinary
HTML classes and DOM layout APIs regardless of which surface hosts it:

```html
<div class="face" data-rivto-drag-handle></div>
<button id="action">Activate</button>
<script>
  function renderContext(context) {
    document.body.classList.toggle("selected", context.selected);
    document.body.dataset.mode = context.mode;
  }
  rivto.ready().then(function (node) {
    renderContext(node.context);
    rivto.subscribeContext(renderContext);
  });
</script>
```

`data-rivto-drag-handle` marks a noninteractive region that the surrounding
surface may use for its normal drag and selection gestures. The host projects a
native hit target over the region; it never converts iframe messages into pointer
events or trusts them as permission to edit another object. Mark only regions
that do not contain buttons, links, editable fields or text that must be selected:
the host target receives their pointer input. Without a marker, background areas
are used as drag targets while text, native controls, draggable elements and
elements with recognized click, pointer or drag-and-drop listeners retain iframe
interaction. Mark custom interactive content with
`data-rivto-interactive` when its interaction is delegated to the document or window,
or uses an event the bridge cannot identify. Regions follow normal layout, scrolling and element size;
they are clipped to the iframe and rectangular overflow ancestors. Continuous
CSS transforms on a marked region are not tracked frame by frame.
Removing the last marker restores automatic background targets. Placement previews are inert.

React renderers for other embedded blocks, elements or containers can reuse
`EmbeddedDragHandles` with clipped viewport-relative regions and a positioned
containing box. Set `blockSelectionAnchor` for block content so Page can start a
range gesture without selecting the block on a plain click; `className` can style
the host targets. The surrounding
surface owns the actual gesture and document mutation. `EmbeddedContentContext`
describes the shared presentation fields. `useEmbeddedContentContext(selected,
preview)` combines the actual surface with the caller's existing selection state.
Block renderers can obtain selection with `useBlockSelected`, while element
renderers receive `selected` and `preview` in `ElementRenderProps`. Containers
can pass the selection state owned by their existing layout.

The sandbox prevents scripts from reading the parent's DOM and origin, but does
not prevent network requests or form submissions. A form can navigate its iframe;
use `submit` with `preventDefault()` for in-place widget actions. Scripts receive the widget's snapshot, including
block plugin data, and can send those values to remote services. Install this
extension only where executing authored HTML and that data exposure are acceptable;
the sandbox is not a network isolation boundary.

## Unsafe HTML block

The extension also registers `unsafe-html`, exported as `UNSAFE_HTML_BLOCK_TYPE`.
Its scripts run in the same separate-origin sandbox as ordinary HTML. The block's
edit UI includes **Allow this HTML to read and modify editor blocks**, disabled by
default. Saving with that option enabled grants access only to that mounted
occurrence and source. Changing the source or unmounting the occurrence revokes
it; the decision is not persisted or controlled by widget props. A warning above
the block appears when access is requested while disabled and remains visible
while it is enabled.

`rivto.panel` and `rivto.reactEditor` return `null` when disabled. When enabled,
they expose asynchronous `blocks` methods: `getRootIds()`, `getParentId(id)`,
`getChildIds(id)`, `getBlockNode(id)`, and `setContent(id, text)`. The panel
methods respect the current panel boundary; React editor methods operate on the
shared document. Missing blocks and invalid operations return `null` where the
underlying operation has no result; errors from the editor reject the promise.
These are bounded bridge APIs, not the live objects exposed to React components.

The iframe can use these methods to read and modify other blocks when enabled,
and it can make network requests independently of that setting. Only grant access
to source you trust. The demo includes a panel-scoped and a shared-editor example
that append text to the preceding sibling and can be undone.

Permission follows the HTML source string, not a snapshot of external resources:
a script loaded from a URL can change independently. The unsafe bridge is not a
network isolation or external-script integrity mechanism.
