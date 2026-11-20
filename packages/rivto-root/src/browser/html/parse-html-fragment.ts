import type { HtmlElement, HtmlNode } from "../../html/types";

/**
 * Parses detached HTML into plain element and text data without mounting it.
 *
 * Comments and other non-element, non-text nodes are omitted. When a browser
 * parser is unavailable, the caller can choose its own non-HTML fallback.
 *
 * @param html - HTML document or fragment to parse in a detached document.
 * @returns Ordered body children, or undefined when DOMParser is unavailable.
 * @throws Propagates browser parsing and allocation failures.
 */
export function parseHtmlFragment(html: string): readonly HtmlNode[] | undefined {
  if (typeof DOMParser === "undefined") {
    return;
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  return parseChildren(document.body);
}

/**
 * Reads an attribute from the first matching element in detached HTML.
 *
 * @param html - HTML document or fragment to parse without mounting it.
 * @param selector - CSS selector identifying the element to inspect.
 * @param attribute - Attribute name to read from the matching element.
 * @returns The attribute value, or undefined when the element or attribute is absent.
 * @throws If browser parsing is unavailable or the selector is invalid.
 */
export function readHtmlAttribute(
  html: string,
  selector: string,
  attribute: string,
): string | undefined {
  return (
    new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector(selector)
      ?.getAttribute(attribute) ?? undefined
  );
}

/**
 * Copies supported children without retaining browser nodes.
 *
 * @param parent - Browser node whose immediate children are copied.
 * @returns Ordered text and element snapshots; unsupported nodes are omitted.
 */
function parseChildren(parent: Node): HtmlNode[] {
  return [...parent.childNodes].flatMap((node): HtmlNode[] => {
    if (node.nodeType === 3) {
      return [{ type: "text", text: node.textContent ?? "" }];
    }
    if (node.nodeType !== 1) {
      return [];
    }
    const element = node as Element;
    const attributes: Record<string, string> = Object.create(null);
    for (const { name, value } of element.attributes) {
      attributes[name] = value;
    }
    const result: HtmlElement = {
      type: "element",
      tagName: element.tagName,
      attributes,
      children: parseChildren(element),
    };
    return [result];
  });
}
