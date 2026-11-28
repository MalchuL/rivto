# HTML surface extension

Install `htmlSurfaceExtension()` in the React editor to register the `html`
block and canvas element, their editing controls, a slash command, and an
Edgeless placement tool. Import `@chulane/rivto-react/styles.css` for the UI.
The exported `HTML_BLOCK_TYPE` and `HTML_ELEMENT_TYPE` identify the persisted
types. Uninstalling the extension removes its registrations, not document data.

`htmlSurfaceExtension(options)` accepts limits for widget frames. Each is
validated when the extension is created; an out-of-range value throws a
`RangeError`. `DEFAULT_HTML_SURFACE_LIMITS` exports the defaults.

| Option                    | Default | Meaning                                                                                                                                                    |
| ------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxBlockHeight`          | `720`   | Maximum height of a Page block iframe in CSS pixels. Taller content scrolls inside the frame. Canvas elements ignore it. Positive, finite.                 |
| `maxEditorPointerRegions` | `64`    | Maximum number of editor pointer regions one widget reports. The widget runtime stops at this count and the editor rejects longer lists. Positive integer. |
| `previewDelayMs`          | `400`   | Idle time after typing before the source editor updates Preview, in milliseconds. Integer from 0 to 2147483647.                                            |

The source editor's **Preview** toggle runs the current draft inline or beside the fields in a wide fullscreen editor. Invalid Props JSON pauses updates. Changing HTML restarts the sandbox, while changing only Props updates the running widget. The preview has local DOM interaction and exposes `rivto.context.preview` as true. Widget commands and unsafe editor access are disabled there. **Done** saves the draft and **Close** discards it.

```ts
htmlSurfaceExtension({ maxBlockHeight: 1200 });
```

A block stores its HTML in `content`; an element stores it in `props.html`.
Each widget runs its markup in an iframe sandbox with `allow-scripts` and `allow-forms`, and no
`allow-same-origin`. The authored document opens a private message port. The parent sends the initial detached snapshot as soon as that port connects, including while images are still loading. Snapshots, commands and replies use that port for the lifetime of the document.
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
up to `maxBlockHeight`; an element iframe fills the host frame.

In an interactive HTML block, dragging selected text into a neighboring Page block
selects both blocks and the range between them. Returning to the starting block
while holding the mouse resumes native text selection. Escape cancels the block
range. The iframe reports mouse coordinates through its document connection;
Page resolves the blocks under the pointer. Links and form controls keep their
normal mouse behavior.

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

`data-rivto-drag-handle` marks a noninteractive region whose presses go to the
surrounding surface instead of the widget: an editor pointer region. On the
canvas a press there selects the element and a drag moves it. In Page it acts as
a block-selection anchor: a modifier click toggles block selection and a drag
starts a range block selection; the block itself is moved with its gutter handle.
The editor lays a native hit target over the region; it never converts iframe messages into pointer
events or trusts them as permission to edit another object. Mark only regions
that do not contain buttons, links, editable fields or text that must be selected:
the editor's target receives their pointer input. Without a marker, background areas
become editor pointer regions while text, native controls, draggable elements and
elements with recognized click, pointer or drag-and-drop listeners retain iframe
interaction. Mark custom interactive content with
`data-rivto-interactive` when its interaction is delegated to the document or window,
or uses an event the bridge cannot identify. Regions follow normal layout, scrolling and element size;
they are clipped to the iframe and rectangular overflow ancestors. Continuous
CSS transforms on a marked region are not tracked frame by frame.
Removing the last marker restores automatic background targets. Placement previews are inert.

The host draws these regions as transparent `HtmlEditorPointerTargets` targets over the
iframe. In a Page block they are block-selection anchors, so Page can start a
range gesture without selecting the block on a plain click. The surrounding
surface owns the actual gesture and document mutation. `rivto.context` is an
`HtmlWidgetContext`, combining the actual surface with the block's or element's
existing selection state.

The sandbox prevents scripts from reading the parent's DOM and origin, but does
not prevent network requests or form submissions. A form can navigate its iframe;
the destination receives no widget connection. Use `submit` with `preventDefault()` for in-place widget actions. Scripts receive the widget's snapshot, including
block plugin data, and can send those values to remote services. Install this
extension only where executing authored HTML and that data exposure are acceptable;
the sandbox is not a network isolation boundary.

Each mounted panel owns its source-editing session. Inline and expanded fields share their selection and undo history. Saving applies the edited source and top-level property changes relative to the opening draft. Concurrent changes to untouched fields survive.

## Unsafe HTML block

The extension also registers `unsafe-html`, exported as `UNSAFE_HTML_BLOCK_TYPE`.
Its scripts run in the same separate-origin sandbox as ordinary HTML. The block's
edit UI includes **Allow this HTML to read and modify editor blocks**, disabled by
default. Saving approves this exact HTML for this document and block in browser
localStorage. Page and Edgeless share the decision. Source changes, conversion
and deletion revoke individual approval, including across undo while the document
is open. Copies have their own IDs and require their own approval.

Applications can supply `htmlSurfaceExtension({ permissions(document) { … } })`.
Each installation owns the returned provider and calls its `dispose` on teardown.
Its synchronous `read` checks the block ID, source and named capability
(`editorAccess`), `write` saves individual decisions, and `subscribe` signals
policy changes. The default storage format is private. The demo composes
`createLocalHtmlPermissions(document)` with a per-document toggle: while enabled,
all unsafe blocks including new or edited source receive editor access. Turning
it off restores individual approvals. The sandbox cannot write either policy.

The yellow edit button at the widget’s upper right expands
to show the access warning after a denied request. While access is enabled,
the button shows a compact green code icon and announces the enabled state to assistive technology.

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
