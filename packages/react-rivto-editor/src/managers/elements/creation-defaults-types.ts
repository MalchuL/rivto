import type { EditorElementFrame } from "@chulane/rivto";

/** Explicit fields reused by subsequent creations; omitted lists remember nothing. */
export interface RememberedElementProperties {
  readonly props?: readonly string[];
  /**
   * Checks complete creation properties before an explicit settings command writes memory.
   *
   * Geometry and content may be absent; document commits use the element validator instead.
   *
   * @param props - Detached merged properties for this scope, including the candidate patch.
   * @returns Completes without mutation when the settings are accepted.
   * @throws If the candidate settings are invalid.
   */
  readonly validate?: (props: Record<string, unknown>) => void;
  readonly frame?: readonly ("width" | "height")[];
}

/** Detached creation settings; geometry never includes position, rotation or identity. */
export interface ElementCreationDefaults {
  readonly props?: Readonly<Record<string, unknown>>;
  readonly frame?: Readonly<Partial<Pick<EditorElementFrame, "width" | "height">>>;
}

/** Selects either one registered type or one registered toolbar group. */
export type CreationDefaultsScope = { readonly type: string } | { readonly group: string };
