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

/** Renders keyboard-focusable color swatches; mixed selections have no pressed swatch. */
function BlockBackgroundColors(context: BlockContextMenuRenderContext) {
  const { reactPanel, blockIds, close } = context;
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

/** Registers validated list properties and an extension-owned custom menu contribution. */
export function registerBlockBackground(editor: ReactEditorApi): void {
  editor.blockListProps.register({
    id: "backgroundColor",
    defaults: { backgroundColor: "" },
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
    render: (context) => <BlockBackgroundColors {...context} />,
  });
}
