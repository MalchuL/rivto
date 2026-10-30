import type { CanvasElement } from "../types/canvas";
import type { CanvasApi } from "./canvas";

/** Projects application-owned data into a scene without imposing document storage or schema. */
export abstract class CanvasSource {
  /**
   * Reads initial geometry without subscribing or mutating application content.
   *
   * The editor uses this projection during construction, including server rendering.
   * Implementations return all elements, not only the currently mounted subset.
   *
   * @returns Read-only source geometry with stable application IDs.
   * @throws If the application source cannot provide its current projection.
   */
  abstract getElements(): readonly CanvasElement[];

  /**
   * Loads current geometry and observes external changes for one connected surface.
   *
   * Implementations synchronously initialize the projection, then subscribe to their
   * source. If setup throws, they must release any resources already acquired.
   * Source commits and history remain application-owned through CanvasOptions.
   *
   * @param canvas - Receiving scene; projection writes must use its validated methods.
   * @returns Cleanup releasing source subscriptions and source-owned pins.
   * @throws If projection initialization or source subscription fails.
   */
  abstract connect(canvas: CanvasApi): () => void;
}
