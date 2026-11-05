import type { MarkdownExtension } from "../markdown-extensions";
import { RegisteredFileView } from "../../../extensions/file/view/file-view";
import { remarkFileMacros } from "./file-macro";

/** Markdown syntax contributed by the optional file extension. */
export const fileMarkdownExtension: MarkdownExtension = {
  remarkPlugins: [remarkFileMacros],
  plainTextSafe: true,
  components: (components) => {
    const Link = typeof components.a === "string" ? undefined : components.a;
    return {
      ...components,
      // Render file macro links through the registered attachment view.
      a: ({ node, href = "", ...props }) => {
        const properties = node?.properties ?? {};
        const uri = properties["data-rivto-file-uri"];
        const name = properties["data-rivto-file-name"];
        const mimeType = properties["data-rivto-file-type"];
        if (typeof uri === "string" && typeof name === "string" && typeof mimeType === "string") {
          const size = Number(properties["data-rivto-file-size"]);
          return (
            <RegisteredFileView
              reference={{
                uri,
                name,
                mimeType,
                size: Number.isSafeInteger(size) ? size : undefined,
              }}
            />
          );
        }
        return Link ? <Link node={node} href={href} {...props} /> : <a href={href} {...props} />;
      },
    };
  },
};
