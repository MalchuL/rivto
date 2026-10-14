import type { ReactEditorApi } from "../../../editor/types";
import type {
  EdgelessToolbarGroupProps,
  EdgelessToolbarTool,
} from "../../../managers/edgeless-toolbar/types";
import type { EdgelessVisualsOptions } from "./types";
import type { EdgelessToolIcon } from "../../../components/edgeless/tool-button";
import type { PresetPayload } from "../../../elements/visuals/types";
import { DEFAULT_FONTS, DEFAULT_STICKERS } from "../../../elements/visuals/presets";
import {
  ShapeTools,
  DrawingTools,
  TextTools,
  StickerTools,
  ConnectorTools,
} from "./components/creation-panel";

/** Sticky thumbnails share these hooks with the built-in creation panel styles. */
const STICKER_PRESET_CLASS = "edgeless-creation-panel-sticker-preset";
const STICKER_SWATCH_CLASS = "edgeless-creation-panel-sticker-swatch";

/**
 * Installs built-in tool groups through the same registry used by host extensions.
 * Installs shapes, drawing, text, stickers and connectors groups, their presets and
 * custom group contents. Element definitions are installed separately by registerVisualElements.
 * Hosts can add members by registering tools with the corresponding group ID.
 * @param editor - Shared React editor that owns these registrations.
 * @param options - Host font and sticker catalogs used by the registered groups.
 * Host catalog entries replace built-ins with the same fontFamily or sticker ID.
 * @returns Idempotent cleanup; partial installation is rolled back if a registration conflicts.
 * @throws If the owner is inactive or a group/tool ID is already registered.
 */
export function registerVisualToolbar(
  editor: ReactEditorApi,
  options: EdgelessVisualsOptions,
): () => void {
  const disposers: Array<() => void> = [];
  const cleanup = () =>
    disposers
      .splice(0)
      .reverse()
      .forEach((dispose) => dispose());
  const registry = editor.edgelessToolbar;
  const register = (tool: EdgelessToolbarTool) => disposers.push(registry.registerTool(tool));
  const preset = (
    id: string,
    title: string,
    group: string,
    payload: PresetPayload,
    icon?: EdgelessToolbarTool["icon"],
  ) => {
    register({
      id,
      title,
      group,
      icon,
      isActive: (tool) =>
        tool.tool === "place" &&
        tool.kind === payload.kind &&
        (payload.kind !== "sticker" || tool.fill === payload.fill),
      activate: ({ operations }) => operations.setPlaceTool(payload),
      getButtonProps: (context) => ({
        // Pointer release already activates the preset; only keyboard clicks need the common activation.
        onClick: (event) => {
          if (event.detail > 0) {
            event.preventDefault();
          }
        },
        className: payload.kind === "sticker" ? STICKER_PRESET_CLASS : undefined,
        onPointerDown: (event) => context.startPresetDrag(event, payload),
        onPointerMove: context.movePresetDrag,
        onPointerUp: (event) => context.endPresetDrag(event),
        onPointerCancel: (event) => context.endPresetDrag(event, false),
      }),
    });
  };
  try {
    const fonts = [
      ...new Map(
        [...DEFAULT_FONTS, ...(options.fonts ?? [])].map((font) => [font.fontFamily, font]),
      ).values(),
    ];
    const stickers = [
      ...new Map(
        [...DEFAULT_STICKERS, ...(options.stickers ?? [])].map((sticker) => [sticker.id, sticker]),
      ).values(),
    ];
    const TextGroup = (props: EdgelessToolbarGroupProps) => <TextTools {...props} fonts={fonts} />;
    for (const group of [
      {
        id: "shapes",
        title: "Shapes",
        icon: "rectangle",
        render: ShapeTools,
        defaultToolId: "rectangle",
      },
      { id: "drawing", title: "Drawing", icon: "draw", render: DrawingTools, defaultToolId: "pen" },
      { id: "text", title: "Text", icon: "text", render: TextGroup },
      { id: "stickers", title: "Stickies", icon: "sticker", render: StickerTools },
      { id: "connectors", title: "Connectors", icon: "connector", render: ConnectorTools },
    ] as const) {
      disposers.push(registry.registerGroup(group));
    }
    preset("rectangle", "Rectangle", "shapes", { kind: "rectangle" }, "rectangle");
    preset("ellipse", "Ellipse", "shapes", { kind: "ellipse" }, "ellipse");
    for (const brush of ["pencil", "pen", "marker"] as const) {
      register({
        id: brush,
        title: brush[0]!.toUpperCase() + brush.slice(1),
        group: "drawing",
        icon: brush,
        isActive: (tool) => tool.tool === "drawing" && tool.brush === brush,
        activate: ({ operations }) => operations.setDrawingBrush(brush),
      });
    }
    register({
      id: "eraser",
      title: "Eraser",
      group: "drawing",
      icon: "eraser",
      isActive: (tool) => tool.tool === "eraser",
      activate: ({ operations }) => operations.setTool({ tool: "eraser" }),
    });
    preset("text", "Text", "text", { kind: "text" }, "text");
    for (const sticker of stickers) {
      preset(
        `sticker:${sticker.id}`,
        sticker.label,
        "stickers",
        {
          kind: "sticker",
          fill: sticker.fill,
          color: sticker.color,
          fontFamily: sticker.fontFamily,
        },
        <span className={STICKER_SWATCH_CLASS} style={{ background: sticker.fill }} />,
      );
    }
    const routes: readonly {
      route: "straight" | "orthogonal" | "curve";
      icon: EdgelessToolIcon;
    }[] = [
      { route: "straight", icon: "connector-straight" },
      { route: "orthogonal", icon: "connector-orthogonal" },
      { route: "curve", icon: "connector-curve" },
    ];
    for (const { route, icon } of routes) {
      register({
        id: `connector:${route}`,
        title: `${route[0]!.toUpperCase() + route.slice(1)} connector`,
        group: "connectors",
        icon,
        isActive: (tool) => tool.tool === "connector" && tool.route === route,
        activate: ({ operations }) => {
          operations.setCreationDefaults("connector", { route });
          operations.setTool({ tool: "connector", route });
        },
      });
    }
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
