/**
 * Opt-in image blocks, inline image insertion, and browser file interactions.
 *
 * Clipboard, filesystem drop, and the native slash-command picker all share
 * one asynchronous upload path. Pending work is local presentation state;
 * successful references alone are committed to collaborative blocks/elements.
 *
 * @module
 */
import { escapeHtml } from "../../utils/escape-html";
import { FileIngestion } from "../../attachments/ingestion/file-ingestion";
import {
  FileUploadStatusOverlay,
  FileUploadStatusStore,
} from "../../attachments/ingestion/file-upload-status";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { BlockRendererProps } from "../../managers/blocks/renderer-types";
import type { ReactEditorExtension } from "../../managers";
import type { ImageViewConfiguration } from "../../components/image-view-types";
import type { ReactEditorApi } from "../../editor/types";
import { singleSelectedClipboardProps } from "../../managers/clipboard/clipboard-content";
import type { BinaryProvider } from "../../attachments";
import { useBlock, useBlockSelectionAnchor } from "../../hooks";
import { ImageView, type ImageViewCustomizations } from "./view/image-view";
import { registerMarkdownExtension } from "../../blocks/markdown/markdown-extensions";
import { imageMarkdownExtension } from "./macro/markdown";
import { serializeImageMacro } from "./macro/image-macro";
import { IMAGE_BLOCK_TYPE, prepareImageAsset } from "./ingestion/image-asset";
export { IMAGE_BLOCK_TYPE } from "./ingestion/image-asset";
import { inspectImage, isImageFile } from "./utils/image-input";
import { ImageInputEvents } from "./ingestion/image-input-events";
import type { FileInlineViewProps, FileReference } from "../../attachments";

const IMAGE_BLOCK_CLASS = "rivto-image-block";

/** Persisted image metadata shared by standalone blocks and canvas elements. */
export interface ImageProps extends FileReference {
  /** Alternative text used for the image. */
  readonly alt: string;
  /** Persisted display width in pixels, when specified. */
  readonly width?: number;
  /** Persisted display height in pixels, when specified. */
  readonly height?: number;
  /** Decoded source width in pixels, when known. */
  readonly intrinsicWidth?: number;
  /** Decoded source height in pixels, when known. */
  readonly intrinsicHeight?: number;
}

/** Installed image extension and its public fields. */
export interface ImageReactEditorExtension extends ReactEditorExtension<ImageViewConfiguration> {
  /** Stable installed identity for the image extension. */
  readonly id: "image";
  /** Image provider and view configuration owned by this extension. */
  readonly fields: ImageViewConfiguration;
}

declare global {
  interface RivtoInstalledExtensions {
    /** Image provider and view configuration. */
    image: ImageReactEditorExtension;
  }
}
/** Storage, presentation, and asynchronous error notification for images. */
export interface ImageExtensionOptions {
  /** Storage provider for uploaded and resolved images. */
  readonly provider: BinaryProvider;
  /**
   * Receives asynchronous image input or preparation failures.
   *
   * @param error - Failure reported while the extension is active.
   * @returns Completes the host notification.
   */
  readonly onError?: (error: unknown) => void;
  /** Optional presentation overrides for each image context. */
  readonly views?: ImageViewCustomizations;
}

/**
 * Renders an image reference encountered through the generic file macro.
 * @param props - Portable file metadata matched as an image.
 * @returns Shared inline image view.
 */
function InlineImageFileView({ reference }: FileInlineViewProps) {
  return (
    <ImageView
      kind="inline"
      uri={reference.uri}
      alt={reference.name}
      name={reference.name}
      mimeType={reference.mimeType}
    />
  );
}

/**
 * Reads image metadata from an opaque persisted property record.
 *
 * A URI and alternative text must be strings. Missing filenames and MIME types
 * receive display defaults; non-positive or non-finite dimensions are omitted.
 *
 * @param props - Persisted properties from an image block or canvas element.
 * @returns Normalized image properties, or undefined when required fields are not strings.
 */
function imageProps(props: Record<string, unknown>): ImageProps | undefined {
  if (typeof props.uri !== "string" || typeof props.alt !== "string") {
    return undefined;
  }
  // Discard non-positive or non-finite persisted sizes and dimensions.
  const number = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  return {
    uri: props.uri,
    name: typeof props.name === "string" && props.name ? props.name : props.alt || "image",
    mimeType:
      typeof props.mimeType === "string" && props.mimeType
        ? props.mimeType
        : "application/octet-stream",
    ...(number(props.size) === undefined ? {} : { size: number(props.size) }),
    alt: props.alt,
    width: number(props.width),
    height: number(props.height),
    intrinsicWidth: number(props.intrinsicWidth),
    intrinsicHeight: number(props.intrinsicHeight),
  };
}

