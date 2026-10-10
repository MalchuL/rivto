import type { RivtoEditorApi } from "@chulane/rivto";
import type { BlockRenderer, KeymapOverrides, ReactEditorExtension } from "../managers/index";

/** Creation options for the React presentation runtime. */
export interface CreateEditorRuntimeOptions {
  /** Existing fixed document editor; the caller or EditorStorage owns its destruction. */
  readonly editor: RivtoEditorApi;
  /** Functional extensions installed synchronously in declaration order. */
  readonly extensions?: readonly ReactEditorExtension[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Renderer used for persisted block types unknown to this React runtime. */
  readonly unknownBlockRenderer?: BlockRenderer;
}

