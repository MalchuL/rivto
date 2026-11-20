import { Canvas } from "../../core/canvas";
import { CanvasViewport } from "../../browser/canvas-viewport";
import type {
  CanvasToolbarInputAttachment,
  CanvasTransformInput,
  CanvasViewportApi,
} from "../types";

/**
 * Checks that ordinary canvas consumers cannot access native attachment layers.
 *
 * @param controls - Attachment capabilities used by default transform controls.
 * @param toolbar - Attachment capabilities used by toolbar dismissal.
 * @returns No value; this function exists only for compile-time checks.
 */
function checkAttachmentContracts(
  controls: CanvasTransformInput,
  toolbar: CanvasToolbarInputAttachment,
): void {
  // @ts-expect-error Native viewport elements belong to the browser adapter.
  void controls.root;
  // @ts-expect-error Native world elements belong to the browser adapter.
  void toolbar.plane;
}
void checkAttachmentContracts;

it("exposes canvas and event registration through the borrowed viewport contract", () => {
  const viewport = new CanvasViewport(new Canvas());
  const api: CanvasViewportApi = viewport;
  const checkBorrowedType = () => {
    // @ts-expect-error Browser layer elements are not part of the borrowed viewport API.
    return api.layers;
  };
  void checkBorrowedType;
  expect(api.canvas).toBe(viewport.canvas);
  expect(typeof api.events.register).toBe("function");
});
