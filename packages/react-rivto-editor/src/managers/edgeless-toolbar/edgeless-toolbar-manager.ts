import { CanvasToolRegistry } from "@chulane/rivto-edgeless";
import type { EdgelessToolbarGroup, EdgelessToolbarTool } from "./types";

/** Extension-owned canvas registry specialized for Rivto's typed factories and group renderers. */
export class EdgelessToolbarManager extends CanvasToolRegistry<
  EdgelessToolbarTool,
  EdgelessToolbarGroup
> {}
