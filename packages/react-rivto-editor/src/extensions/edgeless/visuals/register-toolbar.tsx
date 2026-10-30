import { EdgelessTool } from "../../../managers/edgeless-tools/edgeless-tool";
import { EdgelessCreationTool } from "../../../managers/edgeless-tools/edgeless-creation-tool";
import { DrawingTool } from "./tools/drawing-tool";
import { ConnectorTool } from "./tools/connector-tool";
import { EraserTool, PanTool } from "./tools/eraser-tool";
import {
  VISUAL_TOOL_IDS,
  VISUAL_TOOL_GROUPS,
  VISUAL_ELEMENT_TYPES,
} from "../../../elements/visuals/constants";
import { validateStyle } from "../../../elements/visuals/register-elements";
import { createEdgelessDefaults } from "../../../elements/visuals/creation-defaults";
import {
  SHAPE_REMEMBERED_PROPERTIES,
  TEXT_REMEMBERED_PROPERTIES,
  STICKER_REMEMBERED_PROPERTIES,
  DRAWING_REMEMBERED_PROPERTIES,
  CONNECTOR_REMEMBERED_PROPERTIES,
  REMEMBERED_FRAME_FIELDS,
} from "../../../elements/visuals/remembered-properties";
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
  const defaults = createEdgelessDefaults();
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
      createTool: (options) =>
        new EdgelessCreationTool({
          ...options,
          type: payload.kind,
          create: () => {
            const { kind, frame, ...props } = payload;
            return {
              type: kind,
              frame: frame ? { x: 0, y: 0, width: 160, height: 120, ...frame } : undefined,
              props,
            };
          },
        }),
      getButtonProps: () => ({
        className: payload.kind === VISUAL_ELEMENT_TYPES.sticker ? STICKER_PRESET_CLASS : undefined,
      }),
    });
  };
  try {
    register({
      id: VISUAL_TOOL_IDS.select,
      title: "Select",
      icon: "select",
      order: -100,
      default: true,
      createTool: (options) => new EdgelessTool(options),
    });
    register({
      id: VISUAL_TOOL_IDS.pan,
      title: "Pan",
      icon: "pan",
      order: -90,
      createTool: (options) => new PanTool(options),
    });
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
        id: VISUAL_TOOL_GROUPS.shapes,
        title: "Shapes",
        icon: "rectangle",
        render: ShapeTools,
        defaultToolId: VISUAL_TOOL_IDS.rectangle,
        creationDefaults: { props: defaults.shape },
        rememberedProperties: {
          props: SHAPE_REMEMBERED_PROPERTIES,
          frame: REMEMBERED_FRAME_FIELDS,
          validate: validateStyle,
        },
      },
      {
        id: VISUAL_TOOL_GROUPS.drawing,
        title: "Drawing",
        icon: "draw",
        render: DrawingTools,
        defaultToolId: VISUAL_TOOL_IDS.pen,
        creationDefaults: { props: defaults.drawing },
        rememberedProperties: {
          props: DRAWING_REMEMBERED_PROPERTIES,
          frame: REMEMBERED_FRAME_FIELDS,
          validate: validateStyle,
        },
      },
      {
        id: VISUAL_TOOL_GROUPS.text,
        title: "Text",
        icon: "text",
        render: TextGroup,
        creationDefaults: { props: defaults.text },
        rememberedProperties: {
          props: TEXT_REMEMBERED_PROPERTIES,
          frame: REMEMBERED_FRAME_FIELDS,
          validate: validateStyle,
        },
      },
      {
        id: VISUAL_TOOL_GROUPS.stickers,
        title: "Stickies",
        icon: "sticker",
        render: StickerTools,
        creationDefaults: { props: defaults.sticker },
        rememberedProperties: {
          props: STICKER_REMEMBERED_PROPERTIES,
          frame: REMEMBERED_FRAME_FIELDS,
          validate: validateStyle,
        },
      },
      {
        id: VISUAL_TOOL_GROUPS.connectors,
        title: "Connectors",
        icon: "connector",
        render: ConnectorTools,
        creationDefaults: { props: defaults.connector },
        rememberedProperties: {
          props: CONNECTOR_REMEMBERED_PROPERTIES,
          frame: REMEMBERED_FRAME_FIELDS,
          validate: validateStyle,
        },
      },
    ] as const) {
      disposers.push(registry.registerGroup(group));
    }
    preset(
      VISUAL_TOOL_IDS.rectangle,
      "Rectangle",
      VISUAL_TOOL_GROUPS.shapes,
      { kind: VISUAL_ELEMENT_TYPES.rectangle },
      "rectangle",
    );
    preset(
      VISUAL_TOOL_IDS.ellipse,
      "Ellipse",
      VISUAL_TOOL_GROUPS.shapes,
      { kind: VISUAL_ELEMENT_TYPES.ellipse },
      "ellipse",
    );
    for (const brush of [
      VISUAL_TOOL_IDS.pencil,
      VISUAL_TOOL_IDS.pen,
      VISUAL_TOOL_IDS.marker,
    ] as const) {
      register({
        id: brush,
        title: brush[0]!.toUpperCase() + brush.slice(1),
        group: VISUAL_TOOL_GROUPS.drawing,
        icon: brush,
        createTool: (options) => new DrawingTool(options, brush),
      });
    }
    register({
      id: VISUAL_TOOL_IDS.eraser,
      title: "Eraser",
      group: VISUAL_TOOL_GROUPS.drawing,
      icon: "eraser",
      createTool: (options) => new EraserTool(options),
    });
    preset(
      VISUAL_TOOL_IDS.text,
      "Text",
      VISUAL_TOOL_GROUPS.text,
      { kind: VISUAL_ELEMENT_TYPES.text, text: "Text" },
      "text",
    );
    for (const sticker of stickers) {
      preset(
        `sticker:${sticker.id}`,
        sticker.label,
        VISUAL_TOOL_GROUPS.stickers,
        {
          kind: VISUAL_ELEMENT_TYPES.sticker,
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
        group: VISUAL_TOOL_GROUPS.connectors,
        icon,
        createTool: (options) => new ConnectorTool(options, route),
      });
    }
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
