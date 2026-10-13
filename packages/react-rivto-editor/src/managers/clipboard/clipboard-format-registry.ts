import type { ClipboardBundle, EditorBlock, EditorBlockInput, EditorElementNode, EditorElementInput } from "@chulane/rivto";
import type { RegistrationOwner } from "../extensions/types";
import type { ClipboardContent, ClipboardFormatter, ClipboardParseContext, ClipboardParser, PortableBlockFormats } from "./types";
import type { ClipboardConverters } from "./clipboard-converters";

/** Escapes text before including it in exported clipboard HTML. */
export const escapeClipboardHTML = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

/** Ordered React-owned portable clipboard contributions. */
export class ClipboardFormatRegistry {
  private readonly formatters: ClipboardFormatter[] = [];
  private readonly parsers: ClipboardParser[] = [];

  /**
   * Creates the React-owned formatter and parser registry.
   * @param registrations - Extension lifecycle owning registered contributions.
   * @param converters - Optional runtime type converters applied before general formatting.
   */
  constructor(private readonly registrations: RegistrationOwner, private readonly converters?: ClipboardConverters) {}

  /**
   * Appends a formatter to the ordered, composable formatting pipeline.
   *
   * @param formatter - Stable formatter definition to register.
   * @returns An idempotent disposer owned by the active extension lifecycle.
   * @throws {Error} When the formatter ID is empty, already registered, or the owner is destroyed.
   */
  registerFormatter(formatter: ClipboardFormatter): () => void {
    this.registrations.assertActive();
    if (!formatter.id || this.formatters.some(({ id }) => id === formatter.id)) {
      throw new Error(`Clipboard formatter ${formatter.id || "<empty>"} is already registered`);
    }
    this.formatters.push(formatter);
    return this.registrations.registerCleanup(() => {
      const index = this.formatters.indexOf(formatter);
      if (index >= 0) this.formatters.splice(index, 1);
    });
  }

  /**
   * Appends a parser to the first-match parsing pipeline.
   *
   * @param parser - Stable parser definition to register.
   * @returns An idempotent disposer owned by the active extension lifecycle.
   * @throws {Error} When the parser ID is empty, already registered, or the owner is destroyed.
   */
  registerParser(parser: ClipboardParser): () => void {
    this.registrations.assertActive();
    if (!parser.id || this.parsers.some(({ id }) => id === parser.id)) {
      throw new Error(`Clipboard parser ${parser.id || "<empty>"} is already registered`);
    }
    this.parsers.push(parser);
    return this.registrations.registerCleanup(() => {
      const index = this.parsers.indexOf(parser);
      if (index >= 0) this.parsers.splice(index, 1);
    });
  }

  /**
   * Formats a detached block forest through every applicable formatter.
   *
   * Children are visited recursively and appended to their parent's resulting
   * formats. The supplied blocks are never mutated.
   *
   * @param blocks - Ordered root block subtrees to serialize.
   * @returns Composed plain-text, Markdown, and HTML representations.
   */
  format(blocks: readonly EditorBlock[]): PortableBlockFormats {
    const visit = (siblings: readonly EditorBlock[], depth: number): PortableBlockFormats => {
      const items = siblings.map((block, index) => {
        const children = visit(block.children, depth + 1);
        const indent = "  ".repeat(depth);
        const ownPlain = block.content.split(/\r\n?|\n/).map((line) => indent + line).join("\n");
        const ownHtml = `<p>${escapeClipboardHTML(block.content).replace(/\r\n?|\n/g, "<br>")}</p>`;
        const context = { block, siblings, index, depth, children };
        let current: PortableBlockFormats = {
          plain: children.plain ? `${ownPlain}\n${children.plain}` : ownPlain,
          markdown: children.markdown ? `${ownPlain}\n${children.markdown}` : ownPlain,
          html: ownHtml + children.html,
        };
        current = this.converters?.blocks.get(block.type)?.format?.(context, current) ?? current;
        this.formatters.forEach((formatter) => {
          if (formatter.matches?.(context) !== false) current = formatter.format(context, current);
        });
        return current;
      });
      return {
        plain: items.map(({ plain }) => plain).join("\n"),
        markdown: items.map(({ markdown }) => markdown).join("\n"),
        html: items.map(({ html }) => html).join(""),
      };
    };
    return visit(blocks, 0);
  }

  /**
   * Parses external clipboard flavors with the first parser that matches.
   *
   * @param data - Available HTML and plain-text clipboard values.
   * @returns Parsed block inputs from the first match, or `undefined` when no
   * registered parser accepts the data.
   */
  parse(data: { readonly html: string; readonly text: string }): EditorBlockInput[] | undefined {
    for (const parser of this.parsers) {
      const blocks = parser.parse(data);
      if (blocks) return blocks;
    }
    return undefined;
  }
  /**
   * Formats a canvas subtree, reusing block formatters for referenced block content.
   * @param element - Detached subtree root included in the bundle.
   * @param bundle - Source records and blocks used to resolve children and references.
   * @param includedBlocks - IDs already formatted; updated to prevent repeated block output.
   * @returns Plain text, Markdown and HTML; an unknown leaf type contributes empty strings.
   */
  formatElement(element: EditorElementNode, bundle: ClipboardBundle, includedBlocks = new Set<string>()): PortableBlockFormats {
    const byId = new Map(bundle.elements?.map(node => [node.id, node]));
    const seen = new Set<string>();
    const visit = (node: EditorElementNode): PortableBlockFormats => {
      if (seen.has(node.id)) return emptyFormats();
      seen.add(node.id);
      const children = joinFormats(node.childIds.flatMap(id => { const child = byId.get(id); return child ? [visit(child)] : []; }));
      const converter = this.converters?.elements.get(node.type);
      const ids = new Set(converter?.getReferencedBlockIds?.(node, bundle.blocks.map(block => block.id)) ?? []);
      const blocks = this.format(bundle.blocks.filter(block => {
        if (!ids.has(block.id) || includedBlocks.has(block.id)) return false;
        includedBlocks.add(block.id); return true;
      }));
      return converter?.format?.({ element: node, children, blocks }, children) ?? children;
    };
    return visit(element);
  }

