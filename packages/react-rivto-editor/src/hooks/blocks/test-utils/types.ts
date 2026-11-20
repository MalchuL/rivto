/** Block identity used by the deferred-focus fixture. */
export interface RestoreFocusFixtureProps {
  readonly blockId: string;
}

/** A stale editable reference owned by another occurrence. */
export interface ForeignFocusFixtureProps extends RestoreFocusFixtureProps {
  readonly element: HTMLDivElement;
}

/** Input and transaction state supplied to the text-editing hook fixture. */
export interface TextEditingFixtureProps {
  readonly blockId: string;
  readonly content: string;
  readonly hostKey?: string;
  /**
   * Runs the delivered edit in the fixture's synchronous transaction.
   *
   * @param apply - Applies the current text input.
   * @returns The supplied edit has run.
   */
  runTextInput(apply: () => void): void;
}

/** Panel and surface observed by the editable-root replacement fixture. */
export interface TextEditingScopeProps {
  readonly panel: import("../../../panels/react-panel").ReactPanel;
  readonly surface: HTMLElement;
  readonly children: import("react").ReactNode;
}
