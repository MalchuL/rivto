import type { EdgelessSelection } from "@chulane/rivto";
import {
  useEditor,
  useEditorRoot,
  useKeyboardEvent,
} from "../hooks";
import { BUILTIN_KEYMAP, KEYBOARD_BINDING_IDS } from "../managers";
import { owningRootIds } from "./utils/edgeless-geometry";

/** Deletes selected canvas roots as one structural transaction. */
export function EdgelessDeletionPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.edgelessSelectionDelete,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.edgelessSelectionDelete],
    mode: "edgeless",
    when: ({ selection, raw: event }) => {
      if (!selection.some((item) => item.type === "edgeless")) return false;
      const target = event.target;
      return target instanceof HTMLElement &&
        !target.isContentEditable &&
        !/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(target.tagName);
    },
  }, () => {
    if (!root) return false;
    const selected = editor.selection.get()
      .find((item): item is EdgelessSelection => item.type === "edgeless");
    if (!selected) return false;
    editor.deleteSelection();
    const current = editor.selection.get().find((item) => item.type === "text");
    const owner = current ? owningRootIds(editor.getBlocks(), [current.head.blockId]) : [];
    const blockIds = owner.length ? owner : editor.getBlocks().slice(0, 1).map((block) => block.id);
    if (blockIds.length) {
      editor.selection.set([{ type: "edgeless", blockIds }]);
    } else {
      editor.selection.clear();
    }
    requestAnimationFrame(() => root.focus({ preventScroll: true }));
    return true;
  });

  return null;
}