/**
 * Renders a standalone image block on page and block-card surfaces.
 *
 * Changes are sent through the block's ID-bound operations.
 *
 * @param props - Stable block identity.
 * @param props.blockId - Persisted image block ID to render.
 * @returns The shared image view, or a validation error for invalid props.
 */
function ImageBlock({ blockId }: BlockRendererProps) {
  const { block, operations } = useBlock(blockId);
  const selectionAnchor = useBlockSelectionAnchor(blockId);
  const image = block ? imageProps(block.props) : undefined;
  if (!image) {
    return (
      <div {...selectionAnchor} className={IMAGE_BLOCK_CLASS} role="alert">
        Invalid image block
      </div>
    );
  }
  return (
    <div {...selectionAnchor} className={IMAGE_BLOCK_CLASS}>
      <ImageView
        kind="block"
        uri={image.uri}
        alt={image.alt}
        name={image.name}
        mimeType={image.mimeType}
        width={image.width}
        height={image.height}
        onIntrinsicSize={(intrinsicWidth, intrinsicHeight) => {
          // Preserve previously persisted dimensions once both are known.
          if (!image.intrinsicWidth || !image.intrinsicHeight) {
            operations.update({ props: { ...image, intrinsicWidth, intrinsicHeight } });
          }
        }}
        onChange={(patch) =>
          operations.update({
            props: patch.reset
              ? { ...image, width: undefined, height: undefined }
              : {
                  ...image,
                  ...(patch.alt !== undefined ? { alt: patch.alt } : {}),
                  ...(patch.width !== undefined ? { width: patch.width } : {}),
                  ...(patch.height !== undefined ? { height: patch.height } : {}),
                },
          })
        }
      />
    </div>
  );
}

/**
 * Renders canvas image content within the shared element host.
 *
 * Live transform previews do not write to the document. Normal edits update
 * the element's alternative text through the owning panel.
 *
 * @param props - Shared canvas renderer inputs.
 * @param props.element - Persisted image element and its current properties.
 * @param props.reactPanel - Panel used to commit image property changes.
 * @param props.preview - Whether this render represents a transient preview.
 * @returns The image view, or an error when required properties are invalid.
 */
function ImageElement({ element, reactPanel, preview }: ElementRenderProps) {
  const image = imageProps(element.props);
  if (!image) {
    return <span role="alert">Invalid image element</span>;
  }
  return (
    <ImageView
      kind="element"
      uri={image.uri}
      alt={image.alt}
      name={image.name}
      mimeType={image.mimeType}
      onChange={
        preview
          ? undefined
          : (patch) => {
              // Canvas resizing is owned by the element host; this view edits alt text.
              reactPanel.elements.updateElement(element.id, {
                props: { ...element.props, ...(patch.alt === undefined ? {} : { alt: patch.alt }) },
              });
            }
      }
    />
  );
}

/**
 * Registers image matching and preparation for file input.
 *
 * @param clipboard - File handler registration.
 * @param attachments - Binary resolution for existing image references.
 * @param provider - Provider used for image storage and reads.
 * @returns Installs the extension-owned image handler.
 * @throws If handler registration fails.
 */
function registerImageHandler(
  clipboard: Pick<ReactEditorApi["clipboard"], "registerFileHandler">,
  attachments: Pick<ReactEditorApi["attachments"], "resolveBinary">,
  provider: BinaryProvider,
): void {
  clipboard.registerFileHandler({
    id: "image",
    provider,
    InlineView: InlineImageFileView,
    // Match browser files by image metadata and references by their persisted MIME type.
    matches: ({ file, reference }) =>
      Boolean(file ? isImageFile(file) : reference.mimeType.startsWith("image/")),
    // Inspect file bytes or the resolved reference before preparing an image representation.
    prepare: async ({ file, reference }, context) => {
      const resolved = file
        ? file
        : await attachments.resolveBinary(provider, reference.uri, {
            signal: context.signal,
          });
      const dimensions = await inspectImage(resolved);
      context.signal.throwIfAborted();
      const completeReference = {
        ...reference,
        mimeType: resolved instanceof Blob && resolved.type ? resolved.type : reference.mimeType,
        ...(resolved instanceof Blob ? { size: resolved.size } : {}),
      };
      return prepareImageAsset(
        {
          ...completeReference,
          alt: file ? file.name || "Image" : reference.name || "Image",
          intrinsicWidth: dimensions.width,
          intrinsicHeight: dimensions.height,
        },
        context.destination,
      );
    },
  });
}

