"use client";

import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { cn } from "../lib/utils";
import type { DocumentEditorProps } from "./editor-types";

export function TipTapEditor({
  value,
  onChange,
  editable = true,
  placeholder = "Start writing…",
  className,
}: DocumentEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value.html || "<p></p>",
    editable,
    editorProps: {
      attributes: {
        class:
          "prose prose-neutral dark:prose-invert max-w-none min-h-[50vh] focus:outline-none px-1",
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange({ html: current.getHTML() });
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value.html !== current) {
      editor.commands.setContent(value.html || "<p></p>", false);
    }
  }, [editor, value.html]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  return (
    <div className={cn("rivto-tiptap", className)}>
      <EditorContent editor={editor} />
    </div>
  );
}

/** Stage-1 document editor. Swap this export for Rivto later. */
export const DocumentEditor = TipTapEditor;
