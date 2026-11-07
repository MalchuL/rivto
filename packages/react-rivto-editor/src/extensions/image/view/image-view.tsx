/**
 * Shared resolved image presentation with accessible metadata and resize controls.
 *
 * Logical URIs are resolved through the image extension provider. Blob results are
 * represented by component-owned object URLs and revoked on replacement or
 * unmount. Pointer previews stay local; callers persist only completed sizes.
 * Inline, block, and edgeless records select behavior through one per-kind
 * customization contract instead of separate presentation components.
 *
 * @module
 */
import { RotateCcwIcon } from "lucide-react";
import { useSyncExternalStore, type ComponentType, type CSSProperties } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useReactPanel } from "../../../hooks";
import type { ReactEditorApi } from "../../../editor/types";
import type { BinaryProvider } from "../../../attachments";
import { useImageSource } from "./hooks/use-image-source";
import { useImageResize } from "./hooks/use-image-resize";
import { useImageCopyMenu } from "./hooks/use-image-copy-menu";

const IMAGE_FRAME_CLASS = "rivto-image-frame";
const IMAGE_CLASS = "rivto-image";
const IMAGE_CONTROLS_CLASS = "rivto-image-controls";
const IMAGE_RESIZE_CLASS = "rivto-image-resize";
const IMAGE_ERROR_CLASS = "rivto-image-error";

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
interface ImageViewConfiguration {
  /** Presentation overrides indexed by image context. */
  readonly customizations: ImageViewCustomizations;
  /** Provider used to resolve the image content. */
  readonly provider: BinaryProvider;
}

const IMAGE_VIEW_CONFIGURATION_KEY = "rivto.image.view-configuration";

/**
 * Installs per-kind image presentation options and a storage provider for one editor.
 *
 * @param editor - React editor whose image views receive the options.
 * @param customizations - Presentation overrides indexed by persisted context.
 * @param provider - Storage provider used by image views.
 * @returns A disposer that removes only this registration.
 */
export function configureImageViews(
  editor: ReactEditorApi,
  customizations: ImageViewCustomizations,
  provider: BinaryProvider,
): () => void {
  const configuration = { customizations, provider };
  const space = editor.extensions.shared;
  const release = space.reserve(IMAGE_VIEW_CONFIGURATION_KEY, "value");
  const shared = space.getValue<ImageViewConfiguration>(IMAGE_VIEW_CONFIGURATION_KEY)!;
  shared.set(configuration);
  // An older disposer must not remove a newer configuration for the same editor.
  return () => {
    try {
      if (
        space.getValue<ImageViewConfiguration>(IMAGE_VIEW_CONFIGURATION_KEY)?.get() ===
        configuration
      ) {
        shared.set(undefined);
      }
    } finally {
      release();
    }
  };
}

/**
 * Returns the configured fit/resize mode used by image frame interactions.
 *
 * @param editor - React editor owning the image configuration.
 * @param kind - Image persistence context whose resize mode is required.
 * @returns The registered mode or the default for the image context.
 */
export function imageResizeMode(editor: ReactEditorApi, kind: ImageViewKind): ImageResizeMode {
  return (
    editor.extensions.shared.getValue<ImageViewConfiguration>(IMAGE_VIEW_CONFIGURATION_KEY)?.get()
      ?.customizations[kind]?.resizeMode ?? (kind === "element" ? "stretch" : "letterbox")
  );
}

/**
 * Renders the default accessible alt editor and intrinsic-size reset action.
 *
 * @param props - Current image metadata and mutation callbacks.
 * @returns Hover-menu controls shared by every image context.
 */
export function DefaultImageHoverMenu({ alt, onAltChange, onReset }: ImageHoverMenuProps) {
  return (
    <>
      <Input
        className="h-8"
        aria-label="Image alternative text"
        placeholder="Alternative text"
        value={alt}
        onChange={(event) => onAltChange(event.currentTarget.value)}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label="Reset size"
        title="Reset size"
        onClick={onReset}
      >
        <RotateCcwIcon aria-hidden="true" />
      </Button>
    </>
  );
}

/** A completed edit to image text or dimensions. */
export interface ImageViewChange {
  /** Replacement alternative text, when edited. */
  readonly alt?: string;
  /** Committed display width in pixels, when resized. */
  readonly width?: number;
  /** Committed display height in pixels, when resized. */
  readonly height?: number;
  /** Requests restoration of the original dimensions. */
  readonly reset?: true;
}

/** Values accepted by the shared image view. */
export interface ImageViewProps {
  /** Document context in which the image appears. */
  readonly kind: ImageViewKind;
  /** Persisted URI or provider reference. */
  readonly uri: string;
  /** Alternative text displayed and exposed to assistive technology. */
  readonly alt: string;
  /** Optional filename used for copying. */
  readonly name?: string;
  /** Optional media type used for copying. */
  readonly mimeType?: string;
  /** Display width in pixels, when specified. */
  readonly width?: number;
  /** Display height in pixels, when specified. */
  readonly height?: number;
  /** Per-instance presentation overrides. */
  readonly customization?: ImageViewCustomization;
  /**
   * Reports an alternative-text edit, completed resize, or size reset.
   *
   * @param patch - Changed text or dimensions, or a request to reset size.
   * @returns Requests persistence of the completed edit.
   */
  readonly onChange?: (patch: ImageViewChange) => void;
  /**
   * Reports the intrinsic size after the browser loads the image.
   *
   * @param width - Natural image width in pixels.
   * @param height - Natural image height in pixels.
   * @returns Reports the loaded dimensions to the owning view.
   */
  readonly onIntrinsicSize?: (width: number, height: number) => void;
}

