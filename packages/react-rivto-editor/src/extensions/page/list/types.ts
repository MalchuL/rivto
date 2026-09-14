/** Persisted list property contracts interpreted by page list behavior. */

/** Concrete built-in list mode represented by the React list extension. */
export type BlockListType =
  | "list"
  | "checkbox"
  | "numbered_list"
  | "start_numbered_list"
  | "continue_numbered_list";

/** Persisted list patch produced by one recognized text shortcut. */
export type ListShortcutPatch = Readonly<Record<string, unknown>> & {
  readonly type: BlockListType;
  readonly checked: boolean;
};
