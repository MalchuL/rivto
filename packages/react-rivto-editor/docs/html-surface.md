# HTML surface extension

Install `htmlSurfaceExtension()` in the React editor to register the `html`
block and canvas element, their editing controls, a slash command, and an
Edgeless placement tool. Import `@chulane/rivto-react/styles.css` for the UI.
The exported `HTML_BLOCK_TYPE` and `HTML_ELEMENT_TYPE` identify the persisted
types. Uninstalling the extension removes its registrations, not document data.

A block stores its HTML in `content`; an element stores it in `props.html`.
Each widget runs its markup in an iframe sandbox with `allow-scripts` and no
`allow-same-origin`. The parent posts a detached snapshot for that widget.
A block snapshot contains `kind`, `id`, `type`, `content`, `props`, `listProps`,
`pluginData`, and `childIds`. An element snapshot contains `kind`, `id`, `type`,
`frame`, `zIndex`, `props`, and `childIds`.

The script API is available as `window.rivto` before the authored markup runs:

- `rivto.ready()` resolves with the first snapshot; `rivto.node` is the latest
  snapshot or `null` before it arrives.
- `rivto.subscribe(callback)` invokes the callback on subsequent snapshots and
  returns a function that removes that subscription. It does not invoke the
  callback immediately. Subscriptions live in the iframe and end when it is
  replaced or removed.
- `rivto.setProp(key, value)` and `rivto.setProps(props)` merge properties.
  Values must be JSON-compatible, and prototype-related keys are rejected.
- `rivto.setListProps(props)` merges block list properties; it has no effect on
  elements. `rivto.setContent(text)` updates block content or element HTML.
  Replacing source recreates the iframe, including its script state.

Writes go through the current panel's managers and participate in document
history. Placement previews ignore writes. Block iframe height follows its content
within 140–720 CSS pixels; an element iframe fills the host frame.

The sandbox prevents scripts from reading the parent's DOM and origin, but does
not prevent network requests. Scripts receive the widget's snapshot, including
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
