"use client";

// Client-only exports: React hooks and components.

export {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useProjectQuery,
  useProjectsQuery,
  useUpdateProjectMutation,
} from "./domain/project/hooks";

export {
  useCreatePageMutation,
  useDeletePageMutation,
  usePageQuery,
  usePagesQuery,
  useSearchPagesQuery,
  useUpdatePageMutation,
} from "./domain/page/hooks";

export {
  useCreateTagMutation,
  useDeleteTagMutation,
  useProjectTagsQuery,
  useUpdateTagMutation,
} from "./domain/tag/hooks";

export {
  useJournalDayQuery,
  useJournalDaysQuery,
} from "./domain/journal/hooks";

export { DocumentEditor, RivtoEditor } from "./editor/RivtoEditor";
export { EditorModeToggle } from "./editor/editor-mode-toggle";
export type { DocumentEditorProps, EditorMode } from "./editor/editor-types";
export {
  EMPTY_EDITOR_CONTENT,
  EMPTY_EDITOR_SNAPSHOT,
  extractPageOutline,
  extractPageText,
  parseEditorSnapshot,
  serializeEditorSnapshot,
  serializeSeedSnapshot,
} from "./editor/snapshot";
export type { PageOutlineItem, SeedWritingBlock } from "./editor/snapshot";