/**
 * Renders one logical image URI with customizable controls and resizing.
 *
 * @param props - Logical metadata, context, customization, and persistence callbacks.
 * @param props.kind - Persisted context of the image.
 * @param props.uri - Logical URI resolved using the installed image provider.
 * @param props.alt - Alternative text shown for the image.
 * @param props.name - Optional filename used for clipboard copying.
 * @param props.mimeType - Optional persisted type used for clipboard copying.
 * @param props.width - Persisted width in pixels, when provided.
 * @param props.height - Persisted height in pixels, when provided.
 * @param props.customization - Optional per-view overrides for configured controls.
 * @param props.onChange - Persists alt-text edits, completed resizing, and resets.
 * @param props.onIntrinsicSize - Receives natural dimensions when the image loads.
 * @returns The shared inline, block, or element image frame.
 */
export function ImageView(props: ImageViewProps) {
  const view = useImageView(props);
  return (
    <span
      ref={view.resize.frameRef}
      className={IMAGE_FRAME_CLASS}
      data-fill={view.fill || undefined}
      data-image-kind={props.kind}
      data-resize-mode={view.resizeMode}
      style={view.style}
      tabIndex={0}
      onContextMenu={view.copy.openCopyMenu}
    >
      <ImageContent
        source={view.image.source}
        error={view.image.error}
        showLoading={view.image.showLoading}
        alt={props.alt}
        onIntrinsicSize={props.onIntrinsicSize}
        onError={view.image.setError}
      />
      {props.onChange && (
        <ImageControls
          kind={props.kind}
          uri={props.uri}
          alt={props.alt}
          width={props.width}
          height={props.height}
          HoverMenu={view.HoverMenu}
          dragResize={view.dragResize}
          resize={view.resize}
          onChange={props.onChange}
        />
      )}
      {view.copy.menu}
    </span>
  );
}

/** Image data and callbacks used while resolving a view's presentation state. */
type ImageViewStateProps = Pick<
  ImageViewProps,
  "kind" | "uri" | "alt" | "name" | "mimeType" | "width" | "height" | "customization" | "onChange"
>;

/**
 * Resolves configuration, image source, resize state, and copy actions for one view.
 *
 * Provider and customization changes are observed through the extension lifecycle;
 * image resolution and pointer previews retain their own cleanup and commit rules.
 *
 * @param props - Persisted image data, optional overrides, and completed-edit callback.
 * @param props.kind - Persisted image context.
 * @param props.uri - Logical URI resolved through the image provider.
 * @param props.alt - Alternative text and fallback clipboard name.
 * @param props.name - Optional clipboard filename.
 * @param props.mimeType - Optional MIME hint for clipboard copying.
 * @param props.width - Persisted width in pixels, when supplied.
 * @param props.height - Persisted height in pixels, when supplied.
 * @param props.customization - Optional per-view presentation overrides.
 * @param props.onChange - Persists a completed resize.
 * @returns State and actions consumed by the image frame and its controls.
 */
function useImageView({
  kind,
  uri,
  alt,
  name,
  mimeType,
  width,
  height,
  customization,
  onChange,
}: ImageViewStateProps) {
  const reactPanel = useReactPanel();
  const reactEditor = reactPanel.editor;
  const shared = reactEditor.extensions.shared;
  // Refresh provider and presentation when extension registrations change.
  const configuration = useSyncExternalStore(
    (listener) => shared.subscribe(IMAGE_VIEW_CONFIGURATION_KEY, listener),
    () => shared.getValue<ImageViewConfiguration>(IMAGE_VIEW_CONFIGURATION_KEY)?.get(),
    () => shared.getValue<ImageViewConfiguration>(IMAGE_VIEW_CONFIGURATION_KEY)?.get(),
  );
  const provider = configuration?.provider;
  const registered = configuration?.customizations[kind];
  const resizeMode = customization?.resizeMode ?? imageResizeMode(reactEditor, kind);
  const dragResize = customization?.dragResize ?? registered?.dragResize ?? kind !== "element";
  const configuredHoverMenu =
    customization && Object.hasOwn(customization, "HoverMenu")
      ? customization.HoverMenu
      : registered?.HoverMenu;
  const HoverMenu =
    configuredHoverMenu === null ? null : (configuredHoverMenu ?? DefaultImageHoverMenu);
  const fill = kind === "element";
  const resize = useImageResize(resizeMode, onChange);
  const image = useImageSource(reactEditor.attachments, provider, uri);
  const copy = useImageCopyMenu({ provider, uri, alt, name, mimeType });

  const style: CSSProperties = fill
    ? { width: "100%", height: "100%" }
    : { width: resize.preview?.width ?? width, height: resize.preview?.height ?? height };
  return {
    resizeMode,
    dragResize,
    HoverMenu,
    fill,
    resize,
    image,
    copy,
    style,
  };
}

