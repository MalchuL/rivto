/** Insertion or movement relative to a panel, resolved to real document placement before writing. */
export type PanelDestination =
  | { readonly root: true; readonly beforeId?: string }
  | { readonly parentId: string; readonly beforeId?: string };
