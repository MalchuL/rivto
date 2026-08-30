/**
 * Demo-only live keyboard inventory.
 *
 * The panel is a host application concern: it lists bindings as a table, records
 * a replacement chord in a centered modal, and never reloads the page.
 *
 * @module
 */
import {
  KEYBOARD_BINDING_IDS,
  parseShortcut,
  shortcutFromKeyboardEvent,
  useReactEditor,
  type KeyboardBindingSnapshot,
} from "@chulane/rivto-react";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const KEYBOARD_PANEL_CLASS = "keyboard-panel";
const KEYBOARD_TABLE_CLASS = "keyboard-panel-table";
const KEYBOARD_KEY_CLASS = "keyboard-panel-key";
const KEYBOARD_CONFLICT_CLASS = "keyboard-panel-conflict";
const KEYBOARD_ACTIONS_CLASS = "keyboard-panel-actions";
const KEYBOARD_MODAL_BACKDROP_CLASS = "keyboard-shortcut-backdrop";
const KEYBOARD_MODAL_CLASS = "keyboard-shortcut-modal";
const KEYBOARD_MODAL_PREVIEW_CLASS = "keyboard-shortcut-preview";
const KEYBOARD_MODAL_HINT_CLASS = "keyboard-shortcut-hint";
const KEYBOARD_MODAL_ERROR_CLASS = "keyboard-shortcut-error";

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "Hyper", "OS"]);

interface ShortcutRecorderTarget {
  readonly binding: KeyboardBindingSnapshot;
}

/**
 * Returns a portable shortcut for a recorded native event.
 *
 * `+` is stored as the named `Plus` token so the editor parser can accept it.
 *
 * @param event - Native keydown captured by the recorder.
 * @returns Canonical shortcut, or undefined when the event is not a complete chord.
 */
function recordedShortcut(event: KeyboardEvent): string | undefined {
  if (MODIFIER_KEYS.has(event.key)) return undefined;
  const raw = shortcutFromKeyboardEvent(event);
  const portable = event.key === "+" || raw === "+"
    ? `${raw.replace(/\++$/, "")}+Plus`.replace(/^\+Plus/, "Plus")
    : raw;
  return parseShortcut(portable).source;
}

/**
 * Reports whether Enter should accept the recorded chord.
 *
 * @param event - Native keyboard event.
 * @returns True for unmodified Enter.
 */
function isApproveKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
}

/**
 * Reports a row's override status for the table and e2e selectors.
 *
 * @param binding - Current inventory snapshot.
 * @returns Stable status token.
 */
function bindingStatus(binding: KeyboardBindingSnapshot): string {
  if (!binding.installed) return "uninstalled";
  if (binding.disabled) return "disabled";
  if (binding.overridden) return "overridden";
  return "default";
}

/**
 * Centered chord recorder. Escape closes it; unmodified Enter applies the chord.
 *
 * @param props - Binding being edited and close/apply callbacks.
 * @returns Modal portal attached to `document.body`.
 */
