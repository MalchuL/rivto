import type { MarkdownExtension } from "../../../blocks/markdown/markdown-extensions";
import { ImageView } from "../view/image-view";
import { remarkImageMacros, replaceImageMacro } from "./image-macro";

/** Image syntax and presentation contributed to Markdown previews. */
export const imageMarkdownExtension: MarkdownExtension = {
  remarkPlugins: [remarkImageMacros],
  plainTextSafe: true,
  components: (components, { blockId, blocks }) => ({
    ...components,
    // Preserve ordinary Markdown images when their source range is unavailable.
    img: ({ node, alt = "", width, height, ...props }) => {
      const properties = node?.properties ?? {};
      const macroUri = properties["data-rivto-image-uri"];
      const uri = typeof macroUri === "string" ? macroUri : props.src;
      const start = Number(properties["data-rivto-image-start"] ?? node?.position?.start.offset);
      const end = Number(properties["data-rivto-image-end"] ?? node?.position?.end.offset);
      if (typeof uri !== "string" || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        return <img {...props} alt={alt} width={width} height={height} />;
      }
      return (
        <ImageView
          kind="inline"
          uri={uri}
          alt={alt}
          width={Number(width) || undefined}
          height={Number(height) || undefined}
          onChange={(patch) => {
            // Apply edits to current content so a stale render does not replace it.
            if (patch.reset && typeof macroUri !== "string") {
              return;
            }
            const current = blocks.getBlockNode(blockId)?.content;
            if (current === undefined) {
              return;
            }
            blocks.updateBlock(blockId, {
              content: replaceImageMacro(
                current,
                { start, end },
                patch.reset
                  ? { uri, alt }
                  : {
                      uri,
                      alt: patch.alt ?? alt,
                      width: patch.width ?? (Number(width) || undefined),
                      height: patch.height ?? (Number(height) || undefined),
                    },
              ),
            });
          }}
        />
      );
    },
  }),
};
