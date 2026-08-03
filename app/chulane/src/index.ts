// Server-safe exports: types, services, utilities. React exports live in ./client.

export type {
  CreateProjectInput,
  Project,
  ProjectStatus,
  SystemContainer,
  UpdateProjectInput,
} from "./domain/project/types";
export { projectService } from "./domain/project/service";

export type {
  CreatePageInput,
  Page,
  PageFilter,
  PageKind,
  UpdatePageInput,
} from "./domain/page/types";
export { pageService } from "./domain/page/service";

export type {
  AvailableTag,
  CreateTagInput,
  Tag,
  UpdateTagInput,
} from "./domain/tag/types";
export {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_PRESETS,
  formatTagName,
  normalizeTagColor,
  normalizeTagName,
} from "./domain/tag/types";
export { tagService } from "./domain/tag/service";

export type { JournalDay } from "./domain/journal/service";
export { journalService } from "./domain/journal/service";
export {
  dayKeyToDate,
  formatDayLabel,
  formatDayTitle,
  formatMonthLabel,
  isValidDayKey,
  toDayKey,
  todayKey,
} from "./domain/journal/utils";

export { SYSTEM_PROJECT_IDS } from "./lib/mock/db";
export { QUERY_KEYS } from "./lib/query-keys";
export { cn } from "./lib/utils";
