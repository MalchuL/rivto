import type { BlockEditorApi, PageViewInputRoot } from "../../../editor/types";
import type { BlockEditorController } from "../../../editor/block-editor-controller";
import type { BlockLayoutRegions } from "../block-layout/block-layout-regions";
import type { BlockDropTargetsApi } from "../../../editor/drag-and-drop/types";
import type { BlockVirtualizationRegistry } from "../../../editor/virtualization/block-virtualization-registry";
import type { ReactNode } from "react";
import type { BlockDropBoundaryMode } from "../../../editor/drag-and-drop/types";
import type { BlockVirtualizationOptions } from "../../../editor/virtualization/types";
import type { BlockPresentationAttributes } from "../../types";

/** Inputs of the autonomous block forest, without access to a host editor. */
export interface BlockEditorProps extends BlockPresentationAttributes {
  /** Host-owned instance; views attach/detach without destroying its registrations or nodes. */
  readonly editor: BlockEditorViewApi;
  /** Additional root classes; import package CSS for geometry defaults and override them through theme parameters. */
  readonly className?: string;
  /** Shared sibling feedback, default merged; separate retains nearest-edge feedback. */
  readonly dropBoundaries?: BlockDropBoundaryMode;
  /** Opt-in window scrolling of display subtrees; omitted renders the full tree. */
  readonly virtualization?: BlockVirtualizationOptions;
  /** Actual receiving parent for an empty view; null denotes document roots, undefined disables it. */
  readonly emptyDropParentId?: string | null;
}

/** Host-owned editor and occurrence shared by one rendered block forest. */
export interface BlockEditorScopeProps {
  readonly editor: BlockEditorScopeApi;
  /** Current borrowed Root, or undefined before attachment and after detach. */
  readonly inputRoot: BlockEditorScopeApi["inputRoot"];
  readonly children?: ReactNode;
}

/** Root captured for a particular view owner. */
export interface BlockEditorRootState {
  readonly editor: BlockEditorViewApi;
  readonly inputRoot: BlockEditorViewApi["inputRoot"];
}

/** Internal rendering operations borrowed by Page's layout primitives. */
export interface BlockEditorRenderingApi extends BlockEditorApi {
  /** Mounted primitive ownership; refs release their own registrations. */
  readonly regions: Pick<
    BlockLayoutRegions,
    "register" | "getIdentities" | "getRegionIdentity" | "getRegistration"
  >;
  /** Internal layout registration and destination resolution. */
  readonly dropTargets: BlockDropTargetsApi;
  /** Mounted windowing views register and release their own capabilities. */
  readonly virtualization: Pick<BlockVirtualizationRegistry, "register">;
}

/** Rendering scope borrows the current occurrence without owning attachment. */
export interface BlockEditorScopeApi extends BlockEditorRenderingApi {
  /** Identifies the currently retained occurrence without exposing its browser element. */
  readonly inputRoot: PageViewInputRoot | undefined;
}

/** View capabilities include occurrence attachment, but not controller destruction. */
export interface BlockEditorViewApi
  extends BlockEditorScopeApi, Pick<BlockEditorController, "attach"> {}
