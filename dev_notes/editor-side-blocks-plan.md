# Editor side blocks

## Goal

Add a generic editor feature for content displayed beside document blocks.
Comments are the first intended use and appear on the right. The layout belongs
to the editor view and must not change embedded views. Use the experience at
https://www.riddled.ai/ as a visual reference. Its public landing page shows
responses beside writing and drawings beneath it; the actual writing view
redirects to sign-in, so its detailed interaction has not been verified.

Side blocks are lightweight components, not necessarily ordinary Rivto document
blocks. They do not need the normal block editor's caret tracking, nesting, or
other editing machinery. A simple component that updates its content is enough
as an initial example. The feature must be generic rather than tied to comments.

## Persistence and layout

- Persist side-block content and its association with a document block. Document
  plugin data is a possible storage location; a flat list of records without
  nesting is sufficient. Keep normal document content and embeddings separate
  from this editor-only presentation.
- Allow placement parameters to select either behavior: reserve vertical space
  and push following document blocks down, or extend beside subsequent blocks
  without changing their positions. Support content occupying a whole line when
  configured, even if that interrupts the editor's normal flow.
- Provide a way for extensions to render their own side-block components. The
  comments experience is one consumer, not the owner of the layout mechanism.
- Preserve persisted changes through document snapshots, collaboration, and undo.
  Check the concurrency characteristics of the chosen plugin-data record shape.
- Define anchor deletion, movement, copying, and multiple side blocks explicitly
  during implementation. Avoid silently losing persisted side content.

## Existing code and reference

- `origin/vs/comments` contains an initial comments implementation and is a
  reference for the intended experience and existing comment operations. Do not
  copy it as the implementation of this feature.
- That branch stores threads in document plugin data and renders a sibling
  sidebar. Its positioning and row-spacing code is specific to comments and
  targets an older Page layout.
- Embeddings do not use this plugin data. Read and render it as part of the
  editor view; embeddings do not need side-block support.
- Page supports nested blocks and optional root virtualization. Alignment and
  interaction need to account for mounted occurrences and their lifecycle.
- Plugin-data reads return detached portable values, and its field operations
  provide independently collaborative sibling records. Lightweight components
  can update their own data through the document API without pretending to be
  canonical document blocks.

## Implementation and verification

### Document-owned block collections

The current side editor stores detached block forests in plugin data and
reimplements block operations. A document-owned collection would let it use the
same block manager and collaborative block records as the page. It cannot be
implemented by leaving records without a parent: `BlockManager.normalize()`
appends every unreferenced record to the document roots, both at initialization
and after external updates. Snapshots currently serialize `blocks.getBlocks()`,
which traverses the document root forest, and snapshot loading replaces that
forest. A separate collection therefore needs a generic persisted root-list
contract included in normalization and snapshot round trips, as well as a panel
scope that uses that list. Plugin data can hold the association between an
anchor and a collection, but cannot be the only owner of the collection roots
without changing those invariants.

The collection contract must also define deletion and undo, concurrent edits,
block-ID uniqueness, moves across scopes, clipboard imports, and behavior when
an anchor is deleted or restored. Side and comment layout can continue to choose
flow or reserved space independently of block storage. Do not remove the
existing adapter until the replacement covers those paths and registered block
types and tools work in the new panel.

1. Choose a small persisted record and extension registration contract for flat
   side content, anchors, rendering, and spacing. Keep lifecycle ownership and
   consumer interfaces narrow.
2. Implement the editor-owned layout for both spacing modes, including resizing,
   scrolling, multiple side items, nested anchors, and virtualized rows. Keep
   side controls independent of the document surface's selection behavior.
3. Add a simple editable side-block example and use the shared mechanism for
   comments on the right. Preserve the intended comment operations and handle
   canvas comments separately where Page geometry does not apply.
4. Test persistence, collaboration, undo and anchor lifecycle at the appropriate
   layer. Use browser tests for actual editing, layout, selection, both spacing
   modes, and the absence of side content in embeddings. Cover Chromium and
   Firefox and follow the repository's Playwright worker and retry rules.
5. Follow the mandatory Rivto performance-testing workflow: capture an
   appropriate baseline, exercise the real demo at normal size and `?repeat=200`,
   and report timings and any remaining limitations. Review API ownership and
   cleanup separately from behavioral tests.

## Implementation

The optional React side-block extension renders registered lightweight
components in the page editor. Records use independent document plugin
namespaces, so concurrently created records merge even when no prior side data
exists. A record names a block or element anchor, a renderer type, its portable
data, spacing policy, and placement. The page layout supports right-side and
full-width content, reserved space and flow, and mounted virtualized anchors.
The comments extension uses the shared page layout and a separate canvas
sidebar. Messages use independently collaborative fields within a thread map.

Moving an anchor preserves its association. Copying a normal block does not copy
its side records. Deleting an anchor retains the records so an undo can restore
the association; callers can explicitly remove unwanted orphan records. The
`EditorEmbed` occurrence neither displays the layout nor offers its slash
commands. See `packages/react-rivto-editor/docs/side-blocks.md` for the public
registration, persistence, and layout contract and the demo URL.
