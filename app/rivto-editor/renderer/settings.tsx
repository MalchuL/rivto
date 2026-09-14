/**
 * Native settings dialog for persistent editor width and live shortcut overrides.
 * Binding validation and conflict inventory stay owned by Rivto's keyboard
 * manager. The host persists only user overrides, never default bindings.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseShortcut, type ReactEditor } from '@chulane/rivto-react';

export interface Settings { width: number; keymap: Record<string, string[]> }
export const DEFAULT_SETTINGS: Settings = { width: 860, keymap: {} };
const SETTINGS_CLASS = 'settings-dialog';

/** Renders a focus-trapped native settings dialog with live binding edits.
 * @param props - Current runtime, persisted settings and update/close callbacks.
 * @returns Modal settings UI.
 */
export function SettingsDialog({ editor, settings, onChange, onClose }: {
  editor: ReactEditor; settings: Settings; onChange: (settings: Settings) => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  useSyncExternalStore((listener) => editor.keyboard.subscribe(listener), () => editor.keyboard.revision);
  /** Applies validated keys and saves only explicit overrides.
   * @param id - Semantic command ID.
   * @param value - Shortcut string, empty to disable, undefined to restore.
   * @returns No value; shows parse errors inline.
   */
  function apply(id: string, value?: string): void {
    try {
      const keys = value === undefined ? undefined : value.trim() ? [parseShortcut(value.trim()).source] : [];
      editor.keyboard.setKeymapOverride(id, keys);
      const keymap = { ...settings.keymap };
      if (keys === undefined) delete keymap[id]; else keymap[id] = keys;
      onChange({ ...settings, keymap });
      setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Invalid shortcut'); }
  }
  return <dialog ref={ref} className={SETTINGS_CLASS} onCancel={onClose} aria-labelledby="settings-title">
    <header><h2 id="settings-title">Make room for your ideas</h2><button onClick={onClose} aria-label="Close settings">✕</button></header>
    <label>Editor width <output>{settings.width} px</output><input aria-label="Editor width" type="range" min="560" max="1440" step="20" value={settings.width} onChange={(event) => onChange({ ...settings, width: Number(event.target.value) })} /></label>
    <h3>Keyboard shortcuts</h3><p>Use Primary for ⌘ on Mac or Ctrl elsewhere. Enter a combination such as Primary+Shift+K, then press Enter or leave the field. Empty disables a command.</p>
    <p>App: Primary+N new · Primary+O open · Primary+S save · Primary+Shift+S save as · Primary+Shift+E export · Primary+, settings.</p>
    {error && <p role="alert">{error}</p>}
    <table><thead><tr><th>Command</th><th>Shortcut</th><th>Default</th></tr></thead><tbody>
      {editor.keyboard.list().filter((binding) => binding.installed).map((binding) => <tr key={binding.id}>
        <th scope="row">{binding.id}{binding.overridden && binding.conflicts.length > 0 && <small>Conflict: {binding.conflicts.join(', ')}</small>}</th>
        <td><input key={binding.keys.join(',')} aria-label={`Shortcut for ${binding.id}`} defaultValue={binding.keys.join(', ')} onBlur={(event) => { if (event.target.value !== binding.keys.join(', ')) apply(binding.id, event.target.value); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></td>
        <td><button onClick={() => apply(binding.id)}>Reset</button></td>
      </tr>)}
    </tbody></table>
    <footer><button onClick={() => { for (const id of Object.keys(settings.keymap)) editor.keyboard.setKeymapOverride(id, undefined); onChange(DEFAULT_SETTINGS); }}>Restore defaults</button><button onClick={onClose}>Done</button></footer>
  </dialog>;
}
