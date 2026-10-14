import { focusSelectionCaret } from "../../../managers";
import { deletePanelSelection } from "../selection/selection-deletion";
import { createStructuralSelection } from "@chulane/rivto";
import type { ReactEditorApi } from "../../../editor/types";
import type { BlockContextMenuContext } from "../../../managers/block-context-menu/types";
import { assertBlockMenuTargets } from "../../../managers/block-context-menu/targets";
import { writeClipboardBundle } from "../../../managers/clipboard/browser-clipboard";

/** Copies the captured roots; cut removes them only after the system write succeeds. */
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

/** Registers structural clipboard and deletion actions independently of slash commands. */
export function registerBlockClipboardActions(editor: ReactEditorApi): void {
  for (const [id, title, cut] of [
    ["copy", "Copy", false],
    ["cut", "Cut", true],
  ] as const) {
    editor.blockContextMenu.register({
      id: `clipboard.${id}`,
      title,
      order: 80,
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

/** Installs list choices owned by the list extension; mixed targets have no checked entry. */
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
      isChecked: ({ reactPanel, blockIds }) =>
        blockIds.every((id) => reactPanel.blocks.getBlockNode(id)?.listProps.type === type),
      execute: ({ reactPanel, blockIds }) => {
        reactPanel.blocks.updateBlocks(
          blockIds.map((id) => ({ id, patch: { listProps: { type, checked: false } } })),
        );
      },
    });
  }
}

/** Visits selected subtrees once, including hidden descendants, for recursive collapse commands. */
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

/** Registers recursive outline commands using the collapse extension's persisted property. */
export function registerBlockCollapseActions(editor: ReactEditorApi): void {
  for (const [id, title, collapsed] of [
    ["collapse", "Collapse subtree", true],
    ["expand", "Expand whole subtree", false],
  ] as const) {
    editor.blockContextMenu.register({
      id: `block.${id}`,
      title,
      order: 60,
      execute: (context) => setSubtreesCollapsed(context, collapsed),
    });
  }
}

/** Restores captured structural targets before applying container-aware deletion. */
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
