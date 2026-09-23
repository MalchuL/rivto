/**
 * Centralizes DOM class-name contracts for the TODO item, properties dialog,
 * storage toolbar, and sortable status-order components. Keeping these names
 * outside TSX makes presentation hooks reusable without coupling them to a
 * renderer implementation.
 *
 * Each constant starts with a stable `rivto-todo-*` hook that hosts, tests, and
 * the colocated `todo-item.css` may target, followed by the Tailwind utilities
 * that give the element its default look. Rules that need structural or
 * `:has()` selectors (storage card chrome, drop-field hover, block-tree
 * geometry) stay in `todo-item.css` and address only the stable hook.
 *
 * @module
 */
export const TODO_ITEM_CLASS = "rivto-todo-item group/todo flex min-w-0 items-start gap-2.5 rounded-lg border border-(--rivto-todo-item-border) bg-background px-3 py-2.5 shadow-[0_1px_2px_rgb(0_0_0/6%)] transition-[border-color,box-shadow] duration-100 hover:border-(--rivto-todo-control-border) hover:shadow-[0_2px_8px_rgb(0_0_0/8%)] focus-within:border-(--rivto-todo-control-border) focus-within:shadow-[0_2px_8px_rgb(0_0_0/8%)] data-[todo-priority=1]:bg-(--rivto-todo-priority-1) data-[todo-priority=2]:bg-(--rivto-todo-priority-2) data-[todo-priority=3]:bg-(--rivto-todo-priority-3)";
export const TODO_STATUS_CLASS = "rivto-todo-status mt-px grid size-[19px] shrink-0 place-items-center rounded-full border-2 p-0 text-white [&_svg]:size-3 [&_svg]:stroke-[3]";
export const TODO_STATUS_TODO_CLASS = "rivto-todo-status-todo border-(--rivto-todo-control-border-strong) bg-background";
export const TODO_STATUS_DOING_CLASS = "rivto-todo-status-doing border-(--rivto-todo-accent) bg-(--rivto-todo-accent)";
export const TODO_STATUS_DONE_CLASS = "rivto-todo-status-done border-(--rivto-todo-done) bg-(--rivto-todo-done)";
export const TODO_BODY_CLASS = "rivto-todo-body min-w-0 flex-1";
export const TODO_NAME_CLASS = "rivto-todo-name min-w-[1ch] text-sm leading-5 font-medium text-(--rivto-todo-foreground) outline-none group-data-[todo-status=done]/todo:text-muted-foreground group-data-[todo-status=done]/todo:line-through";
export const TODO_DESCRIPTION_CLASS = "rivto-todo-description mt-0.5 block h-auto w-full min-w-0 truncate rounded-none border-0 bg-transparent p-0 text-left text-xs leading-4 text-muted-foreground shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--rivto-todo-focus)";
export const TODO_META_CLASS = "rivto-todo-meta mt-1.5 flex flex-wrap gap-1.5";
export const TODO_PROJECT_CLASS = "rivto-todo-project h-4 w-auto max-w-40 min-w-0 truncate rounded border-0 bg-(--rivto-todo-chip) px-1.5 py-0 text-[10px] leading-4 font-semibold text-(--rivto-todo-chip-foreground) shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--rivto-todo-focus)";
export const TODO_PRIORITY_CLASS = "rivto-todo-priority block h-4 w-auto cursor-pointer rounded border-0 bg-(--rivto-todo-chip) px-1.5 py-0 text-[10px] leading-4 font-semibold text-(--rivto-todo-chip-foreground) shadow-none focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--rivto-todo-focus)";
export const TODO_PROPERTIES_BUTTON_CLASS = "rivto-todo-properties-button -mt-0.5 size-6 text-(--rivto-todo-muted-foreground) opacity-0 group-hover/todo:opacity-100 focus-visible:opacity-100";
export const TODO_PROMPT_CLASS = "rivto-todo-prompt";
export const TODO_MODAL_CLASS = "rivto-todo-modal w-[min(420px,calc(100vw-32px))] gap-0 p-[18px]";
export const TODO_MODAL_HEADER_CLASS = "rivto-todo-modal-header mb-3.5 flex items-center justify-between";
export const TODO_MODAL_FIELDS_CLASS = "rivto-todo-modal-fields grid gap-3";
export const TODO_MODAL_FIELD_CLASS = "grid gap-1 text-xs text-(--rivto-todo-muted-foreground)";
export const TODO_MODAL_TIMESTAMPS_CLASS = "rivto-todo-modal-timestamps mt-3.5 grid gap-1 text-xs text-muted-foreground";
export const TODO_MODAL_CLOSE_CLASS = "rivto-todo-modal-close -mr-1";
export const TODO_STORAGE_CLASS = "rivto-todo-storage";
export const TODO_STORAGE_CONTENT_CLASS = "rivto-todo-storage-content relative w-full";
export const TODO_STORAGE_SUMMARY_CLASS = "rivto-todo-storage-summary flex items-center gap-2";
export const TODO_STORAGE_SUMMARY_STATS_CLASS = "text-xs tabular-nums text-muted-foreground";
export const TODO_STORAGE_TOOLBAR_CLASS = "rivto-todo-storage-toolbar relative z-[100] flex w-full items-center gap-1.5";
export const TODO_STORAGE_DROP_FIELD_CLASS = "rivto-todo-storage-drop-field absolute inset-x-0 top-[34px] mt-2 box-border flex min-h-[54px] cursor-text items-center gap-2.5 rounded-lg border border-dashed border-(--rivto-todo-control-border) bg-background px-3 py-2.5 text-(--rivto-todo-muted-foreground) shadow-[0_1px_2px_rgb(0_0_0/4%)] transition-[border-color,box-shadow] duration-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export const TODO_STORAGE_DROP_ICON_CLASS = "rivto-todo-storage-drop-icon grid size-[19px] shrink-0 place-items-center rounded-full border-2 border-(--rivto-todo-focus) text-(--rivto-todo-accent) [&_svg]:size-3 [&_svg]:stroke-[3]";
export const TODO_STORAGE_DROP_COPY_CLASS = "rivto-todo-storage-drop-copy grid gap-px text-sm leading-[18px] [&_small]:text-[11px] [&_small]:text-muted-foreground";
export const TODO_STORAGE_SEARCH_CLASS = "rivto-todo-storage-search h-7 min-w-[100px] flex-1 px-[7px] py-1 text-sm";
export const TODO_STORAGE_MENU_CLASS = "rivto-todo-storage-menu relative";
export const TODO_STORAGE_MENU_TRIGGER_CLASS = "rivto-todo-storage-menu-trigger h-7 px-[7px] text-xs font-normal data-[state=open]:bg-accent data-[state=open]:text-accent-foreground";
export const TODO_STORAGE_MENU_PANEL_CLASS = "rivto-todo-storage-menu-panel absolute top-[calc(100%+4px)] right-0 z-20 grid w-max min-w-[150px] gap-[7px] rounded-md border border-border bg-popover p-[9px] text-xs text-popover-foreground shadow-md outline-hidden";
export const TODO_STORAGE_FILTER_GROUP_CLASS = "rivto-todo-storage-filter-group m-0 grid gap-[3px] border-0 p-0";
export const TODO_STORAGE_FILTER_LEGEND_CLASS = "mb-0.5 font-semibold text-muted-foreground";
export const TODO_STORAGE_FILTER_OPTION_CLASS = "flex items-center gap-1.5 text-xs font-normal";
export const TODO_STORAGE_CLEAR_CLASS = "rivto-todo-storage-clear h-auto justify-start px-1.5 py-1 text-xs font-normal";
export const TODO_STATUS_ORDER_CLASS = "rivto-todo-storage-status-order grid gap-[3px]";
export const TODO_STATUS_ORDER_ROW_CLASS = "rivto-todo-storage-status-row h-auto justify-start gap-1.5 px-1.5 py-1 text-xs font-normal";
