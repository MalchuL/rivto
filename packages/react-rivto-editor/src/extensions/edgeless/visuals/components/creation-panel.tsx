import type { PointerEvent as ReactPointerEvent } from "react";
import type { EdgelessVisualController } from "../controller";
import type {
  ConnectorRoute,
  EdgelessBrush,
  EdgelessFontOption,
  EdgelessStickerOption,
  EdgelessVisualTool,
  PresetPayload,
  ToolCategory,
} from "../types";
import { ColorControl } from "./color-control";
import { SizeControl } from "./size-control";
import { EdgelessToolButton, type EdgelessToolIcon } from "./tool-button";
import { ToolPopover } from "./tool-popover";

/** Category-specific Tools / Defaults content for the bottom create bar. */
export function CreationPanel({
  category,
  controller,
  tool,
  fonts: fontOptions,
  stickers: stickerOptions,
  startPresetDrag,
  movePresetDrag,
  endPresetDrag,
}: {
  category: ToolCategory;
  controller: EdgelessVisualController;
  tool: EdgelessVisualTool;
  fonts: readonly EdgelessFontOption[];
  stickers: readonly EdgelessStickerOption[];
  startPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, payload: PresetPayload): void;
  movePresetDrag(event: ReactPointerEvent<HTMLButtonElement>): void;
  endPresetDrag(event: ReactPointerEvent<HTMLButtonElement>, commit?: boolean): void;
}) {
  const defaults = controller.getDefaults();
  const brushIcon = (brush: EdgelessBrush): EdgelessToolIcon => brush === "pencil" ? "pencil" : brush === "pen" ? "pen" : "marker";
  const routeIcon = (route: ConnectorRoute): EdgelessToolIcon =>
    route === "orthogonal" ? "connector-orthogonal" : route === "curve" ? "connector-curve" : "connector-straight";

  const placePressed = (payload: PresetPayload) =>
    tool.tool === "place"
    && tool.kind === payload.kind
    && (payload.kind !== "sticker" || tool.fill === payload.fill);

  const preset = (label: string, payload: PresetPayload, icon?: EdgelessToolIcon, className = "") => (
    <EdgelessToolButton
      key={label}
      label={label}
      icon={icon}
      className={className}
      aria-pressed={placePressed(payload)}
      onPointerDown={(event) => startPresetDrag(event, payload)}
      onPointerMove={movePresetDrag}
      onPointerUp={(event) => endPresetDrag(event)}
      onPointerCancel={(event) => endPresetDrag(event, false)}
    >
      {category === "stickers" ? <span className="edgeless-sticker-swatch" style={{ background: payload.kind === "sticker" ? payload.fill : undefined }} /> : <span>{label}</span>}
    </EdgelessToolButton>
  );

  if (category === "shapes") {
    return (
      <ToolPopover
        category={category}
        tools={<>{preset("Rectangle", { kind: "rectangle" }, "rectangle")}{preset("Ellipse", { kind: "ellipse" }, "ellipse")}</>}
        defaults={
          <>
            <ColorControl label="Default fill" value={defaults.shape.fill} onChange={(fill) => controller.setCreationDefaults("shape", { fill })} />
            <ColorControl label="Default stroke" value={defaults.shape.stroke} onChange={(stroke) => controller.setCreationDefaults("shape", { stroke })} />
            <SizeControl label="Default stroke width" preview="dot" value={defaults.shape.strokeWidth} max={32} onChange={(strokeWidth) => controller.setCreationDefaults("shape", { strokeWidth })} />
          </>
        }
      />
    );
  }

  if (category === "drawing") {
    return (
      <ToolPopover
        category={category}
        tools={
          <>
            {(["pencil", "pen", "marker"] as EdgelessBrush[]).map((brush) => (
              <EdgelessToolButton
                key={brush}
                label={brush[0]!.toUpperCase() + brush.slice(1)}
                icon={brushIcon(brush)}
                aria-pressed={tool.tool === "drawing" && tool.brush === brush}
                onClick={() => { controller.setDrawingBrush(brush); }}
              />
            ))}
            <EdgelessToolButton
              label="Eraser"
              icon="eraser"
              aria-pressed={tool.tool === "eraser"}
              onClick={() => { controller.reactEditor.editor.execute("edgeless.tool.set", { tool: "eraser" }); }}
            />
          </>
        }
        defaults={
          <>
            <ColorControl label="Default drawing color" value={defaults.drawing.stroke} onChange={(stroke) => controller.setCreationDefaults("drawing", { stroke })} />
            <SizeControl label="Default drawing width" preview="dot" value={defaults.drawing.strokeWidth} max={48} onChange={(strokeWidth) => controller.setCreationDefaults("drawing", { strokeWidth })} />
          </>
        }
      />
    );
  }

  if (category === "text") {
    return (
      <ToolPopover
        category={category}
        tools={preset("Text", { kind: "text" }, "text")}
        defaults={
          <>
            <select
              aria-label="Default font"
              value={defaults.text.fontFamily}
              onChange={(event) => controller.setCreationDefaults("text", { fontFamily: event.currentTarget.value })}
            >
              {fontOptions.map((font) => <option key={font.fontFamily} value={font.fontFamily}>{font.label}</option>)}
            </select>
            <ColorControl label="Default text color" value={defaults.text.color} onChange={(color) => controller.setCreationDefaults("text", { color })} />
            <SizeControl label="Default font size" preview="text" value={defaults.text.fontSize} min={10} max={96} onChange={(fontSize) => controller.setCreationDefaults("text", { fontSize })} />
          </>
        }
      />
    );
  }

  if (category === "stickers") {
    return (
      <ToolPopover
        category={category}
        tools={stickerOptions.map((sticker) =>
          preset(sticker.label, { kind: "sticker", fill: sticker.fill, color: sticker.color, fontFamily: sticker.fontFamily }, undefined, "edgeless-sticker-preset"),
        )}
      />
    );
  }

  return (
    <ToolPopover
      category={category}
      tools={
        <>
          {(["straight", "orthogonal", "curve"] as ConnectorRoute[]).map((route) => (
            <EdgelessToolButton
              key={route}
              label={`${route[0]!.toUpperCase() + route.slice(1)} connector`}
              icon={routeIcon(route)}
              aria-pressed={tool.tool === "connector" && tool.route === route}
              onClick={() => {
                controller.setCreationDefaults("connector", { route });
                controller.reactEditor.editor.execute("edgeless.tool.set", { tool: "connector", route });
              }}
            />
          ))}
        </>
      }
      defaults={
        <>
          <ColorControl label="Default connector color" value={defaults.connector.stroke} onChange={(stroke) => controller.setCreationDefaults("connector", { stroke })} />
          <SizeControl label="Default connector width" preview="dot" value={defaults.connector.strokeWidth} max={24} onChange={(strokeWidth) => controller.setCreationDefaults("connector", { strokeWidth })} />
        </>
      }
    />
  );
}