function KeyboardShortcutModal({
  target,
  onCancel,
  onApprove,
}: {
  readonly target: ShortcutRecorderTarget;
  readonly onCancel: () => void;
  readonly onApprove: (shortcut: string) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<string | undefined>(
    target.binding.keys[0],
  );
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    dialogRef.current?.focus();
    const view = dialogRef.current?.ownerDocument.defaultView ?? window;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === "Escape") {
        onCancel();
        return;
      }
      if (isApproveKey(event)) {
        if (!draft) {
          setError("Press a key combination, then Enter to accept.");
          return;
        }
        onApprove(draft);
        return;
      }
      try {
        const next = recordedShortcut(event);
        if (!next) return;
        setDraft(next);
        setError(undefined);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "That combination is not valid.");
      }
    };
    view.addEventListener("keydown", onKeyDown, true);
    return () => view.removeEventListener("keydown", onKeyDown, true);
  }, [draft, onApprove, onCancel]);

  return createPortal(
    <div
      className={KEYBOARD_MODAL_BACKDROP_CLASS}
      data-keyboard-recorder=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={KEYBOARD_MODAL_CLASS}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>Record shortcut for {target.binding.id}</h2>
        <p className={KEYBOARD_MODAL_PREVIEW_CLASS} data-keyboard-recorder-preview="">
          {draft ?? "Waiting for a key combination…"}
        </p>
        <p className={KEYBOARD_MODAL_HINT_CLASS}>
          Press the new combination. Enter accepts it. Escape cancels.
        </p>
        {error && <p className={KEYBOARD_MODAL_ERROR_CLASS}>{error}</p>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Live inventory of semantic keyboard bindings for the current React editor.
 *
 * Rows are a table. Clicking the keybinding opens a recorder so the user can
 * press one replacement combination instead of typing a shortcut string.
 *
 * @returns Collapsible shortcut table used by the journal demo and keymap e2e.
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
  const [recorder, setRecorder] = useState<ShortcutRecorderTarget | undefined>();

  /**
   * Replaces a binding with one recorded combination and publishes immediately.
   *
   * @param binding - Inventory row being edited.
   * @param shortcut - Newly recorded portable shortcut.
   */
  const applyShortcut = (
    binding: KeyboardBindingSnapshot,
    shortcut: string,
  ): void => {
    editor.keyboard.setKeymapOverride(binding.id, [shortcut]);
    setRecorder(undefined);
  };

  return (
    <details className={KEYBOARD_PANEL_CLASS} data-keyboard-panel="" data-keyboard-revision={revision}>
      <summary>Keyboard shortcuts</summary>
      <p className="keyboard-panel-help">
        Click a keybinding to record a replacement. Enter accepts, Escape cancels.
        Conflicts are warnings only.
      </p>
      <div className="keyboard-panel-table-wrap">
        <table className={KEYBOARD_TABLE_CLASS}>
          <thead>
            <tr>
              <th scope="col">Command</th>
              <th scope="col">Keybinding</th>
              <th scope="col">Default</th>
              <th scope="col">Source</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bindings.map((binding) => {
              const status = bindingStatus(binding);
              const shortcut = binding.keys[0] ?? "";
              return (
                <tr
                  key={binding.id}
                  data-binding-id={binding.id}
                  data-binding-status={status}
                  data-binding-keys={shortcut}
                >
                  <th scope="row">
                    <code>{binding.id}</code>
                    {binding.conflicts.length > 0 && (
                      <p className={KEYBOARD_CONFLICT_CLASS} data-binding-conflicts="">
                        Conflicts with {binding.conflicts.join(", ")}
                      </p>
                    )}
                  </th>
                  <td>
                    <button
                      type="button"
                      className={KEYBOARD_KEY_CLASS}
                      aria-label={`Shortcut for ${binding.id}`}
                      data-keyboard-action="record"
                      onClick={() => setRecorder({ binding })}
                    >
                      {shortcut || "Click to record"}
                    </button>
                  </td>
                  <td>
                    <code>{binding.defaultKeys.join(", ") || "—"}</code>
                  </td>
                  <td data-binding-status-label="">{status}</td>
                  <td>
                    <div className={KEYBOARD_ACTIONS_CLASS}>
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
                        onClick={() => editor.keyboard.setKeymapOverride(binding.id, undefined)}
                      >
                        Restore
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="keyboard-panel-indent-hint" data-indent-binding={KEYBOARD_BINDING_IDS.blockIndent}>
        Indent defaults to Tab.
      </p>
      {recorder && (
        <KeyboardShortcutModal
          target={recorder}
          onCancel={() => setRecorder(undefined)}
          onApprove={(shortcut) => applyShortcut(recorder.binding, shortcut)}
        />
      )}
    </details>
  );
}
