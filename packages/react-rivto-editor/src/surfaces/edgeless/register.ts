import type { ReactEditorApi } from "../../editor/types";
/**
 * Runtime registration for the built-in edgeless surface.
 *
 * The registration applies editor-local card placement options and connects
 * the explicit edgeless surface to shared snapping and placement defaults. Canvas
 * interaction behavior remains in the optional edgeless extensions.
 *
 * @module
 */
import type { SurfacesApi } from "../../managers/surfaces/api";
import { EDGELESS_CARD_DEFAULT_FRAME } from "../../elements/block-element-projection";
import type { EdgelessSurfaceOptions } from "./types";
import { EdgelessSurface } from "./edgeless-surface";

/** Registration and card defaults borrowed while installing the host surface. */
export interface EdgelessSurfaceHost {
  readonly surfaces: Pick<SurfacesApi, "register">;
  readonly blockElements: Pick<
    ReactEditorApi["blockElements"],
    "setOverlapAvoidance" | "setDefaultWidth"
  >;
}

/** Owns one host surface registration and its occurrence-shared configuration. */
export class EdgelessSurfaceRegistration {
  private static readonly options = new WeakMap<object, EdgelessSurfaceOptions>();
  private readonly unregister: () => void;
  private readonly previous: EdgelessSurfaceOptions | undefined;
  private released = false;

  /**
   * Registers the configured positioned-card surface.
   *
   * @param host - Runtime receiving the edgeless surface.
   * @param options - Snapping, overlap, and card-width configuration.
   * @throws If a surface already owns the edgeless mode or registration ownership is inactive.
   */
  constructor(
    private readonly host: EdgelessSurfaceHost,
    options: EdgelessSurfaceOptions,
  ) {
    this.previous = EdgelessSurfaceRegistration.options.get(host.surfaces);
    this.unregister = host.surfaces.register("edgeless", EdgelessSurface);
    try {
      EdgelessSurfaceRegistration.options.set(host.surfaces, options);
      host.blockElements.setOverlapAvoidance(options.avoidBlockElementOverlap !== false);
      host.blockElements.setDefaultWidth(
        options.blockElementWidth ?? EDGELESS_CARD_DEFAULT_FRAME.width,
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  /**
   * Releases this registration once without affecting a later installation.
   *
   * @returns The registered component is removed and prior surface defaults are restored.
   */
  readonly dispose = (): void => {
    if (this.released) {
      return;
    }
    this.released = true;
    this.unregister();
    if (this.previous) {
      EdgelessSurfaceRegistration.options.set(this.host.surfaces, this.previous);
    } else {
      EdgelessSurfaceRegistration.options.delete(this.host.surfaces);
    }
  };

  /**
   * Reads canvas defaults associated with a host surface registry's identity.
   *
   * @param surfaces - Borrowed registry object shared by host panels; no methods are invoked.
   * @returns Configured canvas defaults, or empty options when no registration supplied them.
   */
  static getOptions(surfaces: object): EdgelessSurfaceOptions {
    return this.options.get(surfaces) ?? {};
  }
}
