/**
 * Shared resolved image presentation with accessible metadata and resize controls.
 *
 * Logical URIs are resolved through the editor file pipeline. Blob results are
 * represented by component-owned object URLs and revoked on replacement or
 * unmount. Pointer previews stay local; callers persist only completed sizes.
 * Inline, block, and edgeless records select behavior through one per-kind
 * customization contract instead of separate presentation components.
 *
 * @module
 */
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useReactEditor } from "../../hooks";
import type { ReactEditor } from "../../types";

const IMAGE_FRAME_CLASS = "rivto-image-frame";
const IMAGE_CLASS = "rivto-image";
const IMAGE_CONTROLS_CLASS = "rivto-image-controls";
const IMAGE_RESIZE_CLASS = "rivto-image-resize";
const IMAGE_ERROR_CLASS = "rivto-image-error";
const IMAGE_CONTEXT_MENU_CLASS = "rivto-image-context-menu";

/** Persisted presentation context using the shared image component. */
export type ImageViewKind = "inline" | "block" | "element";

/** Image behavior while its frame changes size. */
export type ImageResizeMode = "letterbox" | "stretch";

/** State and actions supplied to a custom hover-menu component. */
export interface ImageHoverMenuProps {
  readonly kind: ImageViewKind;
  readonly uri: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly onAltChange: (alt: string) => void;
  readonly onReset: () => void;
}

/** Per-kind overrides for the shared image component. */
export interface ImageViewCustomization {
  readonly resizeMode?: ImageResizeMode;
  readonly dragResize?: boolean;
  readonly HoverMenu?: ComponentType<ImageHoverMenuProps> | null;
}

/** Static image-view overrides registered for one editor runtime. */
export type ImageViewCustomizations = Partial<Record<ImageViewKind, ImageViewCustomization>>;

const CUSTOMIZATIONS = new WeakMap<ReactEditor, ImageViewCustomizations>();

/**
 * Installs immutable per-kind image presentation options for one editor.
 *
 * @param editor - React editor whose image views receive the options.
 * @param customizations - Presentation overrides indexed by persisted context.
 * @returns A disposer that removes only this registration.
 */
export function configureImageViews(editor: ReactEditor, customizations: ImageViewCustomizations): () => void {
  CUSTOMIZATIONS.set(editor, customizations);
  return () => {
    if (CUSTOMIZATIONS.get(editor) === customizations) CUSTOMIZATIONS.delete(editor);
  };
}

/**
 * Returns the configured fit/resize mode used by image frame interactions.
 *
 * @param editor - React editor owning the image configuration.
 * @param kind - Image persistence context whose resize mode is required.
 * @returns The registered mode or the aspect-preserving default.
 */
export function imageResizeMode(editor: ReactEditor, kind: ImageViewKind): ImageResizeMode {
  return CUSTOMIZATIONS.get(editor)?.[kind]?.resizeMode ?? "letterbox";
}

/**
 * Renders the default accessible alt editor and intrinsic-size reset action.
 *
 * @param props - Current image metadata and mutation callbacks.
 * @returns Hover-menu controls shared by every image context.
 */
export function DefaultImageHoverMenu({ alt, onAltChange, onReset }: ImageHoverMenuProps) {
  return <>
    <label>Alt <input aria-label="Image alternative text" value={alt} onChange={(event) => onAltChange(event.currentTarget.value)} /></label>
    <button type="button" onClick={onReset}>Reset size</button>
  </>;
}

/** Values accepted by the shared image view. */
export interface ImageViewProps {
  readonly kind: ImageViewKind;
  readonly uri: string;
  readonly alt: string;
  readonly name?: string;
  readonly mimeType?: string;
  readonly width?: number;
  readonly height?: number;
  readonly customization?: ImageViewCustomization;
  readonly onChange?: (patch: { alt?: string; width?: number; height?: number; reset?: true }) => void;
  readonly onIntrinsicSize?: (width: number, height: number) => void;
}

interface ResizeStart {
  readonly pointerId: number;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Renders one logical image URI with customizable controls and resizing.
 *
 * @param props - Logical metadata, context, customization, and persistence callbacks.
 * @returns The shared inline, block, or element image frame.
 */
export function ImageView({
  kind,
  uri,
  alt,
  name,
  mimeType,
  width,
  height,
  customization,
  onChange,
  onIntrinsicSize,
}: ImageViewProps) {
  const reactEditor = useReactEditor();
  const registered = CUSTOMIZATIONS.get(reactEditor)?.[kind];
  const resizeMode = customization?.resizeMode ?? registered?.resizeMode ?? "letterbox";
  const dragResize = customization?.dragResize ?? registered?.dragResize ?? kind !== "element";
  const configuredHoverMenu = customization && Object.hasOwn(customization, "HoverMenu")
    ? customization.HoverMenu
    : registered?.HoverMenu;
  const HoverMenu = configuredHoverMenu === null ? null : configuredHoverMenu ?? DefaultImageHoverMenu;
  const fill = kind === "element";
  const frameRef = useRef<HTMLSpanElement>(null);
  const resize = useRef<ResizeStart | undefined>(undefined);
  const previewRef = useRef<{ width: number; height: number } | undefined>(undefined);
  const [source, setSource] = useState<string>();
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<{ width: number; height: number }>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number }>();
  const [copyError, setCopyError] = useState<string>();

