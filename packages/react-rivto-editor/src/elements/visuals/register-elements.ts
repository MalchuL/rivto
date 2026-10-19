import { VISUAL_TOOL_GROUPS, VISUAL_ELEMENT_TYPES } from "./constants";
import { RECTANGLE_REMEMBERED_PROPERTIES } from "./remembered-properties";
import type { ReactEditorApi } from "../../editor/types";
import type { ReactElementRegistration } from "../../managers/elements/types";
import {
  connectorClipboardConverter,
  textElementClipboardConverter,
} from "../clipboard-converters";
import { createEdgelessDefaults, drawingDefaults } from "./creation-defaults";
import {
  DrawingContent,
  ConnectorContent,
  TextContent,
  StickerContent,
  RectangleContent,
  EllipseContent,
} from "./visual-renderers";
import {
  ShapeProperties,
  DrawingProperties,
  ConnectorProperties,
  TextProperties,
  StickerProperties,
} from "./properties";
import { drawingResizeProps } from "./utils/drawing-frame";
import { prepareConnector } from "./prepare-connector";
import { normalizeRotation } from "./utils/geometry";

/**
 * Validates common visual styles in settings and persisted elements.
 *
 * @param props - Candidate properties; geometry is not required.
 * @returns Accepted properties without changing them.
 * @throws If text is not a string or a supplied numeric style is not finite.
 */
export function validateStyle(props: Record<string, unknown>): Record<string, unknown> {
  if (props.text !== undefined && typeof props.text !== "string") {
    throw new Error("Element text must be a string");
  }
  for (const key of ["rotation", "fontSize", "strokeWidth", "opacity"]) {
    if (
      props[key] !== undefined &&
      (typeof props[key] !== "number" || !Number.isFinite(props[key]))
    ) {
      throw new Error(`${key} must be finite`);
    }
  }
  return props;
}

/**
 * Validates rectangle styling and its nonnegative corner radius before persistence.
 *
 * @param props - Merged rectangle properties, including registered defaults.
 * @returns The supplied properties after validation; no dimensions are changed.
 * @throws If common styles are invalid or the radius is negative or nonfinite.
 */
function validateRectangle(props: Record<string, unknown>): Record<string, unknown> {
  validateStyle(props);
  if (
    typeof props.cornerRadius !== "number" ||
    !Number.isFinite(props.cornerRadius) ||
    props.cornerRadius < 0
  ) {
    throw new Error("Corner radius must be a finite nonnegative number");
  }
  return props;
}

/** Checks freehand geometry at the definition boundary, including imported drawings. */
function validateDrawing(props: Record<string, unknown>): Record<string, unknown> {
  validateStyle(props);
  if (
    !Array.isArray(props.points) ||
    props.points.length < 2 ||
    props.points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) {
    throw new Error("Drawing requires at least two finite points");
  }
  return props;
}

/** Checks both endpoint records before creating or editing a connector. */
function validateConnector(props: Record<string, unknown>): Record<string, unknown> {
  validateStyle(props);
  for (const key of ["source", "target"]) {
    const endpoint = props[key] as
      { anchor?: { x: number; y: number }; position?: { x: number; y: number } } | undefined;
    if (
      !endpoint?.anchor ||
      !endpoint.position ||
      ![endpoint.anchor.x, endpoint.anchor.y, endpoint.position.x, endpoint.position.y].every(
        Number.isFinite,
      )
    ) {
      throw new Error("Connector endpoint requires finite coordinates");
    }
  }
  return props;
}

/**
 * Selects a registered settings group and normalizes rotation for interactive creation.
 * Each group declares its own remembered fields; custom types can additionally use
 * rememberedProperties. Drawing additionally registers a separate brush-default policy.
 *
 * @param group - Registered toolbar group providing initial and remembered creation settings.
 * @returns Group membership and geometry preparation; custom registrations need neither.
 */
function styleDefaults(group: string): NonNullable<ReactElementRegistration["behavior"]> {
  return {
    create: (input) => ({
      ...input,
      props: { ...input.props, rotation: normalizeRotation(Number(input.props?.rotation ?? 0)) },
    }),
    defaultsGroup: group,
  };
}

/**
 * Registers built-in rectangle, ellipse, text, sticker, drawing and connector element types.
 *
 * Installs persisted definitions, renderers, property editors, interaction behavior and
 * clipboard converters through elementTypes. Toolbar groups and presets are installed
 * separately by registerVisualToolbar; this function supplies no creation tools.
 * @param editor - React editor whose registries receive these shared definitions.
 * @returns Idempotent cleanup removing this installation in reverse order without deleting content.
 * @throws If a type or converter conflicts, the owner is inactive, or installation fails;
 * completed registrations are rolled back before the error propagates.
 */
