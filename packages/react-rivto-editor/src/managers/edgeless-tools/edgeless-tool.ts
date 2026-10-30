import { ReactCanvasTool } from "@chulane/rivto-edgeless/react";
import type { CanvasToolOptions, CanvasToolPointer } from "@chulane/rivto-edgeless";
import type { ReactPanelApi } from "../../panels/types";
import type { EdgelessOperations } from "../elements/edgeless-operations";
import type { EdgelessCreationDefaults } from "../elements/edgeless-creation-defaults";
import type { EdgelessToolGroup } from "./edgeless-tool-group";

export type EdgelessToolPointer = CanvasToolPointer;

/** Document dependencies bound by Rivto when the shared canvas instantiates a tool. */
export interface EdgelessToolOptions extends CanvasToolOptions {
  readonly operations: EdgelessOperations;
  readonly defaults: EdgelessCreationDefaults;
  readonly reactPanel: ReactPanelApi;
  readonly group?: EdgelessToolGroup;
}

/** Rivto specialization of the canvas tool lifecycle with typed document dependencies. */
export class EdgelessTool extends ReactCanvasTool<EdgelessToolOptions> {}