  /**
   * Returns the best MIME hint available before asynchronous bytes resolve.
   *
   * @returns The persisted, embedded, inferred, or generic binary MIME type.
   */
  const copyMimeType = (): string => {
    if (mimeType && mimeType !== "application/octet-stream") return mimeType;
    const dataType = uri.match(/^data:([^;,]+)/i)?.[1];
    if (dataType) return dataType;
    const extension = uri.split(/[?#]/, 1)[0]!.match(/\.([a-z\d]+)$/i)?.[1]?.toLowerCase();
    return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif", bmp: "image/bmp", ico: "image/x-icon" } as Record<string, string>)[extension ?? ""]
      ?? "application/octet-stream";
  };

  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | undefined;
    setSource(undefined);
    setError(undefined);
    reactEditor.files.resolve(uri, { signal: abort.signal }).then((resolved) => {
      if (abort.signal.aborted) return;
      objectUrl = resolved instanceof Blob ? URL.createObjectURL(resolved) : resolved;
      setSource(objectUrl);
    }).catch((reason: unknown) => {
      if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load image");
    });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [reactEditor, uri]);

  const style: CSSProperties = fill
    ? { width: "100%", height: "100%" }
    : { width: preview?.width ?? width, height: preview?.height ?? height };

  /**
   * Starts a pointer-captured resize from current rendered geometry.
   *
   * @param event - Pointer-down event from the shared resize handle.
   * @returns Nothing.
   */
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds) return;
    resize.current = { pointerId: event.pointerId, width: bounds.width, height: bounds.height, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  /**
   * Updates the local resize preview while preserving ratio unless Shift is held.
   *
   * @param event - Pointer movement captured by the resize handle.
   * @returns Nothing.
   */
  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const start = resize.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const nextWidth = Math.max(24, Math.round(start.width + event.clientX - start.x));
    const nextHeight = resizeMode === "stretch" || event.shiftKey
      ? Math.max(24, Math.round(start.height + event.clientY - start.y))
      : Math.max(24, Math.round(nextWidth * start.height / start.width));
    previewRef.current = { width: nextWidth, height: nextHeight };
    setPreview(previewRef.current);
  };

  /**
   * Commits the completed pointer preview through the owning document record.
   *
   * @param event - Pointer completion or cancellation event.
   * @returns Nothing.
   */
  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (resize.current?.pointerId !== event.pointerId) return;
    resize.current = undefined;
    if (event.type !== "pointercancel" && previewRef.current) onChange?.(previewRef.current);
    previewRef.current = undefined;
    setPreview(undefined);
  };

  return (
    <span
      ref={frameRef}
      className={IMAGE_FRAME_CLASS}
      data-fill={fill || undefined}
      data-image-kind={kind}
      data-resize-mode={resizeMode}
      style={style}
      tabIndex={0}
      onContextMenu={(event) => {
        if (!reactEditor.clipboard.canWriteBinary(copyMimeType())) return;
        event.preventDefault();
        setCopyError(undefined);
        setContextMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      {source && !error
        ? <img
            className={IMAGE_CLASS}
            src={source}
            alt={alt}
            draggable={false}
            onLoad={(event) => onIntrinsicSize?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
            onError={() => setError("Unable to decode image")}
          />
        : <span className={IMAGE_ERROR_CLASS} role={error ? "alert" : "status"}>{error ?? "Loading image…"}</span>}
      {onChange && HoverMenu && <span className={IMAGE_CONTROLS_CLASS}>
        <HoverMenu
          kind={kind}
          uri={uri}
          alt={alt}
          width={width}
          height={height}
          onAltChange={(next) => onChange({ alt: next })}
          onReset={() => onChange({ reset: true })}
        />
      </span>}
      {onChange && dragResize && <button
        type="button"
        className={IMAGE_RESIZE_CLASS}
        aria-label="Resize image; press Enter to reset"
        onPointerDown={startResize}
        onPointerMove={moveResize}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
        onDoubleClick={() => onChange({ reset: true })}
        onKeyDown={(event) => {
          if (event.key === "Enter") onChange({ reset: true });
        }}
      />}
      {contextMenu && <span
        className={IMAGE_CONTEXT_MENU_CLASS}
        role="menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setContextMenu(undefined);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setContextMenu(undefined);
        }}
      >
        <button
          type="button"
          role="menuitem"
          autoFocus
          onClick={() => {
            const type = copyMimeType();
            const data = reactEditor.files.read(uri, type === "application/octet-stream" ? undefined : type, { signal: new AbortController().signal });
            void reactEditor.clipboard.writeBinary({ name: name || alt || "image", mimeType: type, data }).then((copied) => {
              if (copied) setContextMenu(undefined);
              else setCopyError("This clipboard cannot copy this image type");
            }).catch((reason: unknown) => setCopyError(reason instanceof Error ? reason.message : "Unable to copy image"));
          }}
        >Copy image</button>
        {copyError && <span role="alert">{copyError}</span>}
      </span>}
    </span>
  );
}