/** Loaded image and feedback owned by the shared image frame. */
interface ImageContentProps {
  /** Browser-readable image source, when resolved. */
  readonly source?: string;
  /** Resolution or decoding error text, when present. */
  readonly error?: string;
  /** Whether to display delayed loading feedback. */
  readonly showLoading: boolean;
  /** Alternative text for the rendered image. */
  readonly alt: string;
  /**
   * Reports the loaded image's intrinsic dimensions when a callback is supplied.
   *
   * @param width - Natural image width in pixels.
   * @param height - Natural image height in pixels.
   * @returns Notifies the owning view after the image loads.
   */
  readonly onIntrinsicSize?: ImageViewProps["onIntrinsicSize"];
  /**
   * Reports a browser image decoding failure.
   *
   * @param message - Description shown in the image frame.
   * @returns Displays the supplied error.
   */
  readonly onError: (message: string) => void;
}

/**
 * Displays the resolved image or its loading and decode feedback.
 *
 * @param props - Resolved source, alternative text, loading state, and callbacks.
 * @param props.source - Browser-displayable image URL, when resolved.
 * @param props.error - Current resolution or decode error, if any.
 * @param props.showLoading - Whether pending resolution should be announced.
 * @param props.alt - Alternative text for the rendered image.
 * @param props.onIntrinsicSize - Receives natural dimensions after an image load.
 * @param props.onError - Receives a browser decode error for display.
 * @returns The image or accessible status feedback.
 */
function ImageContent({
  source,
  error,
  showLoading,
  alt,
  onIntrinsicSize,
  onError,
}: ImageContentProps) {
  return (
    <>
      {source && !error && (
        <img
          className={IMAGE_CLASS}
          src={source}
          alt={alt}
          draggable={false}
          onLoad={(event) =>
            onIntrinsicSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
          }
          onError={() => onError("Unable to decode image")}
        />
      )}
      {(!source || error) && (error || showLoading) && (
        <span className={IMAGE_ERROR_CLASS} role={error ? "alert" : "status"}>
          {error ?? "Loading image…"}
        </span>
      )}
    </>
  );
}

/** Editable image metadata and pointer controls for one frame. */
interface ImageControlsProps extends Pick<
  ImageViewProps,
  "kind" | "uri" | "alt" | "width" | "height"
> {
  /** Menu component, or null when the menu is disabled. */
  readonly HoverMenu: ComponentType<ImageHoverMenuProps> | null;
  /** Whether the resize handle is available. */
  readonly dragResize: boolean;
  /** Pointer callbacks for the current resize gesture. */
  readonly resize: Pick<
    ReturnType<typeof useImageResize>,
    "startResize" | "moveResize" | "finishResize"
  >;
  /** Callback that persists completed image edits. */
  readonly onChange: NonNullable<ImageViewProps["onChange"]>;
}

/**
 * Displays the configured hover menu and optional image resize handle.
 *
 * @param props - Image metadata, configured controls, gesture state, and edit callback.
 * @param props.kind - Persisted context of the image.
 * @param props.uri - Logical image URI supplied to the hover menu.
 * @param props.alt - Current alternative text.
 * @param props.width - Persisted width, when provided.
 * @param props.height - Persisted height, when provided.
 * @param props.HoverMenu - Configured menu component, or null to hide it.
 * @param props.dragResize - Whether the resize handle is available.
 * @param props.resize - Pointer operations for the current image frame.
 * @param props.onChange - Persists alt text, completed sizes, and resets.
 * @returns The enabled image editing controls.
 */
function ImageControls({
  kind,
  uri,
  alt,
  width,
  height,
  HoverMenu,
  dragResize,
  resize,
  onChange,
}: ImageControlsProps) {
  return (
    <>
      {HoverMenu && (
        <span className={IMAGE_CONTROLS_CLASS}>
          <HoverMenu
            kind={kind}
            uri={uri}
            alt={alt}
            width={width}
            height={height}
            onAltChange={(next) => onChange({ alt: next })}
            onReset={() => onChange({ reset: true })}
          />
        </span>
      )}
      {dragResize && (
        <button
          type="button"
          className={IMAGE_RESIZE_CLASS}
          aria-label="Resize image; press Enter to reset"
          onPointerDown={resize.startResize}
          onPointerMove={resize.moveResize}
          onPointerUp={resize.finishResize}
          onPointerCancel={resize.finishResize}
          onDoubleClick={() => onChange({ reset: true })}
          onKeyDown={(event) => {
            // Keyboard users can restore the original size from the resize control.
            if (event.key === "Enter") {
              onChange({ reset: true });
            }
          }}
        />
      )}
    </>
  );
}
