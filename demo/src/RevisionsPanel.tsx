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
import { useReactPanel, type ReactPanelApi } from "@chulane/rivto-react";
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

const snapshots = new WeakMap<ReactPanelApi, RevisionSnapshot>();

/**
 * Reads every public manager revision and caches the row list by value.
 *
 * Returning the previous array when counters are unchanged keeps
 * `useSyncExternalStore` from scheduling a render on every listener fire.
 *
 * @param panel - Editor view whose managers are inspected.
 * @returns Stable snapshot of manager names and revision counters.
 */
function readManagerRevisions(reactPanel: ReactPanelApi): RevisionSnapshot {
  const rows: readonly ManagerRevision[] = [
    { manager: "editor", revision: reactPanel.document.revision },
    { manager: "blocks", revision: reactPanel.blocks.revision },
    { manager: "renderers", revision: reactPanel.editor.renderers.revision },
    { manager: "keyboard", revision: reactPanel.keyboard.revision },
    { manager: "surfaces", revision: reactPanel.editor.surfaces.revision },
    { manager: "extensions", revision: reactPanel.editor.extensions.revision },
    { manager: "slashCommands", revision: reactPanel.slashCommands.revision },
  ];
  const key = rows.map((row) => `${row.manager}:${row.revision}`).join("|");
  const cached = snapshots.get(reactPanel);
  if (cached?.key === key) {
    return cached;
  }
  const next = { key, rows };
  snapshots.set(reactPanel, next);
  return next;
}

/**
 * Subscribes to every manager stream that owns an independent revision.
 *
 * @param panel - Editor view whose revision stores are observed.
 * @param listener - Callback invoked after any subscribed counter changes.
 * @returns Combined disposer for every subscription.
 */
function subscribeManagerRevisions(reactPanel: ReactPanelApi, listener: () => void): () => void {
  const stop = [
    reactPanel.subscribe(listener),
    reactPanel.editor.renderers.subscribe(listener),
    reactPanel.keyboard.subscribe(listener),
    reactPanel.editor.surfaces.subscribe(listener),
    reactPanel.editor.extensions.subscribe(listener),
    reactPanel.slashCommands.subscribe(listener),
  ];
  return () => stop.forEach((unsubscribe) => unsubscribe());
}

/**
 * Collapsible table of live manager revision counters.
 *
 * @returns Details panel used next to the keyboard-shortcut inventory.
 */
export function RevisionsPanel() {
  const reactPanel = useReactPanel();
  const subscribe = useCallback(
    (listener: () => void) => subscribeManagerRevisions(reactPanel, listener),
    [reactPanel],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => readManagerRevisions(reactPanel),
    () => readManagerRevisions(reactPanel),
  );

  return (
    <details
      className={REVISION_PANEL_CLASS}
      data-revision-panel=""
      data-revision-key={snapshot.key}
    >
      <summary>Manager revisions</summary>
      <p className={REVISION_HELP_CLASS}>
        Counters bump when that manager publishes. <code>editor</code> follows document and mode;{" "}
        <code>blocks</code> follows block data; the rest are React registries.
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