  /**
   * Formats selected canvas roots and remaining blocks once, preserving their source order.
   * @param bundle - Detached clipboard payload with optional selected element IDs.
   * @returns Plain text, Markdown and HTML composed from registered type and list formatters.
   */
  formatBundle(bundle: ClipboardBundle): PortableBlockFormats {
    if (!bundle.elements?.length) return this.format(bundle.blocks);
    const nodes = new Map(bundle.elements.map(node => [node.id, node]));
    const selected = new Set(bundle.selectedElementIds ?? [...nodes.keys()]);
    const parents = new Map(bundle.elements.flatMap(node => node.childIds.map(id => [id, node.id] as const)));
    const hasSelectedAncestor = (id: string): boolean => {
      let parent = parents.get(id);
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) {
        if (selected.has(parent)) return true;
        seen.add(parent);
        parent = parents.get(parent);
      }
      return false;
    };
    const included = new Set<string>();
    const formats = [...selected].filter(id => !hasSelectedAncestor(id)).flatMap(id => {
      const node = nodes.get(id); return node ? [this.formatElement(node, bundle, included)] : [];
    });
    formats.push(this.format(bundle.blocks.filter(block => !included.has(block.id))));
    return joinFormats(formats);
  }

  /**
   * Parses portable clipboard content without mounting external markup.
   * Whole-buffer parsers run first; type parsers then claim individual HTML subtrees.
   * Unclaimed containers preserve their children, while scripts and embedded documents are ignored.
   * @param data - Available HTML and plain-text flavors.
   * @param context - Receiving surface and writing-block fallback.
   * @returns Detached block/element inputs, or undefined when only ordinary plain text remains.
   */
  parseContent(data: { readonly html: string; readonly text: string }, context: ClipboardParseContext): ClipboardContent | undefined {
    const whole = this.parse(data);
    if (whole) return { blocks: whole };
    const converters = this.converters?.getParsers() ?? [];
    if (data.html && typeof DOMParser !== "undefined") {
      const document = new DOMParser().parseFromString(data.html, "text/html");
      const blocks: EditorBlockInput[] = [];
      const elements: EditorElementInput[] = [];
      const visit = (node: Node, destination: EditorBlockInput[]): void => {
        if (node.nodeType === 3) {
          const content = node.textContent ?? "";
          if (content.trim()) destination.push({ type: context.defaultBlockType, content });
          return;
        }
        if (node.nodeType !== 1) return;
        const element = node as Element;
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "TEMPLATE"].includes(element.tagName)) return;
        for (const converter of converters) {
          const result = converter.parseHTML?.(element, context);
          if (result === undefined) continue;
          if (context.surface === "page" && result.elements?.length) throw new Error("Page clipboard parsers must return blocks");
          destination.push(...result.blocks ?? []); elements.push(...result.elements ?? []); return;
        }
        if (element.tagName === "LI") {
          const children: EditorBlockInput[] = [];
          const own = [...element.childNodes].filter(child => !(child.nodeType === 1 && ["UL", "OL"].includes((child as Element).tagName)));
          const content = own.map(clipboardHTMLText).join("");
          for (const child of [...element.children]) if (["UL", "OL"].includes(child.tagName)) visit(child, children);
          const checkbox = element.querySelector('input[type="checkbox"]');
          const listProps = checkbox ? { type: "checkbox", checked: checkbox.hasAttribute("checked") }
            : { type: element.parentElement?.tagName === "OL" ? "numbered_list" : "list" };
          destination.push({ type: context.defaultBlockType, content, children, listProps }); return;
        }
        if (["P", "H1", "H2", "H3", "H4", "H5", "H6", "PRE"].includes(element.tagName)
          || (element.tagName === "DIV" && !element.querySelector("p,div,ul,ol,pre,section,article"))) {
          destination.push({ type: context.defaultBlockType, content: clipboardHTMLText(element) }); return;
        }
        [...element.childNodes].forEach(child => visit(child, destination));
      };
      [...document.body.childNodes].forEach(node => visit(node, blocks));
      if (blocks.length || elements.length) return { blocks, elements };
    }
    for (const converter of converters) {
      const result = converter.parseText?.(data.text, context);
      if (result !== undefined) return result;
    }
    return undefined;
  }

}

function emptyFormats(): PortableBlockFormats { return { plain: "", markdown: "", html: "" }; }
function joinFormats(items: readonly PortableBlockFormats[]): PortableBlockFormats {
  return { plain: items.map(item => item.plain).filter(Boolean).join("\n"),
    markdown: items.map(item => item.markdown).filter(Boolean).join("\n"), html: items.map(item => item.html).join("") };
}

/** Reads detached HTML text, preserving line breaks and ignoring executable or embedded content. */
export function clipboardHTMLText(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? "";
  if (node.nodeType !== 1) return "";
  const element = node as Element;
  if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "TEMPLATE"].includes(element.tagName)) return "";
  if (element.tagName === "BR") return "\n";
  return [...node.childNodes].map(clipboardHTMLText).join("");
}
