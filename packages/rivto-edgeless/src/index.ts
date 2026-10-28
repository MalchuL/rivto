export { Canvas } from "./core/canvas";
export type { CanvasApi } from "./core/canvas";
export { elementBounds, intersects } from "./utils/geometry";
export type {
  Camera,
  CanvasElement,
  CanvasOptions,
  CanvasTransform,
  Point,
  Rect,
  TransformChange,
  TransformKind,
} from "./types/canvas";
export type { CanvasSnapshot } from "./utils/store";
export { CanvasTool } from "./core/tools/canvas-tool";
export type {
  CanvasToolOptions,
  CanvasToolPointer,
  CanvasToolSnapping,
  CanvasToolGroupReference,
} from "./core/tools/canvas-tool";
export { CanvasToolGroup } from "./core/tools/canvas-tool-group";
export type { CanvasToolSettings } from "./core/tools/canvas-tool-group";
export { CanvasToolRegistry } from "./core/tools/canvas-tool-registry";
export type { CanvasToolbarEntry } from "./core/tools/canvas-tool-registry";
export type {
  CanvasToolEntry,
  CanvasToolGroupEntry,
  CanvasToolRegistration,
  CanvasRegistrationOwner,
} from "./types/tool-registry";
export { CanvasToolContext } from "./core/tools/canvas-tool-context";
export type { CanvasToolContextOptions } from "./core/tools/canvas-tool-context";
export type { CanvasToolSession } from "./types/tool-session";
export { CanvasPanTool } from "./core/tools/canvas-pan-tool";
export { RevisionStore } from "./utils/revision-store";

export { CanvasEditor } from "./core/canvas-editor";
export type { CanvasEditorOptions } from "./core/canvas-editor";
export { CanvasSource } from "./core/canvas-source";

export { EdgelessSnappingStore } from "./snapping/snapping-store";
export type { EdgelessSnappingSnapshot } from "./snapping/types";
