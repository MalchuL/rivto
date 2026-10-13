import type { EditorElementFrame, EditorElementNode } from '../../editor/model';

/** Persisted element properties and optional type-specific geometry behavior. */
export interface ElementDefinition {
  readonly type: string;
  readonly defaults?: Readonly<Record<string, unknown>>;
  /** Validates and normalizes merged properties; throw before mutation on invalid input. */
  readonly validate?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Returns property changes needed for an explicit frame update, such as scaled drawing points. */
  readonly resize?: (element: EditorElementNode, frame: EditorElementFrame) => Record<string, unknown>;
}
