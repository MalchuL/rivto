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

export { DocumentEditor, TipTapEditor } from "./editor/TipTapEditor";
export type { DocumentEditorProps, EditorValue } from "./editor/editor-types";
