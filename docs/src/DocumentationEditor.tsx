/**
 * Renders the Tiptap Markdown editing surface and its compact formatting controls.
 * Markdown is always parsed and serialized by Tiptap so the repository file remains
 * the source format rather than storing a second JSON or HTML representation.
 */

import Image from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { extractClipboardImages } from "./clipboard-images";
import { handleDocumentationIndentKey } from "./editor-keyboard";
import { resolveImagesForEditor, restoreImagesForFile } from "./image-paths";
import { slugifyHeading } from "./navigation";

const EDITOR_DATA_ATTRIBUTE = "data-rivto-docs-editor";

export interface DocumentationEditorProps {
  content: string;
  pagePath: string;
  anchor: string;
  onDirtyChange: (isDirty: boolean) => void;
  onEditorReady: (getMarkdown: (() => string) | null) => void;
  onPasteImage: (image: File) => Promise<PastedDocumentationImage>;
  onNavigateLink: (href: string) => boolean;
}

export interface PastedDocumentationImage {
  source: string;
  alt: string;
}

/**
 * Creates an editable WYSIWYG surface for one Markdown file.
 *
 * @param props Content identity and callbacks owned by the app shell.
 * @returns Tiptap editor with common Markdown formatting controls.
 */
export function DocumentationEditor({
  content,
  pagePath,
  anchor,
  onDirtyChange,
  onEditorReady,
  onPasteImage,
  onNavigateLink,
}: DocumentationEditorProps): React.JSX.Element {
  const isApplyingContent = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const onPasteImageRef = useRef(onPasteImage);
  const onNavigateLinkRef = useRef(onNavigateLink);
  onPasteImageRef.current = onPasteImage;
  onNavigateLinkRef.current = onNavigateLink;
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: true } }),
      Image.configure({ allowBase64: false }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: false } }),
    ],
    content: resolveImagesForEditor(content, pagePath),
    contentType: "markdown",
    editorProps: {
      attributes: { [EDITOR_DATA_ATTRIBUTE]: "" },
      decorations(state) {
        const counts = new Map<string, number>();
        const decorations: Decoration[] = [];
        state.doc.descendants(function decorateHeading(node, position) {
          if (node.type.name !== "heading") return;
          const base = slugifyHeading(node.textContent) || "section";
          const occurrence = counts.get(base) ?? 0;
          counts.set(base, occurrence + 1);
          decorations.push(Decoration.node(
            position,
            position + node.nodeSize,
            { id: occurrence === 0 ? base : `${base}-${occurrence}` },
          ));
        });
        return DecorationSet.create(state.doc, decorations);
      },
      handleKeyDown(view, event) {
        return handleDocumentationIndentKey(view, event);
      },
      handleClick(_view, _position, event) {
        const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
        const href = link?.getAttribute("href");
        return href ? onNavigateLinkRef.current(href) : false;
      },
      handlePaste(_view, event) {
        const images = extractClipboardImages(event.clipboardData);
        if (images.length === 0) {
          return false;
        }
        event.preventDefault();
        void pasteImages(images);
        return true;
      },
      handleDrop(_view, event) {
        const images = extractClipboardImages(event.dataTransfer);
        if (images.length === 0) {
          return false;
        }
        event.preventDefault();
        void pasteImages(images);
        return true;
      },
    },
    onUpdate() {
      if (!isApplyingContent.current) {
        onDirtyChange(true);
      }
    },
  });

  /** Uploads clipboard images in order and inserts their persisted sources. */
  async function pasteImages(images: readonly File[]): Promise<void> {
    try {
      for (const image of images) {
        const pasted = await onPasteImageRef.current(image);
        editor?.chain().focus().setImage({ src: pasted.source, alt: pasted.alt }).run();
      }
    } catch {
      // The app callback owns the user-facing failure status.
    }
  }

  useEffect(function replaceEditorContent() {
    if (!editor) {
      return;
    }
    isApplyingContent.current = true;
    editor.commands.setContent(resolveImagesForEditor(content, pagePath), { contentType: "markdown" });
    isApplyingContent.current = false;
    onDirtyChange(false);
  }, [content, editor, onDirtyChange, pagePath]);

  useEffect(function syncHeadingAnchors() {
    if (!editor || !anchor) return;
    const frame = window.requestAnimationFrame(function revealHeading() {
      editor.view.dom.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`)?.scrollIntoView();
    });
    return function cancelHeadingAnchorUpdate() { window.cancelAnimationFrame(frame); };
  }, [anchor, content, editor, pagePath]);

  useEffect(function publishMarkdownReader() {
    onEditorReady(editor ? function getMarkdown() {
      return restoreImagesForFile(editor.getMarkdown(), pagePath);
    } : null);
    return function clearMarkdownReader() {
      onEditorReady(null);
    };
  }, [editor, onEditorReady, pagePath]);

  if (!editor) {
    return <p>Opening editor…</p>;
  }

  return (
    <section data-editor-shell>
      <div data-formatting-toolbar role="toolbar" aria-label="Text formatting">
        <button type="button" aria-pressed={editor.isActive("bold")} onClick={function toggleBold() { editor.chain().focus().toggleBold().run(); }}>Bold</button>
        <button type="button" aria-pressed={editor.isActive("italic")} onClick={function toggleItalic() { editor.chain().focus().toggleItalic().run(); }}>Italic</button>
        <button type="button" aria-pressed={editor.isActive("heading", { level: 2 })} onClick={function toggleHeading() { editor.chain().focus().toggleHeading({ level: 2 }).run(); }}>Heading</button>
        <button type="button" aria-pressed={editor.isActive("bulletList")} onClick={function toggleBulletList() { editor.chain().focus().toggleBulletList().run(); }}>List</button>
        <button type="button" aria-pressed={editor.isActive("codeBlock")} onClick={function toggleCodeBlock() { editor.chain().focus().toggleCodeBlock().run(); }}>Code</button>
        <button type="button" aria-pressed={editor.isActive("blockquote")} onClick={function toggleBlockquote() { editor.chain().focus().toggleBlockquote().run(); }}>Quote</button>
        <button
          type="button"
          aria-pressed={editor.isActive("link")}
          onClick={function editLink() {
            const href = window.prompt("Link URL", editor.getAttributes("link").href ?? "");
            if (href === null) return;
            if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run();
          }}
        >Link</button>
        <button type="button" disabled={!import.meta.env.DEV} title={import.meta.env.DEV ? "Choose one or more image files" : "Available with pnpm docs:dev"} onClick={function chooseImages() { imageInput.current?.click(); }}>Add image</button>
        <input
          ref={imageInput}
          data-image-input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
          multiple
          onChange={function addChosenImages(event) {
            void pasteImages(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}
