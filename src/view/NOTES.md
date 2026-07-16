# React view contracts

`EditorView` provides editor, root, and plugin context around an explicit
surface child. It never chooses a surface. `BlockView` is the stable block DOM
container; surfaces choose block renderers, recursion, and layout.

Plugins are declarative React wrappers. A root wrapper handles delegated events
or overlays, while an optional block wrapper adds behavior such as selection or
drag handles. Plugins are ordered, scoped to one `EditorView`, and cleaned up by
React. Concrete page and edgeless surfaces belong to the consuming application.
