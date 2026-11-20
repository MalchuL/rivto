/** Native text position retained only while the browser computes a caret. */
export interface BrowserTextPosition {
  readonly node: Node;
  readonly offset: number;
}
