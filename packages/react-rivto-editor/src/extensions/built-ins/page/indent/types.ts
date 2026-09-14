/** Configuration accepted by the page indentation extension. */

/** Shortcut overrides for structural indentation. */
export interface IndentExtensionOptions {
  /** Bindings that indent the active block or eligible sibling selection. */
  readonly indentKeys?: readonly string[];
  /** Bindings that outdent while preserving the selected subtree structure. */
  readonly outdentKeys?: readonly string[];
}
