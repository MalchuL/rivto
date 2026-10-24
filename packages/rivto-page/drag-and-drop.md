# Shared drag primitives

Page exports browser interactions reused by the React host's Page/Edgeless
integration. These primitives do not import the host editor, document model, or
the Edgeless drag engine.

- `DropSurfaceRegistry<T>` registers borrowed receivers by their DOM roots and
  routes native hits across nested occurrences. `T` supplies the receiving
  engine's own capabilities. Registration returns an attachment-specific
  disposer; removing an older attachment cannot remove its replacement.
- `BlockPointerOwnership` reserves one pointer gesture across selection and DnD.
  The occurrence owns the instance; competing features borrow `acquire`.
- `BlockAutoScroll` owns one vertical nested-scroll session. Each gesture creates
  its own session and calls `stop` on completion, cancellation, or detach.
- `DragHandle` from `@chulane/rivto-page` renders the reusable button. The
  host supplies its label, styles, optional artwork, navigation/menu callbacks,
  and a suppression ref updated by the installed drag engine. The forwarded ref
  accepts the engine's sensor attachment. No sensor is installed implicitly.

The registry does not grant permission or perform transfers. Receiving adapters
must validate source identity, hierarchy, permissions, and current registration
again before committing. The host owns transactions, history, document loading,
and navigation. Separate registry instances intentionally isolate integrations.

Page keeps `BlockDragExtension` and its outline/drop geometry. Edgeless retains
its existing pointer engine. Both can register receivers and use the same handle
without depending on one another's engine. These primitives do not add keyboard DnD.

`BlockDropReceiver<T>` owns one registration, its feedback and detach listeners.
The host supplies its existing receiver identity and a registry narrowed to
`register`; the helper never inspects host commands or model fields. The owning
adapter destroys it when that occurrence detaches. Cleanup attempts registration
removal, feedback release and every listener even when one fails, then reports an
aggregate error. Late detach subscriptions are notified immediately.

`BlockDragRouter<T>` borrows only registry resolution, local target resolution,
and `BlockForeignDropResolver<T>`. It reuses the current native hit, routes nested
boundaries, and adds the foreign receiving identity to accepted targets. Its host
callback handles semantic acceptance and returns the canonical region directly. The router
owns no listeners; its source attachment owns its lifetime. Command-time receiver
identity and permission checks remain mandatory in the host's move adapter.

The React adapter retains document identity, model preview reads, transfer commits
and selection updates while Page and Edgeless share canonical drop destinations.
Page does not acquire any dependency on those host contracts.
