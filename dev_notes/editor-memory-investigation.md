# Editor memory investigation

The production demo was examined in Chromium with forced garbage collection after
repeated operations. Heap sizes include live editor and CRDT state; they are not
measurements of total browser or operating-system memory.

- Creating, moving and deleting batches of 100 blocks, then clearing history,
  increased the JavaScript heap by roughly 0.35 MiB per batch in the initial
  probe before history limits were added, with and without Page virtualization. DOM node and listener counts
  stayed constant after deletion. The same operations excluded from history
  increased the heap by about 0.06–0.15 MiB per batch.
- Five image paste/delete cycles created and revoked ten object URLs. DOM nodes
  and listeners returned to the same counts after each cycle. These small
  samples do not establish a long-term heap bound.
- The Page controller retained requested node objects for its entire lifetime.
  Its cache now allows unused nodes to be collected and retains nodes while
  their subscriptions need teardown. `e2e/page-node-memory.spec.ts` exercises
  collection, retained subscriptions, and mounted-block deletion with and
  without virtualization. Subscription setup also releases a host disposer if
  a synchronous initial notification destroys the controller before setup returns.
- Yjs 13.6.31 retained a document-destroy listener for every destroyed undo
  manager. The workspace requires 13.6.33, which removes it; the CRDT adapter
  test checks listener removal and another history manager's undo safety.
- Eight editor unmount/remount cycles against borrowed models returned to 39 DOM
  nodes and 160 listeners after every unmount. Forced-GC heap grew from about
  6.7 to 7.9 MiB. Comparing snapshots after cycles 3 and 12 showed the largest
  increases in V8 code and compilation structures; this suggests runtime
  warm-up but does not rule out smaller retained objects.

## Cleared history

With Yjs 13.6.33, a map containing a nested map and text retains the deleted
nested content after the undo manager's `clear()`. Calling Yjs `tryGc` releases
that content in a single-manager experiment, but it can also destroy data
needed by another undo manager. `clear()` removes a shared keep flag without
tracking how many managers need the item. The adapter exposes the native Yjs
document, so it cannot safely assume it knows all history owners. No forced
collection workaround is installed. In a separate isolated experiment, the
deleted content remained after 1,000 unrelated untracked insert/delete
transactions; ordinary editing did not promptly collect it.

Counting `afterTransaction` observers is not a reliable ownership check. An
external native undo manager can retain a usable undo stack after its observer
is detached. In a reproduction, the document then had only one such observer,
but forced collection still prevented the external manager from restoring its
deleted value. Checking private observer counts would therefore not make the
workaround safe.

Yjs also retains some CRDT tombstone metadata to preserve synchronization; this
is distinct from the deleted content observed after clearing history. See the
[Yjs internals description](https://github.com/yjs/yjs/blob/main/INTERNALS.md)
and its separately reported [deleted map-entry issue](https://github.com/yjs/yjs/issues/741).
The fixed undo-manager listener issue is tracked [upstream](https://github.com/yjs/yjs/issues/797).

The forced-GC browser checks use Chromium's DevTools protocol. Firefox behavior
is covered by interaction tests, not by equivalent heap collection checks.

Document history now defaults to 100 undo and redo entries and accepts
`maxHistoryEntries` at model construction. Trimming is scheduled for idle time,
with a timer fallback, and is flushed before undo or redo. A zero limit disables
capture. This bounds available actions, not retained CRDT content: evicted stack
items may leave Yjs keep flags that even a later `history.clear()` cannot release.
No forced Yjs collection is scheduled because other history owners may need the
same content.

With 100 history entries already recorded, five warmed Chromium Tab samples gave
median synchronous command times of 1.0 ms before the limit and 1.1 ms after at
normal size; with `repeat=200`, the medians were 12.8 and 12.7 ms. The two-frame
medians were 31.4 and 31.6 ms at normal size, and 183.0 and 163.3 ms with
`repeat=200`. Synchronous ranges were 0.9–1.1 and 1.1–1.4 ms at normal size,
and 12.0–17.6 and 11.5–14.6 ms with `repeat=200`. Two-frame ranges were
31.0–31.9 and 30.9–32.7 ms at normal size, and 167.9–202.8 and 159.4–167.0 ms
with `repeat=200`. The idle callbacks measured at most 0.1 ms in this sample.
These figures include only the observed interaction and are not a memory bound.

For a production-preview comparison, the original and modified Page controller
used the same installed Yjs version and Chromium. Five warmed Tab samples gave a
median synchronous indent command time of 1.2 ms in both builds at normal size,
and 16.7 ms before versus 16.5 ms after with `repeat=200`. The corresponding
medians from the key event to two animation frames were 31.9 versus 31.9 ms,
and 215.9 versus 212.2 ms. The large-fixture frame samples ranged from 199.1 to
233.5 ms before and 204.1 to 216.1 ms after. Two frames are a rendering proxy,
not proof that asynchronous layout has settled.
