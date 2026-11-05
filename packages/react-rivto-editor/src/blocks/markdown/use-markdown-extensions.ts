import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useReactPanel } from "../../hooks";
import { fileMarkdownExtension } from "./extensions/file";
import { imageMarkdownExtension } from "./extensions/image";
import type { ClipboardApi } from "../../managers/clipboard/api";
import type { MarkdownExtension, MarkdownExtensionsApi } from "./markdown-extensions";

/** Read-only editor registrations needed by Markdown preview rendering. */
interface MarkdownExtensionSources {
  /** Live attachment-handler lookup and change notifications. */
  readonly clipboard: Pick<ClipboardApi, "getFileHandler" | "subscribeFileHandlers">;
  /** Ordered Markdown contributions and change notifications. */
  readonly markdown: Pick<MarkdownExtensionsApi, "get" | "revision" | "subscribe">;
}

/** File handler presence in the Markdown attachment snapshot. */
const FILE_HANDLER_PRESENT = 1;
/** Image handler presence in the Markdown attachment snapshot. */
const IMAGE_HANDLER_PRESENT = 2;

/**
 * Observes Markdown contributions and the attachment handlers they can render.
 *
 * Markdown owns the file and image presentation integrations; their corresponding
 * handlers can be installed or removed without depending on this hook or registry.
 *
 * @returns Contributions in rendering order for the current editor runtime.
 * @throws If called outside an editor panel.
 */
export function useMarkdownExtensions(): readonly MarkdownExtension[] {
  const { markdown, clipboard }: MarkdownExtensionSources = useReactPanel().editor;
  const subscribeFileHandlers = useCallback(
    (listener: () => void) => clipboard.subscribeFileHandlers(listener),
    [clipboard],
  );
  const getAttachmentHandlers = useCallback(
    () =>
      (clipboard.getFileHandler("file") ? FILE_HANDLER_PRESENT : 0) |
      (clipboard.getFileHandler("image") ? IMAGE_HANDLER_PRESENT : 0),
    [clipboard],
  );
  const attachmentHandlers = useSyncExternalStore(
    subscribeFileHandlers,
    getAttachmentHandlers,
    getAttachmentHandlers,
  );
  const revision = useSyncExternalStore(
    (listener) => markdown.subscribe(listener),
    () => markdown.revision,
    () => markdown.revision,
  );
  return useMemo(() => {
    const builtins: MarkdownExtension[] = [];
    if (attachmentHandlers & FILE_HANDLER_PRESENT) {
      builtins.push(fileMarkdownExtension);
    }
    if (attachmentHandlers & IMAGE_HANDLER_PRESENT) {
      builtins.push(imageMarkdownExtension);
    }
    return [...builtins, ...markdown.get()];
  }, [markdown, revision, attachmentHandlers]);
}
