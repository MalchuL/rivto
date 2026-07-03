# AI document editing

This note describes how AI-assisted editing should integrate with Rivto. The
important boundary is `DocumentModelImpl`: AI edits are document transformations,
not DOM gestures, and must never depend on React, renderer internals, or native
Yjs objects.

## Intended data flow

```text
DocumentModelImpl snapshot or selected blocks
  → AI request
  → declarative edit operations
  → application validation
  → one DocumentModelImpl transaction
  → CRDTDoc update
  → RivtoEditorCore document event
  → page and edgeless renderers refresh
```

`RivtoEditorCore` subscribes to its document model. A model mutation emits a
`CRDTDoc` update, the editor increments its revision, and the React binding
renders a new detached `editor.document` value. AI code therefore does not need
to notify either renderer manually.

The AI must not receive `CRDTDoc`, CRDT containers, Yjs types, DOM nodes, or a
React component reference. This preserves the normal dependency direction:

```text
AI feature → DocumentModelImpl → CRDTDoc → Yjs adapter
```

## Operation format

The model should return data, not executable JavaScript. Start with the smallest
operation set needed by the product rather than exposing every document method.
For example:

```ts
type AIEdit =
  | { action: "replaceText"; blockId: string; content: string }
  | { action: "insertBlock"; afterId: string | null; block: BlockInput }
  | { action: "removeBlock"; blockId: string }
  | { action: "setBlockProp"; blockId: string; key: string; value: unknown };
```

Additional operations should be introduced only when an AI feature needs them.
Narrow operations make generated output easier to validate, authorize, preview,
test, and retry than a complete snapshot replacement.

The request sent to the model should include only the necessary detached data:

- The selected blocks or a relevant document excerpt.
- Stable block IDs needed as operation targets.
- Allowed block types and their property schemas.
- The user's instruction.
- Explicit output-schema instructions.

Do not send the complete document by default. Besides cost and privacy, a stale
whole-document response is more likely to overwrite concurrent changes.

## Validation boundary

AI output is untrusted input. Before opening a transaction, the executor must:

- Parse the response against a runtime schema.
- Reject unknown actions and malformed fields.
- Confirm every referenced block still exists.
- Confirm inserted block types are allowed for this AI command.
- Validate block props using the registered block definition.
- Apply product authorization rules, such as preventing edits to locked blocks.
- Limit operation count and generated content size.

Validation must finish before mutation begins. A partially valid response must
not leave half of an AI edit in the document.

## Applying an edit

Apply the validated operation list through the same `DocumentModelImpl` owned by
the editor, inside one outer transaction:

```ts
documentModel.transact(() => {
  for (const edit of edits) {
    switch (edit.action) {
      case "replaceText":
        documentModel.setBlockText(edit.blockId, edit.content);
        break;
      case "insertBlock":
        documentModel.insertBlock(edit.block, edit.afterId);
        break;
      case "removeBlock":
        documentModel.removeBlock(edit.blockId);
        break;
      case "setBlockProp":
        documentModel.setBlockProp(edit.blockId, edit.key, edit.value);
        break;
    }
  }
});
```

The model's granular methods preserve CRDT container identity and update only
the requested text or property. Avoid generating a modified snapshot and
calling `loadSnapshot()`: that would replace broad collaborative state from a
potentially stale view and is unsuitable for ordinary AI editing.

Using `editor.documentModel` is important for local undo. Its transaction origin
is the origin tracked by the editor's `UndoManager`. A separately constructed
`DocumentModelImpl` over the same `CRDTDoc` has a different origin; its updates
will still render, but they will not belong to this editor's local undo history.

## Block creation and the registry

`DocumentModelImpl` deliberately accepts arbitrary string block types and does
not own editor block definitions. Direct `documentModel.insertBlock()` therefore
does not apply `BlockRegistry` default props.

There are two valid creation paths:

1. Require AI `BlockInput` values to be complete, validate them against the
   registry, and insert through `DocumentModelImpl` inside the AI transaction.
2. Route only `insertBlock` operations through `editor.insertBlock()` so the
   registry applies defaults and schemas.

Prefer the second path for editor-owned AI features. Use direct model insertion
only for a storage-level AI service that receives and validates complete block
data. Content replacement, property changes, movement, and removal can remain
direct document-model operations.

Unknown block types must not be silently converted to paragraphs. Either reject
them as unsupported AI output or preserve them intentionally through the normal
unknown-block behavior.

## Editor responsibilities after mutation

Document updates and renderer refreshes are automatic. UI intent is not. After
the transaction, an editor-owned AI feature may explicitly update local state:

```ts
editor.setSelection({
  anchor: { blockId, offset },
  head: { blockId, offset },
});
editor.focus(blockId);
```

Keep these calls outside the document model because selection and focus are
local to one editor instance and must not be synchronized to collaborators.

Direct model deletion also bypasses `RivtoEditorCore.removeBlock()`, which clears
a selection whose endpoint disappeared. The AI coordinator must therefore clear
or replace an affected selection after applying removals. A future shared editor
command executor may centralize this behavior if more non-UI features need it;
do not add that abstraction for the first AI feature alone.

## Concurrency

AI inference is asynchronous, so the document may change after the prompt is
created. Operations should target stable block IDs and make narrow changes.
Immediately before applying them, validate their targets against the current
document.

For text replacement, the initial implementation may reject or ask the user to
review the edit when the target text changed during inference. Later, if product
behavior requires it, include expected source text or a revision token in each
operation and implement conflict-aware rebasing. Do not hold a CRDT transaction
open while waiting for the network response.

## Streaming

Buffer the result and apply one transaction by default. Applying every streamed
token creates noisy collaborative traffic, repeated renders, and awkward undo
history.

Visible token streaming should be added only when required by the UI. It needs
an explicit AI editing session that groups undo capture, handles cancellation,
and detects concurrent changes to the target range. A temporary React preview
is simpler when streamed text does not need to be collaborative before the user
accepts it.

## Suggested implementation ownership

The first implementation can remain small:

```text
src/editor/ai/types.ts       AIEdit operation types
src/editor/ai/validate.ts    runtime parsing and document/registry checks
src/editor/ai/apply.ts       pure coordination of validated operations
```

The network client and prompt construction belong to the host application or a
plugin, not the editor core. Rivto should define how approved operations are
applied, but it should not choose an AI provider, model, authentication scheme,
or prompt framework.

If only one application needs AI initially, keep these files in that application
until the operation protocol proves reusable. Moving stable behavior into Rivto
later is cheaper than maintaining a speculative public API.

## Minimum tests

- A validated text replacement updates both the document snapshot and editor
  revision.
- Several operations are applied as one undoable AI edit.
- Invalid output changes nothing.
- Missing or concurrently deleted targets are rejected before mutation.
- Inserted types and props are checked through `BlockRegistry`.
- Direct model changes appear in page and edgeless modes.
- Removing a selected block leaves no stale editor selection.
- A separate model origin is not accidentally captured as local editor undo.

## Initial scope

The first AI feature should support selection-based rewriting and optionally
inserting complete blocks. Defer provider-specific clients, streaming CRDT text,
autonomous agents, long-running edit sessions, semantic indexing, and conflict
rebasing until a concrete product flow requires them.
