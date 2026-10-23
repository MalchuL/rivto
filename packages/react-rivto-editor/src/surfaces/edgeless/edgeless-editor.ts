import { CanvasEditor } from "@chulane/rivto-edgeless";
import type { ReactPanelApi } from "../../panels/types";
import { EdgelessToolContext } from "../../managers/edgeless-tools/edgeless-tool-context";
import { getEdgelessRuntime } from "../../extensions/built-ins/selection/edgeless-runtime";
import { EdgelessCanvasAdapter } from "./canvas-adapter";

/** Composes one Rivto occurrence's scene, document projection, tools and creation settings. */
export class EdgelessEditor extends CanvasEditor<EdgelessToolContext> {
  /**
   * Binds application dependencies without installing document or DOM subscriptions.
   *
   * @param panel - Fixed receiving occurrence; each surface creates its own editor.
   */
  constructor(panel: ReactPanelApi) {
    super({
      source: new EdgelessCanvasAdapter(panel),
      tools: new EdgelessToolContext(panel),
      canvas: {
        minZoom: 0.5,
        maxZoom: 2,
        /**
         * Applies object selection to the receiving panel's selection runtime.
         *
         * @param ids - Unique projected element identities selected by the scene.
         * @returns Panel selection and its observers reflect the request.
         */
        onSelectionChange: (ids) => getEdgelessRuntime(panel).set(ids),
      },
    });
  }
}
