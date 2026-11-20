import type { EditorBlockInput, EditorElementInput } from "@chulane/rivto";
import type { HtmlElement, HtmlNode } from "@chulane/rivto-root";
import type { ClipboardContent, ClipboardParseContext, ClipboardParsers } from "./types";

const ignoredTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "TEMPLATE"]);
const blockTags = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE"]);
const containerTags = new Set(["P", "DIV", "UL", "OL", "PRE", "SECTION", "ARTICLE"]);

/**
 * Converts detached HTML data using registered converters and list rules.
 *
 * @param nodes - Parsed body children with no live browser nodes.
 * @param converters - Ordered extension parsers allowed to claim subtrees.
 * @param context - Receiving surface and fallback block type.
 * @returns Parsed content, or undefined when no blocks or elements were produced.
 * @throws If a converter fails or returns canvas elements for Page.
 */
export function parseClipboardHtml(
  nodes: readonly HtmlNode[],
  converters: readonly ClipboardParsers[],
  context: ClipboardParseContext,
): ClipboardContent | undefined {
  return new ClipboardHtmlParser(converters, context).parse(nodes);
}

/** Converts one detached HTML tree without retaining it beyond the parse call. */
class ClipboardHtmlParser {
  private readonly elements: EditorElementInput[] = [];

  /**
   * Captures converter order and receiving-surface policy for one parse.
   *
   * @param converters - Ordered parsers that can consume individual elements.
   * @param context - Receiving surface and fallback block type.
   */
  constructor(
    private readonly converters: readonly ClipboardParsers[],
    private readonly context: ClipboardParseContext,
  ) {}

  /**
   * Visits the supplied body children and collects their converted content.
   *
   * @param nodes - Detached body children in document order.
   * @returns Collected blocks and elements, or undefined if both are empty.
   * @throws If a converter fails or returns canvas elements for Page.
   */
  parse(nodes: readonly HtmlNode[]): ClipboardContent | undefined {
    const blocks: EditorBlockInput[] = [];
    for (const node of nodes) {
      this.visit(node, blocks);
    }
    return blocks.length || this.elements.length ? { blocks, elements: this.elements } : undefined;
  }

  /**
   * Converts a node or recursively visits an unclaimed container.
   *
   * @param node - Detached node to convert.
   * @param destination - Ordered block output receiving this node's content.
   * @param parentTag - Parent element tag, used to identify numbered lists.
   * @returns Converted content is appended to the output arrays.
   * @throws If a registered converter fails or violates the Page output contract.
   */
  private visit(node: HtmlNode, destination: EditorBlockInput[], parentTag?: string): void {
    if (node.type === "text") {
      if (node.text.trim()) {
        destination.push({ type: this.context.defaultBlockType, content: node.text });
      }
      return;
    }
    if (ignoredTags.has(node.tagName) || this.convert(node, destination)) {
      return;
    }
    if (node.tagName === "LI") {
      this.visitListItem(node, destination, parentTag);
      return;
    }
    if (
      blockTags.has(node.tagName) ||
      (node.tagName === "DIV" && !hasDescendant(node, containerTags))
    ) {
      destination.push({ type: this.context.defaultBlockType, content: clipboardHTMLText(node) });
      return;
    }
    for (const child of node.children) {
      this.visit(child, destination, node.tagName);
    }
  }

  /**
   * Gives converters their ordered opportunity to consume one subtree.
   *
   * @param element - Detached subtree presented to each converter.
   * @param destination - Block output receiving a claimed conversion.
   * @returns True when a converter claimed the subtree, including an empty result.
   * @throws If a converter fails or returns canvas elements for Page.
   */
  private convert(element: HtmlElement, destination: EditorBlockInput[]): boolean {
    for (const converter of this.converters) {
      const result = converter.parseHTML?.(element, this.context);
      if (result === undefined) {
        continue;
      }
      if (this.context.surface === "page" && result.elements?.length) {
        throw new Error("Page clipboard parsers must return blocks");
      }
      destination.push(...(result.blocks ?? []));
      this.elements.push(...(result.elements ?? []));
      return true;
    }
    return false;
  }

  /**
   * Converts a list item and preserves its directly nested lists as children.
   *
   * @param element - Detached list item and its descendants.
   * @param destination - Block output receiving the list item.
   * @param parentTag - Parent list tag, if present.
   * @returns The resulting list block is appended to the destination.
   * @throws If a nested converter fails or violates the Page output contract.
   */
  private visitListItem(
    element: HtmlElement,
    destination: EditorBlockInput[],
    parentTag?: string,
  ): void {
    const children: EditorBlockInput[] = [];
    const own = element.children.filter(
      (child) => child.type !== "element" || !["UL", "OL"].includes(child.tagName),
    );
    for (const child of element.children) {
      if (child.type === "element" && ["UL", "OL"].includes(child.tagName)) {
        this.visit(child, children, element.tagName);
      }
    }
    const checkbox = findCheckbox(element);
    const listProps = checkbox
      ? { type: "checkbox", checked: Object.hasOwn(checkbox.attributes, "checked") }
      : { type: parentTag === "OL" ? "numbered_list" : "list" };
    destination.push({
      type: this.context.defaultBlockType,
      content: own.map(clipboardHTMLText).join(""),
      children,
      listProps,
    });
  }
}

/**
 * Reads visible clipboard text, preserving line breaks and ignoring unsafe content.
 *
 * @param node - Detached text or element subtree.
 * @returns Text in document order with HTML line breaks represented as newlines.
 */
export function clipboardHTMLText(node: HtmlNode): string {
  if (node.type === "text") {
    return node.text;
  }
  if (ignoredTags.has(node.tagName)) {
    return "";
  }
  if (node.tagName === "BR") {
    return "\n";
  }
  return node.children.map(clipboardHTMLText).join("");
}

/**
 * Finds whether an element has a descendant with one of the supplied tag names.
 *
 * @param element - Detached subtree whose descendants are searched.
 * @param tags - Uppercase HTML tag names to match.
 * @returns Whether any descendant matches.
 */
function hasDescendant(element: HtmlElement, tags: ReadonlySet<string>): boolean {
  return element.children.some(
    (child) => child.type === "element" && (tags.has(child.tagName) || hasDescendant(child, tags)),
  );
}

/**
 * Finds the first checkbox descendant in document order.
 *
 * @param element - Detached subtree whose descendants are searched.
 * @returns The first checkbox input, or undefined when none exists.
 */
function findCheckbox(element: HtmlElement): HtmlElement | undefined {
  for (const child of element.children) {
    if (child.type !== "element") {
      continue;
    }
    if (child.tagName === "INPUT" && child.attributes.type?.toLowerCase() === "checkbox") {
      return child;
    }
    const nested = findCheckbox(child);
    if (nested) {
      return nested;
    }
  }
  return undefined;
}
