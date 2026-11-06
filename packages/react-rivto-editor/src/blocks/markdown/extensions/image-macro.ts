import { parseImageMacros } from "../../../extensions/image/macro/image-macro";

/** Minimal Markdown tree fields read or populated by the image transformer. */
interface MarkdownNode {
  /** Markdown node type. */
  type: string;
  /** Text held by a text node, when present. */
  value?: string;
  /** Image source for generated nodes. */
  url?: string;
  /** Alternative text for generated images. */
  alt?: string;
  /** Renderer properties attached to generated nodes. */
  data?: {
    /** HTML properties consumed by the renderer. */
    hProperties?: Record<string, unknown>;
  };
  /** Source range used to locate and edit macro text. */
  position?: {
    /** Source position at the start of the node. */
    start?: {
      /** Inclusive offset into the original Markdown string. */
      offset?: number;
    };
    /** Source position at the end of the node. */
    end?: {
      /** Exclusive offset into the original Markdown string. */
      offset?: number;
    };
  };
  /** Child nodes visited by the transformer. */
  children?: MarkdownNode[];
}

/**
 * Rejoins image macro text split by Markdown's automatic URL linking.
 *
 * Only automatic links fully contained in a valid macro are rejoined; other
 * links retain their original nodes and behavior.
 *
 * @param children - Adjacent Markdown nodes in their original source order.
 * @returns Nodes with split image macros restored to text for macro parsing.
 */
function joinImageMacroLinks(children: MarkdownNode[]): MarkdownNode[] {
  const result: MarkdownNode[] = [];
  for (let index = 0; index < children.length; index += 1) {
    const first = children[index]!;
    if (first.type !== "text" || !first.value?.includes("{{image")) {
      result.push(first);
      continue;
    }
    let value = first.value;
    const macroStart = value.lastIndexOf("{{image");
    let end = index;
    const links: number[] = [];
    while (value.indexOf("}}", macroStart) < 0 && end + 1 < children.length) {
      const next = children[end + 1]!;
      if (next.type === "text" && next.value !== undefined) {
        value += next.value;
      } else if (
        next.type === "link" &&
        typeof next.url === "string" &&
        next.children?.length === 1 &&
        next.children[0]?.type === "text" &&
        next.children[0].value === next.url
      ) {
        links.push(value.length);
        value += next.url;
      } else {
        break;
      }
      end += 1;
    }
    const macros = parseImageMacros(value);
    if (
      links.length &&
      links.every((offset) => macros.some((macro) => macro.start < offset && offset < macro.end))
    ) {
      result.push({ ...first, value });
      index = end;
    } else {
      result.push(first);
    }
  }
  return result;
}

/**
 * Converts macro text nodes into ordinary Markdown image nodes with edit metadata.
 *
 * The returned transformer mutates the supplied tree. Source offsets are
 * attached to each generated node for later edits; missing node offsets use zero.
 *
 * @returns A remark transformer that expands valid macros and preserves other text.
 */
export function remarkImageMacros() {
  return (tree: MarkdownNode): void => {
    // Expand macros in text children in place and visit nested Markdown nodes.
    const visit = (node: MarkdownNode): void => {
      if (node.children) {
        // Replace only text children; preserve non-text nodes and traverse their descendants.
        node.children = joinImageMacroLinks(node.children).flatMap((child) => {
          if (child.type !== "text" || !child.value) {
            return [child];
          }
          const base = child.position?.start?.offset ?? 0;
          const macros = parseImageMacros(child.value);
          if (!macros.length) {
            return [child];
          }
          const result: MarkdownNode[] = [];
          let cursor = 0;
          // Keep surrounding text and attach source offsets to generated images.
          macros.forEach((macro) => {
            if (macro.start > cursor) {
              result.push({ type: "text", value: child.value!.slice(cursor, macro.start) });
            }
            result.push({
              type: "image",
              url: macro.uri,
              alt: macro.alt ?? "",
              data: {
                hProperties: {
                  "data-rivto-image-uri": macro.uri,
                  "data-rivto-image-start": base + macro.start,
                  "data-rivto-image-end": base + macro.end,
                  ...(macro.width ? { width: macro.width } : {}),
                  ...(macro.height ? { height: macro.height } : {}),
                },
              },
            });
            cursor = macro.end;
          });
          if (cursor < child.value.length) {
            result.push({ type: "text", value: child.value.slice(cursor) });
          }
          return result;
        });
        node.children.forEach(visit);
      }
    };
    visit(tree);
  };
}
