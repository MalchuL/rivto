import { escapeHtml } from "../file/utils/escape-html";
/**
 * Opt-in image blocks, inline image insertion, and browser file interactions.
 *
 * Clipboard, filesystem drop, and the native slash-command picker all share
 * one asynchronous upload path. Pending work is local presentation state;
 * successful references alone are committed to collaborative blocks/elements.
 *
 * @module
 */
import {
  fileDestinationAtPoint,
  inlineDestination,
  isFileDestinationCurrent,
  retryFileDestination,
  type FileDestination as ImageDestination,
} from "../file/ingestion/file-destination";
import { ingestFileBatch, insertPrepared } from "../file/ingestion/file-ingestion";
import { type EditorBlock } from "@chulane/rivto";
import {
  FileUploadStatusOverlay,
  FileUploadStatusStore,
} from "../file/ingestion/file-upload-status";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { ReactPanelApi } from "../../panels/types";
import type { ReactEditorExtension } from "../../managers";
import type { BinaryProvider } from "../../attachments";
import { useBlock, useBlockSelectionAnchor } from "../../hooks";
import {
  configureImageViews,
  ImageView,
  MIN_IMAGE_SIZE,
  type ImageViewCustomizations,
} from "./image-view";
import { serializeImageMacro } from "./image-macro";
import {
  inspectImage,
  isImageFile,
  getTransferredImageFiles,
  findImageUri,
  findTransferredImageUri,
} from "./utils/image-input";
import {
  validateBinaryUri,
  type FileInlineViewProps,
  type FileReference,
  type PreparedFile,
} from "../../attachments";

/** Persisted native type used by standalone image blocks. */
export const IMAGE_BLOCK_TYPE = "image";
const IMAGE_BLOCK_CLASS = "rivto-image-block";
const IMAGE_FILE_INPUT_CLASS = "rivto-image-file-input";
/** Maximum initial canvas image width, in pixels. */
const MAX_INITIAL_IMAGE_WIDTH = 640;
/** Maximum initial canvas image height, in pixels. */
const MAX_INITIAL_IMAGE_HEIGHT = 480;

/** Persisted image metadata shared by standalone blocks and canvas elements. */
export interface ImageProps extends FileReference {
  readonly uri: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly intrinsicWidth?: number;
  readonly intrinsicHeight?: number;
}

/** Optional host notification for asynchronous image failures. */
export interface ImageExtensionOptions {
  readonly provider: BinaryProvider<string, Blob>;
  readonly onError?: (error: unknown) => void;
  readonly views?: ImageViewCustomizations;
}

interface ImageAsset extends FileReference {
  readonly alt: string;
  readonly intrinsicWidth: number;
  readonly intrinsicHeight: number;
}

/**
 * Builds the inline, block, and canvas representations of an inspected image.
 *
 * @param asset - Stored reference and decoded intrinsic dimensions.
 * @returns Prepared image representations using the shared initial canvas size.
 */
function prepareImageAsset(asset: ImageAsset): PreparedFile {
  const scale = Math.min(
    1,
    MAX_INITIAL_IMAGE_WIDTH / asset.intrinsicWidth,
    MAX_INITIAL_IMAGE_HEIGHT / asset.intrinsicHeight,
  );
  return {
    inline: serializeImageMacro({ uri: asset.uri, alt: asset.alt }),
    block: { type: IMAGE_BLOCK_TYPE, props: { ...asset } },
    element: {
      type: "image",
      props: { ...asset, rotation: 0 },
      width: Math.max(MIN_IMAGE_SIZE, Math.round(asset.intrinsicWidth * scale)),
      height: Math.max(MIN_IMAGE_SIZE, Math.round(asset.intrinsicHeight * scale)),
    },
  };
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

/** Returns normalized image props from an opaque persisted property record. */
function imageProps(props: Record<string, unknown>): ImageProps | undefined {
  if (typeof props.uri !== "string" || typeof props.alt !== "string") {
    return undefined;
  }
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

/** Standalone image block renderer shared by page and block-card surfaces. */
export function ImageBlock({ blockId }: { readonly blockId: string }) {
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

/** Renders canvas image content within the shared element host. */
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
              reactPanel.elements.updateElement(element.id, {
                props: { ...element.props, ...(patch.alt === undefined ? {} : { alt: patch.alt }) },
              });
            }
      }
    />
  );
}

