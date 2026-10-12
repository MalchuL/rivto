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
import { usePanel, type PanelAPI } from "@chulane/rivto-react";
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

const snapshots = new WeakMap<PanelAPI, RevisionSnapshot>();

/**
 * Reads every public manager revision and caches the row list by value.
 *
 * Returning the previous array when counters are unchanged keeps
 * `useSyncExternalStore` from scheduling a render on every listener fire.
 *
 * @param panel - Editor view whose managers are inspected.
 * @returns Stable snapshot of manager names and revision counters.
 */
function readManagerRevisions(panel: PanelAPI): RevisionSnapshot {
  const rows: readonly ManagerRevision[] = [
    { manager: "editor", revision: panel.editor.document.revision },
    { manager: "blocks", revision: panel.editor.document.blocks.revision },
    { manager: "renderers", revision: panel.editor.renderers.revision },
    { manager: "keyboard", revision: panel.keyboard.revision },
    { manager: "surfaces", revision: panel.editor.surfaces.revision },
    { manager: "extensions", revision: panel.editor.extensions.revision },
    { manager: "slashCommands", revision: panel.slashCommands.revision },
  ];
  const key = rows.map((row) => `${row.manager}:${row.revision}`).join("|");
  const cached = snapshots.get(panel);
  if (cached?.key === key) return cached;
  const next = { key, rows };
  snapshots.set(panel, next);
  return next;
}

/**
 * Subscribes to every manager stream that owns an independent revision.
 *
 * @param panel - Editor view whose revision stores are observed.
 * @param listener - Callback invoked after any subscribed counter changes.
 * @returns Combined disposer for every subscription.
 */
function subscribeManagerRevisions(panel: PanelAPI, listener: () => void): () => void {
  const stop = [
    panel.editor.document.subscribe(listener),
    panel.editor.renderers.subscribe(listener),
    panel.keyboard.subscribe(listener),
    panel.editor.surfaces.subscribe(listener),
    panel.editor.extensions.subscribe(listener),
    panel.slashCommands.subscribe(listener),
  ];
  return () => stop.forEach((unsubscribe) => unsubscribe());
}

/**
 * Collapsible table of live manager revision counters.
 *
 * @returns Details panel used next to the keyboard-shortcut inventory.
 */
export function RevisionsPanel() {
  const panel = usePanel();
  const subscribe = useCallback(
    (listener: () => void) => subscribeManagerRevisions(panel, listener),
    [panel],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readManagerRevisions(panel),
    () => readManagerRevisions(panel),
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
