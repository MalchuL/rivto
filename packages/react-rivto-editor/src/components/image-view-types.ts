import type { ComponentType } from "react";
import type { BinaryProvider } from "../attachments";

/** Persisted presentation context using the shared image component. */
export type ImageViewKind = "inline" | "block" | "element";

/** Image behavior while its frame changes size. */
export type ImageResizeMode = "letterbox" | "stretch";

/** State and actions supplied to a custom hover-menu component. */
export interface ImageHoverMenuProps {
  /** Document context in which the image appears. */
  readonly kind: ImageViewKind;
  /** Persisted URI or provider reference. */
  readonly uri: string;
  /** Current alternative text. */
  readonly alt: string;
  /** Persisted display width in pixels, when specified. */
  readonly width?: number;
  /** Persisted display height in pixels, when specified. */
  readonly height?: number;
  /**
   * Applies edited alternative text to the image.
   *
   * @param alt - New alternative text from the menu.
   * @returns Requests the text change from the owning view.
   */
  readonly onAltChange: (alt: string) => void;
  /**
   * Requests restoration of the image's original size.
   *
   * @returns Requests a size reset from the owning view.
   */
  readonly onReset: () => void;
}

/** Per-kind overrides for the shared image component. */
export interface ImageViewCustomization {
  /** Fit and resize behavior for this image context. */
  readonly resizeMode?: ImageResizeMode;
  /** Whether the view exposes a drag-resize control. */
  readonly dragResize?: boolean;
  /** Custom menu component, or null to suppress the menu. */
  readonly HoverMenu?: ComponentType<ImageHoverMenuProps> | null;
}

/** Static image-view overrides registered for one editor runtime. */
export type ImageViewCustomizations = Partial<Record<ImageViewKind, ImageViewCustomization>>;

/** Image presentation options and provider registered for one editor. */
export interface ImageViewConfiguration {
  /** Presentation overrides indexed by image context. */
  readonly customizations: ImageViewCustomizations;
  /** Provider used to resolve the image content. */
  readonly provider: BinaryProvider;
}
