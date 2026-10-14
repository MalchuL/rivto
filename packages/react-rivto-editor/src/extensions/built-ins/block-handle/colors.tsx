import { DropdownMenuItem, DropdownMenuLabel } from "../../../components/ui/dropdown-menu";
import { CheckIcon, SlashIcon } from "lucide-react";
import { useSyncExternalStore, type CSSProperties } from "react";
import type { ReactEditorApi } from "../../../editor/types";
import type { BlockContextMenuRenderContext } from "../../../managers/block-context-menu/types";
import { assertBlockMenuTargets } from "../../../managers/block-context-menu/targets";

/** Stable persisted palette tokens; empty means no background override. */
export const BLOCK_BACKGROUND_COLORS = [
  "",
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

/**
 * Renders inline background swatches for the captured explicit block targets.
 *
 * Subscribes to editor changes and derives the pressed swatch from all target
 * background values; mixed selections have no pressed swatch. Activation rechecks
 * target existence, batches color updates, and closes the menu. Default removes
 * each target's override; descendant overrides are not rewritten.
 *
 * @param context - Panel, captured target IDs, and callback closing the owning menu.
 * @returns A labeled group of keyboard-focusable menu items with color buttons.
 */
function BlockBackgroundColors(context: BlockContextMenuRenderContext) {
  const { reactPanel, blockIds, close } = context;
  /**
   * Reads the current background values for React's external-store comparison.
   *
   * @returns Comma-separated colors in captured target order; missing blocks or overrides contribute an empty string.
   */
  const snapshot = () =>
    blockIds
      .map((id) => String(reactPanel.blocks.getBlockNode(id)?.listProps.backgroundColor ?? ""))
      .join(",");
  useSyncExternalStore((listener) => reactPanel.editor.subscribe(listener), snapshot, snapshot);
  return (
    <div role="group" aria-label="Block background">
      <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
        Background
      </DropdownMenuLabel>
      <div className="block-color-swatches">
        {BLOCK_BACKGROUND_COLORS.map((color) => (
          <DropdownMenuItem key={color} asChild className="block-color-swatch rounded-full p-0">
            <button
              type="button"
              aria-label={color || "Default"}
              title={color || "Default"}
              aria-pressed={blockIds.every(
                (id) =>
                  (reactPanel.blocks.getBlockNode(id)?.listProps.backgroundColor ?? "") === color,
              )}
              style={
                {
                  backgroundColor: "var(--block-background)",
                  "--block-background": color ? `var(--rivto-block-${color})` : "transparent",
                } as CSSProperties
              }
              onClick={() => {
                assertBlockMenuTargets(context);
                reactPanel.batchUpdates(() => {
                  for (const id of blockIds) {
                    if (color) {
                      reactPanel.blocks.updateBlock(id, { listProps: { backgroundColor: color } });
                    } else {
                      reactPanel.blocks.deleteListProps(id, ["backgroundColor"]);
                    }
                  }
                });
                close();
              }}
            >
              {!color && <SlashIcon aria-hidden="true" />}
              {color &&
                blockIds.every(
                  (id) =>
                    (reactPanel.blocks.getBlockNode(id)?.listProps.backgroundColor ?? "") === color,
                ) && <CheckIcon aria-hidden="true" />}
            </button>
          </DropdownMenuItem>
        ))}
      </div>
    </div>
  );
}

/**
 * Registers the persisted background-color property and its inline menu renderer.
 *
 * The palette accepts only BLOCK_BACKGROUND_COLORS, with the empty string as the
 * default meaning no local override. The custom contribution mounts swatches in
 * the active menu rather than introducing a submenu.
 *
 * @param editor - Runtime owning list-property definitions and menu contributions.
 * @returns No value; both registrations are owned by the extension lifecycle.
 * @throws If registration is rejected by the list-property or context-menu registry.
 */
export function registerBlockBackground(editor: ReactEditorApi): void {
  editor.blockListProps.register({
    id: "backgroundColor",
    defaults: { backgroundColor: "" },
    /**
     * Checks the background property against the persisted palette tokens.
     *
     * @param candidate - Proposed list-property values supplied by the registry.
     * @returns True when backgroundColor is a supported token, including the empty default.
     */
    isValid: (candidate) =>
      BLOCK_BACKGROUND_COLORS.includes(
        candidate.backgroundColor as (typeof BLOCK_BACKGROUND_COLORS)[number],
      ),
  });
  editor.blockContextMenu.register({
    id: "block.background",
    title: "Background",
    kind: "custom",
    order: 10,
    /**
     * Mounts the inline palette for the currently open menu.
     *
     * @param context - Captured panel targets and the owning menu's close callback.
     * @returns The subscribed background-color control.
     */
    render: (context) => <BlockBackgroundColors {...context} />,
  });
}
