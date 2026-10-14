import { focusSelectionCaret } from "../../../managers";
import { deletePanelSelection } from "../selection/selection-deletion";
import { createStructuralSelection } from "@chulane/rivto";
import type { ReactEditorApi } from "../../../editor/types";
import type { BlockContextMenuContext } from "../../../managers/block-context-menu/types";
import { assertBlockMenuTargets } from "../../../managers/block-context-menu/targets";
import { writeClipboardBundle } from "../../../managers/clipboard/browser-clipboard";

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
  await writeClipboardBundle(reactPanel.editor, bundle);
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
 * @param editor - Runtime registry receiving extension-owned menu registrations.
 * @returns No value; registration cleanup belongs to the active extension lifecycle.
 * @throws If the registry is inactive or a contribution ID is already registered.
 */
export function registerBlockClipboardActions(editor: ReactEditorApi): void {
  for (const [id, title, cut] of [
    ["copy", "Copy", false],
    ["cut", "Cut", true],
  ] as const) {
    editor.blockContextMenu.register({
      id: `clipboard.${id}`,
      title,
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
  editor.blockContextMenu.register({
    id: "block.delete",
    title: "Delete",
    order: 100,
    execute: deleteMenuBlocks,
  });
}

/**
 * Registers the List style submenu and its ordinary, numbered, and checkbox choices.
 *
 * A choice is checked only when every explicit target has that list type; mixed
 * targets have no checked choice. Executing a choice updates all captured blockIds
 * in one updateBlocks call and resets their checked list property to false.
 *
 * @param editor - Runtime registry receiving extension-owned menu registrations.
 * @returns No value; registration cleanup belongs to the active extension lifecycle.
 * @throws If the registry is inactive or a contribution ID is already registered.
 */
export function registerBlockListActions(editor: ReactEditorApi): void {
  editor.blockContextMenu.register({ id: "list", title: "List style", kind: "submenu", order: 20 });
  for (const [type, title] of [
    ["list", "Ordinary list"],
    ["numbered_list", "Numbered list"],
    ["checkbox", "Checkboxes"],
  ] as const) {
    editor.blockContextMenu.register({
      id: `list.${type}`,
      parentId: "list",
      title,
      /**
       * Checks whether every explicit target uses this list choice.
       *
       * @param context - Invoking panel and captured block IDs.
       * @returns True only when all targets have this entry's list type.
       */
      isChecked: ({ reactPanel, blockIds }) =>
        blockIds.every((id) => reactPanel.blocks.getBlockNode(id)?.listProps.type === type),
      /**
       * Applies this list choice to all explicit targets in one bulk update.
       *
       * @param context - Invoking panel and captured block IDs.
       * @returns No value after updating type and clearing checked state.
       */
      execute: ({ reactPanel, blockIds }) => {
        reactPanel.blocks.updateBlocks(
          blockIds.map((id) => ({ id, patch: { listProps: { type, checked: false } } })),
        );
      },
    });
  }
}

/**
 * Updates collapse state throughout the captured root subtrees in one bulk call.
 *
 * Each reachable ID is visited once, including hidden descendants. Missing blocks
 * are skipped. Only blocks with children and a different collapse value are
 * patched; leaf blocks and their existing properties remain unchanged.
 *
 * @param context - Panel operations and selected roots from the open menu.
 * @param collapsed - True to collapse every parent, false to expand every parent.
 * @returns No value; changes are applied through the panel's updateBlocks operation.
 */
export function setSubtreesCollapsed(context: BlockContextMenuContext, collapsed: boolean): void {
  const { reactPanel, rootIds } = context;
  const ids: string[] = [];
  const pending = [...rootIds];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const block = reactPanel.blocks.getBlockNode(id);
    if (!block) {
      continue;
    }
    pending.push(...block.childIds);
    if (block.childIds.length && block.listProps.collapsed !== collapsed) {
      ids.push(id);
    }
  }
  reactPanel.blocks.updateBlocks(ids.map((id) => ({ id, patch: { listProps: { collapsed } } })));
}

/**
 * Registers Collapse subtree and Expand whole subtree menu actions.
 *
 * Both actions visit captured root subtrees, including hidden descendants, and
 * write the collapse extension's persisted list property through panel operations.
 *
 * @param editor - Runtime registry receiving extension-owned menu registrations.
 * @returns No value; registration cleanup belongs to the active extension lifecycle.
 * @throws If the registry is inactive or a contribution ID is already registered.
 */
export function registerBlockCollapseActions(editor: ReactEditorApi): void {
  for (const [id, title, collapsed] of [
    ["collapse", "Collapse subtree", true],
    ["expand", "Expand whole subtree", false],
  ] as const) {
    editor.blockContextMenu.register({
      id: `block.${id}`,
      title,
      order: 60,
      /**
       * Applies this entry's collapse state to all parent blocks in the selected subtrees.
       *
       * @param context - Invoking panel and captured root IDs.
       * @returns No value after the bulk collapse update completes.
       */
      execute: (context) => setSubtreesCollapsed(context, collapsed),
    });
  }
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
  const root = reactPanel.events.getRoot();
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