export function registerVisualElements(editor: ReactEditorApi): () => void {
  const defaults = createEdgelessDefaults();
  const shapes = styleDefaults(VISUAL_TOOL_GROUPS.shapes);
  const text = styleDefaults(VISUAL_TOOL_GROUPS.text);
  const sticky = styleDefaults(VISUAL_TOOL_GROUPS.stickers);
  const drawing = styleDefaults(VISUAL_TOOL_GROUPS.drawing);
  const connector = styleDefaults(VISUAL_TOOL_GROUPS.connectors);
  const registrations: readonly ReactElementRegistration[] = [
    {
      definition: {
        type: VISUAL_ELEMENT_TYPES.rectangle,
        defaults: { ...defaults.shape, cornerRadius: 3 },
        validate: validateRectangle,
      },
      title: "Shape",
      render: RectangleContent,
      rememberedProperties: { props: RECTANGLE_REMEMBERED_PROPERTIES, validate: validateRectangle },
      properties: ShapeProperties,
      behavior: { ...shapes, editableLabel: true },
    },
    {
      definition: {
        type: VISUAL_ELEMENT_TYPES.ellipse,
        defaults: defaults.shape,
        validate: validateStyle,
      },
      title: "Shape",
      render: EllipseContent,
      properties: ShapeProperties,
      behavior: { ...shapes, editableLabel: true },
    },
    {
      definition: {
        type: VISUAL_ELEMENT_TYPES.text,
        defaults: { ...defaults.text, text: "" },
        validate: validateStyle,
      },
      title: "Text",
      render: TextContent,
      properties: TextProperties,
      behavior: {
        ...text,
        editableLabel: true,
        create: (input, panel) =>
          text.create!(
            { ...input, props: { ...input.props, text: input.props?.text ?? "Text" } },
            panel,
          ),
      },
    },
    {
      definition: {
        type: VISUAL_ELEMENT_TYPES.sticker,
        defaults: { ...defaults.sticker, text: "" },
        validate: validateStyle,
      },
      title: "Sticky",
      render: StickerContent,
      properties: StickerProperties,
      behavior: {
        ...sticky,
        editableLabel: true,
        create: (input, panel) =>
          sticky.create!(
            { ...input, props: { ...input.props, text: input.props?.text ?? "Sticky note" } },
            panel,
          ),
      },
    },
    {
      definition: {
        type: VISUAL_ELEMENT_TYPES.drawing,
        defaults: defaults.drawing,
        validate: validateDrawing,
      },
      title: "Drawing",
      render: DrawingContent,
      properties: DrawingProperties,
      behavior: {
        ...drawing,
        resize: drawingResizeProps,
        /**
         * Combines remembered drawing settings with the defaults for an explicitly changed brush.
         *
         * @param settings - Remembered drawing settings for creation.
         * @param input - Creation or update fields for this operation.
         * @returns Detached creation settings for the requested brush.
         */
        creationDefaults(settings, input) {
          const brush = input.props?.brush;
          if (
            (brush === "pencil" || brush === "pen" || brush === "marker") &&
            brush !== settings.brush
          ) {
            return { ...settings, ...drawingDefaults[brush], brush };
          }
          return { ...settings };
        },
      },
    },
    {
      definition: {
        type: VISUAL_ELEMENT_TYPES.connector,
        defaults: defaults.connector,
        validate: validateConnector,
      },
      title: "Connector",
      render: ConnectorContent,
      properties: ConnectorProperties,
      behavior: {
        ...connector,
        editableLabel: true,
        absoluteGeometry: true,
        create: prepareConnector,
        relatedElements: (element) => {
          const source = element.props.source as { elementId?: string };
          const target = element.props.target as { elementId?: string };
          if (!source.elementId || !target.elementId) {
            return [];
          }
          return [source.elementId, target.elementId];
        },
      },
      clipboard: { ...textElementClipboardConverter("connector"), ...connectorClipboardConverter },
    },
  ];
  const disposers: Array<() => void> = [];
  try {
    for (const registration of registrations) {
      disposers.push(
        editor.elementTypes.register({
          ...registration,
          clipboard:
            registration.clipboard ?? textElementClipboardConverter(registration.definition.type),
        }),
      );
    }
  } catch (error) {
    disposers.reverse().forEach((dispose) => dispose());
    throw error;
  }
  return () => {
    disposers
      .splice(0)
      .reverse()
      .forEach((dispose) => dispose());
  };
}
