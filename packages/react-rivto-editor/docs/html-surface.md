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