/** Installs image upload events, block rendering, and slash insertion. */
export function imageExtension(options: ImageExtensionOptions): ReactEditorExtension {
  return {
    id: "image",
    setup: (reactEditor) => {
      const statuses = new FileUploadStatusStore();
      let nextUploadId = 0;
      const abort = new AbortController();
      const disposeImageViews = configureImageViews(reactEditor, options.views ?? {});
      reactEditor.extensions.mount(
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
      reactEditor.clipboard.registerFileHandler({
        id: "image",
        provider: options.provider,
        InlineView: InlineImageFileView,
        matches: ({ file, reference }) =>
          Boolean(file ? isImageFile(file) : reference.mimeType.startsWith("image/")),
        prepare: async ({ file, reference }, context) => {
          const resolved = file
            ? file
            : await reactEditor.attachments.resolveBinary(options.provider, reference.uri, {
                signal: context.signal,
                mode: context.mode,
              });
          const localUrl = resolved instanceof Blob ? URL.createObjectURL(resolved) : resolved;
          const dimensions = await inspectImage(localUrl, resolved instanceof Blob);
          context.signal.throwIfAborted();
          const completeReference = {
            ...reference,
            mimeType:
              resolved instanceof Blob && resolved.type ? resolved.type : reference.mimeType,
            ...(resolved instanceof Blob ? { size: resolved.size } : {}),
          };
          return prepareImageAsset({
            ...completeReference,
            alt: file ? file.name || "Image" : reference.name || "Image",
            intrinsicWidth: dimensions.width,
            intrinsicHeight: dimensions.height,
          });
        },
      });
      reactEditor.clipboard.registerPostprocessor({
        id: "image.binary",
        process: ({ bundle }) => {
          const blocks = bundle.blocks.filter((block) => block.type === IMAGE_BLOCK_TYPE);
          const selected = new Set(bundle.selectedElementIds ?? []);
          const elements = (bundle.elements ?? []).filter(
            (element) => selected.has(element.id) && element.type === "image",
          );
          if (blocks.length + elements.length !== 1 || bundle.blocks.length + selected.size !== 1) {
            return undefined;
          }
          const image = imageProps((blocks[0] ?? elements[0])!.props);
          return image
            ? {
                name: image.name,
                mimeType: image.mimeType,
                data: reactEditor.attachments.readBinary(
                  options.provider,
                  image.uri,
                  image.mimeType,
                  {
                    signal: abort.signal,
                  },
                ),
              }
            : undefined;
        },
      });
      reactEditor.clipboardFormats.registerFormatter({
        id: "image",
        matches: ({ block }) => block.type === IMAGE_BLOCK_TYPE,
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

      /** Uploads one batch concurrently and inserts successful results in source order. */
      const upload = (
        reactPanel: ReactPanelApi,
        files: readonly File[],
        destination: ImageDestination,
        source: "clipboard" | "drop" | "picker",
        point: { x: number; y: number },
      ): void => {
        if (destination.kind === "element" && !reactEditor.elementRegistry.get("image")) {
          const id = String(++nextUploadId);
          statuses.set({
            id,
            name: files[0]?.name ?? "image",
            x: point.x,
            y: point.y,
            error: "Canvas images require edgelessVisualsExtension()",
            retry: () => statuses.delete(id),
          });
          return;
        }
        const mode = reactPanel.getSurfaceType();
        ingestFileBatch<File, ImageAsset>({
          panel: reactPanel,
          destination,
          items: files.filter(isImageFile),
          point,
          signal: abort.signal,
          statuses,
          nextId: () => String(++nextUploadId),
          name: (file) => file.name || "image",
          retry: (file, nextDestination) =>
            upload(reactPanel, [file], nextDestination, source, point),
          onError: options.onError,
          failureMessage: "Unable to upload image",
          staleMessage:
            "The destination changed while the image was uploading. Select a location and retry.",
          commit: (items) => insertPrepared(reactPanel, items.map(prepareImageAsset), destination),
          prepare: async (file, id): Promise<ImageAsset> => {
            const localUrl = URL.createObjectURL(file);
            const dimensions = await inspectImage(localUrl, true);
            abort.signal.throwIfAborted();
            const uri = validateBinaryUri(
              await options.provider.write(file, {
                documentId: reactEditor.getDocument().id,
                name: file.name || "image",
                mimeType: file.type || "application/octet-stream",
                source,
                mode,
                destination: destination.kind,
                signal: abort.signal,
                reportProgress: (progress) =>
                  statuses.update(id, { progress: Math.max(0, Math.min(1, progress)) }),
              }),
            );
            abort.signal.throwIfAborted();
            return {
              uri,
              name: file.name || "image",
              mimeType: file.type || "application/octet-stream",
              size: file.size,
              alt: file.name || "Image",
              intrinsicWidth: dimensions.width,
              intrinsicHeight: dimensions.height,
            };
          },
        });
      };

      /** Resolves and inserts a remote image reference without uploading it. */
      const insertRemote = (
        reactPanel: ReactPanelApi,
        remote: { uri: string; alt: string },
        destination: ImageDestination,
        point: { x: number; y: number },
      ): void => {
        if (destination.kind === "element" && !reactEditor.elementRegistry.get("image")) {
          const id = String(++nextUploadId);
          statuses.set({
            id,
            name: remote.uri,
            x: point.x,
            y: point.y,
            error: "Canvas images require edgelessVisualsExtension()",
            retry: () => statuses.delete(id),
          });
          return;
        }
        const id = String(++nextUploadId);
        const retry = () => {
          statuses.delete(id);
          insertRemote(reactPanel, remote, retryFileDestination(reactPanel, destination), point);
        };
        statuses.set({ id, name: remote.uri, x: point.x, y: point.y, retry });
        void reactEditor.attachments
          .resolveBinary(options.provider, remote.uri, {
            signal: abort.signal,
            mode: reactPanel.getSurfaceType(),
          })
          .then(async (resolved) => {
            const source = resolved instanceof Blob ? URL.createObjectURL(resolved) : resolved;
            const dimensions = await inspectImage(source, resolved instanceof Blob);
            if (abort.signal.aborted) {
              return;
            }
            if (!isFileDestinationCurrent(reactPanel, destination)) {
              throw new Error(
                "The destination changed while the image was loading. Select a location and retry.",
              );
            }
            statuses.delete(id);
            const name = (() => {
              try {
                return decodeURIComponent(
                  new URL(remote.uri, location.href).pathname.split("/").pop() || "image",
                );
              } catch {
                return "image";
              }
            })();
            insertPrepared(
              reactPanel,
              [
                prepareImageAsset({
                  uri: remote.uri,
                  name,
                  mimeType:
                    resolved instanceof Blob && resolved.type
                      ? resolved.type
                      : "application/octet-stream",
                  ...(resolved instanceof Blob ? { size: resolved.size } : {}),
                  alt: remote.alt,
                  intrinsicWidth: dimensions.width,
                  intrinsicHeight: dimensions.height,
                }),
              ],
              destination,
            );
          })
          .catch((error: unknown) => {
            statuses.update(id, {
              error: error instanceof Error ? error.message : "Unable to load image",
            });
            options.onError?.(error);
          });
      };

      reactEditor.events.register(
        { id: "image.dragover", type: "dragover", capture: true },
        ({ raw, root }) => {
          const accepts =
            [...(raw.dataTransfer?.files ?? [])].some((file) => file.type.startsWith("image/")) ||
            raw.dataTransfer?.types.includes("Files") === true ||
            raw.dataTransfer?.types.includes("text/uri-list") === true;
          if (accepts && raw.dataTransfer) {
            raw.dataTransfer.dropEffect = "copy";
          }
          return accepts && root.contains(raw.target as Node);
        },
      );
      reactEditor.events.register(
        { id: "image.drop", type: "drop", capture: true },
        ({ raw, mode, contentElement, blockId, root, reactPanel }) => {
          const files = getTransferredImageFiles(raw.dataTransfer);
          const remote = findTransferredImageUri(raw.dataTransfer);
          if (!files.length && !remote) {
            return false;
          }
          const destination = fileDestinationAtPoint(
            reactPanel,
            mode,
            contentElement,
            blockId,
            raw.clientX,
            raw.clientY,
            root,
          );
          if (files.length) {
            upload(reactPanel, files, destination, "drop", { x: raw.clientX, y: raw.clientY });
          } else if (remote) {
            insertRemote(reactPanel, remote, destination, { x: raw.clientX, y: raw.clientY });
          }
          return true;
        },
      );
      reactEditor.events.register(
        { id: "image.paste", type: "paste", capture: true },
        ({ raw, mode, contentElement, blockId, root, reactPanel }) => {
          const files = getTransferredImageFiles(raw.clipboardData);
          const remote = findTransferredImageUri(raw.clipboardData);
          const redactedFileList =
            !files.length && !remote && raw.clipboardData?.types.includes("text/uri-list") === true;
          if (!files.length && !remote && !redactedFileList) {
            return false;
          }
          const bounds = contentElement?.getBoundingClientRect() ?? root.getBoundingClientRect();
          const destination = contentElement
            ? inlineDestination(reactPanel, blockId)
            : fileDestinationAtPoint(
                reactPanel,
                mode,
                null,
                blockId,
                bounds.left + bounds.width / 2,
                bounds.top + bounds.height / 2,
                root,
              );
          if (!destination) {
            return false;
          }
          const point = { x: bounds.left + bounds.width / 2, y: bounds.bottom };
          if (files.length) {
            upload(reactPanel, files, destination, "clipboard", point);
          } else if (remote) {
            insertRemote(reactPanel, remote, destination, point);
          } else {
            const id = String(++nextUploadId);
            const read = (): void => {
              statuses.set({ id, name: "clipboard image", x: point.x, y: point.y, retry: read });
              const clipboard = root.ownerDocument.defaultView?.navigator.clipboard;
              void clipboard
                ?.readText()
                .then((text) => {
                  const uri = findImageUri(text);
                  if (!uri) {
                    throw new TypeError("Clipboard does not contain a readable image path");
                  }
                  statuses.delete(id);
                  insertRemote(reactPanel, { uri, alt: "" }, destination, point);
                })
                .catch((error: unknown) => {
                  statuses.update(id, {
                    error:
                      error instanceof Error
                        ? error.message
                        : "Unable to read the clipboard image path",
                  });
                  options.onError?.(error);
                });
              if (!clipboard) {
                statuses.update(id, {
                  error: "This browser does not provide clipboard read access",
                });
              }
            };
            read();
          }
          return true;
        },
      );
      reactEditor.slashCommands.register({
        id: "image.insert",
        title: "Image",
        group: "Insert",
        keywords: ["picture", "photo", "upload"],
        execute: ({ blockId, reactPanel }) => {
          const block = reactPanel.blocks.getBlockNode(blockId);
          const replaceId =
            block &&
            !reactPanel.blocks.hasChildren(block.id) &&
            reactEditor.defaultWritingBlockFactory.isEmptyBlock(block)
              ? blockId
              : undefined;
          const input = document.createElement("input");
          input.className = IMAGE_FILE_INPUT_CLASS;
          input.type = "file";
          input.accept = "image/*";
          input.multiple = true;
          input.addEventListener(
            "change",
            () => {
              const blockElement = reactPanel
                .getRoot()
                ?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
              const bounds = blockElement?.getBoundingClientRect();
              upload(
                reactPanel,
                [...(input.files ?? [])],
                { kind: "block", afterId: blockId, replaceId, content: block?.content },
                "picker",
                {
                  x: bounds?.left ?? innerWidth / 2,
                  y: bounds?.bottom ?? innerHeight / 2,
                },
              );
            },
            { once: true },
          );
          input.click();
        },
      });
      return () => {
        abort.abort();
        disposeImageViews();
      };
    },
  };
}

/** Returns whether a block is a valid standalone image record. */
export function isImageBlock(block: EditorBlock): boolean {
  return block.type === IMAGE_BLOCK_TYPE && Boolean(imageProps(block.props));
}
