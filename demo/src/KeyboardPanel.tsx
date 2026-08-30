/**
 * Demo-only live keyboard inventory.
 *
 * The panel is a host application concern: it subscribes to the React editor
 * keyboard capability, edits overrides in place, and never reloads the page.
 *
 * @module
 */
import { KEYBOARD_BINDING_IDS, useReactEditor } from "@chulane/rivto-react";
import { useCallback, useState, useSyncExternalStore } from "react";

const KEYBOARD_PANEL_CLASS = "keyboard-panel";
const KEYBOARD_ROW_CLASS = "keyboard-panel-row";
const KEYBOARD_CONFLICT_CLASS = "keyboard-panel-conflict";

/**
 * Live inventory of semantic keyboard bindings for the current React editor.
 *
 * Subscribes to `keyboard.revision` so remap, disable, and restore take effect
 * without rebuilding the editor or reloading the page.
 *
 * @returns Collapsible shortcut editor used by the journal demo and keymap e2e.
 */
export function KeyboardPanel() {
  const editor = useReactEditor();
  const subscribe = useCallback(
    (listener: () => void) => editor.keyboard.subscribe(listener),
    [editor],
  );
  const revision = useSyncExternalStore(
    subscribe,
    () => editor.keyboard.revision,
    () => editor.keyboard.revision,
  );
  const bindings = editor.keyboard.list();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  return (
    <details className={KEYBOARD_PANEL_CLASS} data-keyboard-panel="" data-keyboard-revision={revision}>
      <summary>Keyboard shortcuts</summary>
      <p className="keyboard-panel-help">
        Edit a binding and apply it immediately. Disable leaves the action unmapped.
        Restore returns the extension default. Conflicts are warnings only.
      </p>
      <ul className="keyboard-panel-list">
        {bindings.map((binding) => {
          const draft = drafts[binding.id] ?? binding.keys.join(", ");
          const status = !binding.installed
            ? "uninstalled"
            : binding.disabled
              ? "disabled"
              : binding.overridden
                ? "overridden"
                : "default";
          return (
            <li
              key={binding.id}
              className={KEYBOARD_ROW_CLASS}
              data-binding-id={binding.id}
              data-binding-status={status}
              data-binding-keys={binding.keys.join(",")}
            >
              <div className="keyboard-panel-id">
                <code>{binding.id}</code>
                <span data-binding-status-label="">{status}</span>
              </div>
              <div className="keyboard-panel-defaults">
                default: <code>{binding.defaultKeys.join(", ") || "—"}</code>
              </div>
              <label className="keyboard-panel-edit">
                <span>Shortcut for {binding.id}</span>
                <input
                  value={draft}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDrafts((current) => ({ ...current, [binding.id]: value }));
                  }}
                />
              </label>
              <div className="keyboard-panel-actions">
                <button
                  type="button"
                  data-keyboard-action="apply"
                  onClick={() => {
                    const keys = draft.split(",").map((part) => part.trim()).filter(Boolean);
                    editor.keyboard.setKeymapOverride(binding.id, keys);
                  }}
                >
                  Apply
                </button>
                <button
                  type="button"
                  data-keyboard-action="disable"
                  onClick={() => editor.keyboard.setKeymapOverride(binding.id, [])}
                >
                  Disable
                </button>
                <button
                  type="button"
                  data-keyboard-action="restore"
                  onClick={() => {
                    editor.keyboard.setKeymapOverride(binding.id, undefined);
                    setDrafts((current) => {
                      const next = { ...current };
                      delete next[binding.id];
                      return next;
                    });
                  }}
                >
                  Restore
                </button>
              </div>
              {binding.conflicts.length > 0 && (
                <p className={KEYBOARD_CONFLICT_CLASS} data-binding-conflicts="">
                  Conflicts with {binding.conflicts.join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <p className="keyboard-panel-indent-hint" data-indent-binding={KEYBOARD_BINDING_IDS.blockIndent}>
        Indent defaults to Tab.
      </p>
    </details>
  );
}
