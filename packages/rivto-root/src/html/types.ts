/** A detached text node parsed from HTML. */
export interface HtmlText {
  readonly type: "text";
  readonly text: string;
}

/** A detached HTML element and its ordered descendants. */
export interface HtmlElement {
  readonly type: "element";
  /** Browser-parsed tag name, normally uppercase for HTML elements. */
  readonly tagName: string;
  /** Browser-parsed attribute names and values. */
  readonly attributes: Readonly<Record<string, string>>;
  /** Text and element children in document order. */
  readonly children: readonly HtmlNode[];
}

/** Text or element data parsed from an HTML fragment. */
export type HtmlNode = HtmlText | HtmlElement;
