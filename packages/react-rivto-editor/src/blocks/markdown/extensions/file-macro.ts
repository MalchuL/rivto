import { parseFileMacros } from "../../../extensions/file/macro/file-macro";

/** Minimal Markdown tree fields read or populated by the file transformer. */
interface MarkdownNode {
  /** Markdown node type. */
  type: string;
  /** Text held by a text node, when present. */
  value?: string;
  /** Link target for generated file nodes. */
  url?: string;
  /** Renderer properties attached to generated nodes. */
  data?: {
    /** HTML properties consumed by the renderer. */
    hProperties?: Record<string, unknown>;
  };
  /** Source position used to locate macro text. */
  position?: {
    /** Source position at the start of the node. */
    start?: {
      /** Offset into the original Markdown string. */
      offset?: number;
    };
  };
  /** Child nodes visited by the transformer. */
  children?: MarkdownNode[];
}

/**
 * Converts canonical file macros into inert nodes rendered by `FileView`.
 *
 * The returned transformer mutates text children in place and attaches source
 * offsets and file metadata for the renderer; missing node offsets use zero.
 *
 * @returns A remark transformer that expands valid macros and preserves other text.
 */
export function remarkFileMacros() {
  return (tree: MarkdownNode): void => {
    // Expand macros in text children in place and visit nested Markdown nodes.
    const visit = (node: MarkdownNode): void => {
      if (!node.children) {
        return;
      }
      // Replace only text children; preserve non-text nodes and traverse their descendants.
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text" || !child.value) {
          return [child];
        }
        const base = child.position?.start?.offset ?? 0;
        const macros = parseFileMacros(child.value);
        if (!macros.length) {
          return [child];
        }
        const result: MarkdownNode[] = [];
        let cursor = 0;
        // Keep surrounding text and attach source offsets to generated links.
        macros.forEach((macro) => {
          if (macro.start > cursor) {
            result.push({ type: "text", value: child.value!.slice(cursor, macro.start) });
          }
          result.push({
            type: "link",
            url: "#",
            children: [{ type: "text", value: macro.name }],
            data: {
              hProperties: {
                "data-rivto-file-uri": macro.uri,
                "data-rivto-file-name": macro.name,
                "data-rivto-file-type": macro.mimeType,
                "data-rivto-file-size": macro.size,
                "data-rivto-file-start": base + macro.start,
                "data-rivto-file-end": base + macro.end,
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
    };
    visit(tree);
  };
}