/**
 * Registers binary copy for one selected image.
 *
 * @param clipboard - Clipboard postprocessor registration.
 * @param attachments - Binary read operations for the selected image.
 * @param provider - Provider used for image references.
 * @param signal - Signal aborted when the extension is destroyed.
 * @returns Installs the extension-owned postprocessor.
 * @throws If the postprocessor registration fails.
 */
function registerImageClipboardCopy(
  clipboard: Pick<ReactEditorApi["clipboard"], "registerPostprocessor">,
  attachments: Pick<ReactEditorApi["attachments"], "readBinary">,
  provider: BinaryProvider,
  signal: AbortSignal,
): void {
  clipboard.registerPostprocessor({
    id: "image.binary",
    // Contribute binary data only when the selection contains one image.
    process: ({ bundle }) => {
      const props = singleSelectedClipboardProps(bundle, IMAGE_BLOCK_TYPE, "image");
      const image = props ? imageProps(props) : undefined;
      return image
        ? {
            name: image.name,
            mimeType: image.mimeType,
            data: attachments.readBinary(provider, image.uri, image.mimeType, {
              signal,
            }),
          }
        : undefined;
    },
  });
}

/**
 * Registers portable text and HTML formatting for image blocks.
 *
 * @param formats - Clipboard formatter registration.
 * @returns Installs the extension-owned formatter.
 * @throws If the formatter registration fails.
 */
function registerImageFormatter(
  formats: Pick<ReactEditorApi["clipboardFormats"], "registerFormatter">,
): void {
  formats.registerFormatter({
    id: "image",
    // Select only image blocks for portable formatting.
    matches: ({ block }) => block.type === IMAGE_BLOCK_TYPE,
    // Preserve nested content alongside the image macro and HTML image.
    format: ({ block, children, depth }) => {
      const image = imageProps(block.props);
      if (!image) {
        return { plain: "", markdown: "", html: "" };
      }
      const macro = `${"  ".repeat(depth)}${serializeImageMacro({ uri: image.uri, alt: image.alt, width: image.width, height: image.height })}`;
      const plain = children.plain ? `${macro}\n${children.plain}` : macro;
      return {
        plain,
        markdown: children.markdown ? `${macro}\n${children.markdown}` : macro,
        html:
          `<img src="${escapeHtml(image.uri)}" alt="${escapeHtml(image.alt)}"` +
          (image.width ? ` width="${image.width}"` : "") +
          (image.height ? ` height="${image.height}"` : "") +
          `>${children.html}`,
      };
    },
  });
}

/**
 * Installs image input, block and canvas rendering, and slash insertion.
 *
 * The extension owns local upload feedback and cancels pending work on removal.
 *
 * @param options - Storage provider, optional view customization, and error notification.
 * @returns The lifecycle-owned image extension.
 */
export function imageExtension(options: ImageExtensionOptions): ImageReactEditorExtension {
  return {
    id: "image",
    fields: { provider: options.provider, customizations: options.views ?? {} },
    // Keep image configuration and ingestion scoped to this extension installation.
    setup: (reactEditor) => {
      registerMarkdownExtension(reactEditor.extensions, imageMarkdownExtension);
      const statuses = new FileUploadStatusStore();
      const ingestion = new FileIngestion(statuses, options.onError);
      // Cancel pending work when the extension is removed.
      const dispose = reactEditor.extensions.registerCleanup(() => {
        ingestion.destroy();
      });
      reactEditor.extensions.mount(
        // Show this extension's local pending and failed image statuses.
        () => <FileUploadStatusOverlay store={statuses} kind="image" />,
        "afterSurface",
      );
      reactEditor.blockTypes.register({
        definition: { type: IMAGE_BLOCK_TYPE, title: "Image" },
        render: ImageBlock,
      });
      reactEditor.elementTypes.register({
        definition: { type: "image" },
        render: ImageElement,
        title: "Image",
      });
      registerImageHandler(reactEditor.clipboard, reactEditor.attachments, options.provider);
      registerImageClipboardCopy(
        reactEditor.clipboard,
        reactEditor.attachments,
        options.provider,
        ingestion.signal,
      );
      registerImageFormatter(reactEditor.clipboardFormats);

      new ImageInputEvents(
        reactEditor,
        ingestion,
        statuses,
        options.provider,
        options.onError,
      ).register();
      return dispose;
    },
  };
}
