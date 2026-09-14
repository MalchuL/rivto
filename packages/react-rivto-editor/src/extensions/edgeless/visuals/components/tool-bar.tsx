import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { isNodeLike } from "../../../../managers/events/dom-nodes";
import type { EdgelessVisualController } from "../controller";
import type { EdgelessFontOption, EdgelessStickerOption, EdgelessVisualTool, PresetPayload, ToolCategory } from "../types";
import { CreationPanel } from "./creation-panel";
import { EdgelessToolButton, type EdgelessToolIcon } from "./tool-button";

const categories: readonly { id: ToolCategory; label: string; icon: EdgelessToolIcon }[] = [
  { id: "shapes", label: "Shapes", icon: "rectangle" },
  { id: "drawing", label: "Drawing", icon: "draw" },
  { id: "text", label: "Text", icon: "text" },
  { id: "stickers", label: "Stickies", icon: "sticker" },
  { id: "connectors", label: "Connectors", icon: "connector" },
];

function categoryIcon(category: ToolCategory, last: EdgelessVisualTool, fallback: EdgelessToolIcon): EdgelessToolIcon {
  if (category === "shapes" && last.tool === "place") return last.kind === "ellipse" ? "ellipse" : "rectangle";
  if (category === "drawing") {
    if (last.tool === "eraser") return "eraser";
    if (last.tool === "drawing") return last.brush === "pen" ? "pen" : last.brush === "marker" ? "marker" : "pencil";
  }
  if (category === "connectors" && last.tool === "connector") {
    return last.route === "orthogonal" ? "connector-orthogonal" : last.route === "curve" ? "connector-curve" : "connector-straight";
  }
  return fallback;
}

function categoryActive(category: ToolCategory, tool: EdgelessVisualTool): boolean {
  if (category === "shapes") return tool.tool === "place" && (tool.kind === "rectangle" || tool.kind === "ellipse");
  if (category === "text") return tool.tool === "place" && tool.kind === "text";
  if (category === "stickers") return tool.tool === "place" && tool.kind === "sticker";
  if (category === "drawing") return tool.tool === "drawing" || tool.tool === "eraser";
  if (category === "connectors") return tool.tool === "connector";
  return false;
}

/** Bottom-centered create toolbar with always-visible Select and category popovers. */
export function ToolBar({
  controller,
  tool,
  fonts,
  stickers,
  startPresetDrag,
  movePresetDrag,
  endPresetDrag,
}: {
  controller: EdgelessVisualController;
  tool: EdgelessVisualTool;
  fonts: readonly EdgelessFontOption[];
  stickers: readonly EdgelessStickerOption[];
  startPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, payload: PresetPayload): void;
  movePresetDrag(event: ReactPointerEvent<HTMLButtonElement>): void;
  endPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, commit?: boolean): void;
}) {
  const [menu, setMenu] = useState<ToolCategory | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const close = () => setMenu(null);

  useEffect(() => {
    if (!menu) return;
    const view = barRef.current?.ownerDocument.defaultView;
    if (!view) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!isNodeLike(target) || barRef.current?.contains(target)) return;
      // Keep the category submenu open while placing/drawing on the canvas —
      // only dismiss on Select/Pan, category toggle, or Escape.
      const current = controller.getTool().tool;
      if (current === "place" || current === "drawing" || current === "eraser" || current === "connector") {
        return;
      }
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Close the popover without stopping Escape so tool/select bindings still run.
      setMenu(null);
    };
    view.addEventListener("pointerdown", onPointerDown, true);
    view.addEventListener("keydown", onKeyDown, true);
    return () => {
      view.removeEventListener("pointerdown", onPointerDown, true);
      view.removeEventListener("keydown", onKeyDown, true);
    };
  }, [controller, menu]);

  const selectTool = () => {
    controller.reactEditor.editor.execute("edgeless.tool.set", "select");
    close();
  };

  const panTool = () => {
    controller.reactEditor.editor.execute("edgeless.tool.set", { tool: "pan" });
    close();
  };

  return (
    <div ref={barRef} className="edgeless-tool-bar" data-edgeless-ui="true" data-menu-open={menu || undefined} role="toolbar" aria-label="Visual objects">
      <EdgelessToolButton
        label="Select"
        icon="select"
        aria-pressed={tool.tool === "select"}
        onClick={selectTool}
      />
      <EdgelessToolButton
        label="Pan"
        icon="pan"
        aria-pressed={tool.tool === "pan"}
        onClick={panTool}
      />
      <span className="edgeless-tool-bar-divider" aria-hidden="true" />
      {categories.map((category) => {
        const open = menu === category.id;
        const last = controller.getLastTool(category.id);
        const active = categoryActive(category.id, tool);
        return (
          <EdgelessToolButton
            key={category.id}
            label={category.label}
            icon={categoryIcon(category.id, last, category.icon)}
            aria-expanded={open}
            aria-pressed={active || open}
            onClick={() => {
              if (open) {
                setMenu(null);
                return;
              }
              controller.activateCategory(category.id);
              setMenu(category.id);
            }}
          />
        );
      })}
      {menu && (
        <CreationPanel
          category={menu}
          controller={controller}
          tool={tool}
          fonts={fonts}
          stickers={stickers}
          startPresetDrag={startPresetDrag}
          movePresetDrag={movePresetDrag}
          endPresetDrag={endPresetDrag}
        />
      )}
    </div>
  );
}
