/**
 * Host-facing document editor contract for the product kit.
 *
 * Page CRUD keeps a string body. This module names that string as a Rivto
 * snapshot so TipTap HTML is no longer part of the public editor API.
 */

import type { ReactNode } from "react";
import type { EditorMode } from "@chulane/rivto";

export type { EditorMode };

/**
 * Host contract for the product document editor.
 *
 * `content` is a serialized Rivto snapshot JSON string stored on `Page.content`.
 * The shell and page CRUD stay string-based so persistence can swap later.
 */
export type DocumentEditorProps = {
  /** Page identity used to recreate the runtime when the open document changes. */
  documentId: string;
  /** Serialized Rivto `EditorSnapshot` JSON. */
  content: string;
  /** Persists the latest snapshot JSON after local document edits. */
  onChange: (content: string) => void;
  /** When false, the surface still renders but host chrome may hide editing. */
  editable?: boolean;
  className?: string;
  /** Presentation mode applied when the runtime is created. */
  initialMode?: EditorMode;
  /**
   * Host chrome rendered inside `EditorView` (above the surface).
   * Use this to place {@link EditorModeToggle} in page headers.
   */
  children?: ReactNode;
  /** When false, the host places {@link EditorModeToggle} itself. Default true. */
  showModeSwitch?: boolean;
};
