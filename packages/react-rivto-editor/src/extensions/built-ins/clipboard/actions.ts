import { createStructuralSelection } from "@chulane/rivto";
import { CopyIcon, ScissorsIcon, Trash2Icon } from "lucide-react";
import { focusSelectionCaret } from "../../../managers";
import { deletePanelSelection } from "../../../managers/selection/delete-panel-selection";
import { assertBlockMenuTargets } from "../../../managers/block-context-menu/targets";
import { writeClipboardBundle } from "../../../managers/clipboard/browser-clipboard";
import type {
  BlockContextMenuContext,
  BlockContextMenuRegistration,
} from "../../../managers/block-context-menu/types";

/**
 * Copies selected root subtrees, optionally deleting them after a successful write.
 *
 * Returns without writing when the panel cannot produce a clipboard bundle. For
 * cut, targets and a freshly copied bundle are checked after the asynchronous
 * write. If the source changed, the copied data remains on the clipboard while
 * the document is left intact. Successful deletion uses container-aware policies.
 *
 * @param context - Invoking panel and captured ancestor-deduplicated root IDs.
 * @param cut - Whether to delete the unchanged source after copying it.
 * @returns Completion of the write and, for cut, source deletion and focus scheduling.
 * @throws If clipboard writing fails, targets disappear, the copied source changes,
 * or the invoking panel cannot perform deletion.
 */
async function copyBlocks(context: BlockContextMenuContext, cut: boolean): Promise<void> {
  const { reactPanel, rootIds } = context;
  const bundle = reactPanel.clipboard.copy(createStructuralSelection([...rootIds]));
  if (!bundle) {
    return;
  }
  await writeClipboardBundle(reactPanel.editor.clipboardFormats, bundle);
  if (cut) {
    assertBlockMenuTargets(context);
    // Do not remove edits that arrived while the clipboard permission prompt was open.
    const current = reactPanel.clipboard.copy(createStructuralSelection([...rootIds]));
    if (JSON.stringify(current) !== JSON.stringify(bundle)) {
      throw new Error("Blocks changed while copying; copied content was kept and nothing was cut");
    }
    deleteMenuBlocks(context);
  }
}

/**
 * Registers Copy, Cut, and Delete contributions independently of slash commands.
 *
 * Copy and Cut operate on captured root subtrees. Delete restores those roots as
 * a structural selection and uses the same container policies as keyboard deletion.
 *
 * @param menu - Block menu registration capability owned by the extension lifecycle.
 * @returns No value; registration cleanup belongs to the active extension lifecycle.
 * @throws If the registry is inactive or a contribution ID is already registered.
 */
export function registerBlockClipboardActions(menu: BlockContextMenuRegistration): void {
  for (const [id, title, cut, icon] of [
    ["copy", "Copy", false, CopyIcon],
    ["cut", "Cut", true, ScissorsIcon],
  ] as const) {
    menu.register({
      id: `clipboard.${id}`,
      title,
      icon,
      order: 80,
      /**
       * Copies or cuts the captured root subtrees through browser clipboard writing.
       *
       * @param context - Invoking panel and captured roots.
       * @returns Completion of the write and guarded deletion when this entry is Cut.
       * @throws If clipboard writing or the post-write source checks fail.
       */
      execute: (context) => copyBlocks(context, cut),
    });
  }
  menu.register({
    id: "block.delete",
    title: "Delete",
    icon: Trash2Icon,
    variant: "destructive",
    order: 100,
    execute: deleteMenuBlocks,
  });
}

/**
 * Deletes captured root subtrees using the invoking panel's structural selection.
 *
 * The captured roots replace the current selection before container policies run.
 * After deletion, caret focus is restored when possible, otherwise the surface
 * root receives focus. A second caret restoration is scheduled only while the
 * resulting selection remains unchanged.
 *
 * @param context - Invoking panel and ancestor-deduplicated roots to delete.
 * @returns No value after deletion and deferred focus restoration are scheduled.
 * @throws If the panel has no mounted surface root or its deletion operations fail.
 */
function deleteMenuBlocks(context: BlockContextMenuContext): void {
  const { reactPanel, rootIds } = context;
  const root = reactPanel.getRoot();
  if (!root) {
    throw new Error("The invoking panel is no longer mounted");
  }
  reactPanel.selection.set(createStructuralSelection([...rootIds]));
  deletePanelSelection(reactPanel, root);
  if (!focusSelectionCaret(root, reactPanel.selection)) {
    root.focus({ preventScroll: true });
  }
  reactPanel.selection.scheduleIfSelectionUnchanged(() =>
    focusSelectionCaret(root, reactPanel.selection),
  );
}
