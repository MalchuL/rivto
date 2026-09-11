/**
 * Demo-only live inventory of manager revision counters.
 *
 * The panel is a host application concern: it lists each public manager that
 * exposes a monotonic revision so reactivity can be inspected without
 * console logging. Presentation registries subscribe independently of the
 * core editor stream because those counters do not bump `editor.revision`.
 *
 * @module
 */
import { useReactEditor, type ReactEditor } from "@chulane/rivto-react";
import { useCallback, useSyncExternalStore } from "react";

const REVISION_PANEL_CLASS = "revision-panel";
const REVISION_TABLE_WRAP_CLASS = "revision-panel-table-wrap";
const REVISION_TABLE_CLASS = "revision-panel-table";
const REVISION_HELP_CLASS = "revision-panel-help";

interface ManagerRevision {
  readonly manager: string;
  readonly revision: number;
}

interface RevisionSnapshot {
  readonly key: string;
  readonly rows: readonly ManagerRevision[];
}

const snapshots = new WeakMap<ReactEditor, RevisionSnapshot>();

/**
 * Reads every public manager revision and caches the row list by value.
 *
 * Returning the previous array when counters are unchanged keeps
 * `useSyncExternalStore` from scheduling a render on every listener fire.
 *
 * @param reactEditor - Runtime whose managers are inspected.
 * @returns Stable snapshot of manager names and revision counters.
 */
function readManagerRevisions(reactEditor: ReactEditor): RevisionSnapshot {
  const rows: readonly ManagerRevision[] = [
    { manager: "editor", revision: reactEditor.revision },
    { manager: "blocks", revision: reactEditor.editor.blocks.revision },
    { manager: "renderers", revision: reactEditor.renderers.revision },
    { manager: "keyboard", revision: reactEditor.keyboard.revision },
    { manager: "surfaces", revision: reactEditor.surfaces.revision },
    { manager: "extensions", revision: reactEditor.extensions.revision },
    { manager: "slashCommands", revision: reactEditor.slashCommands.revision },
  ];
  const key = rows.map((row) => `${row.manager}:${row.revision}`).join("|");
  const cached = snapshots.get(reactEditor);
  if (cached?.key === key) return cached;
  const next = { key, rows };
  snapshots.set(reactEditor, next);
  return next;
}

/**
 * Subscribes to every manager stream that owns an independent revision.
 *
 * @param reactEditor - Runtime whose revision stores are observed.
 * @param listener - Callback invoked after any subscribed counter changes.
 * @returns Combined disposer for every subscription.
 */
function subscribeManagerRevisions(reactEditor: ReactEditor, listener: () => void): () => void {
  const stop = [
    reactEditor.subscribe(listener),
    reactEditor.renderers.subscribe(listener),
    reactEditor.keyboard.subscribe(listener),
    reactEditor.surfaces.subscribe(listener),
    reactEditor.extensions.subscribe(listener),
    reactEditor.slashCommands.subscribe(listener),
  ];
  return () => stop.forEach((unsubscribe) => unsubscribe());
}

/**
 * Collapsible table of live manager revision counters.
 *
 * @returns Details panel used next to the keyboard-shortcut inventory.
 */
export function RevisionsPanel() {
  const reactEditor = useReactEditor();
  const subscribe = useCallback(
    (listener: () => void) => subscribeManagerRevisions(reactEditor, listener),
    [reactEditor],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readManagerRevisions(reactEditor),
    () => readManagerRevisions(reactEditor),
  );

  return (
    <details className={REVISION_PANEL_CLASS} data-revision-panel="" data-revision-key={snapshot.key}>
      <summary>Manager revisions</summary>
      <p className={REVISION_HELP_CLASS}>
        Counters bump when that manager publishes. <code>editor</code> follows
        document and mode; <code>blocks</code> follows block data; the rest are
        React registries.
      </p>
      <div className={REVISION_TABLE_WRAP_CLASS}>
        <table className={REVISION_TABLE_CLASS}>
          <thead>
            <tr>
              <th scope="col">Manager</th>
              <th scope="col">Revision</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.rows.map((row) => (
              <tr key={row.manager} data-manager={row.manager} data-revision={row.revision}>
                <th scope="row">
                  <code>{row.manager}</code>
                </th>
                <td>
                  <code>{row.revision}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
