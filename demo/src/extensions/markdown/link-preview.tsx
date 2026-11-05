import type { ReactEditorExtension } from "@chulane/rivto-react";

/**
 * Demonstrates a Markdown link renderer contributed by a host extension.
 *
 * The example is deterministic and does not fetch remote metadata. Other links
 * retain the renderer supplied by the editor and earlier contributions.
 *
 * @returns Extension that recognizes the unified project website.
 */
export function linkPreviewExtension(): ReactEditorExtension {
  return {
    id: "demo.markdown-link-preview",
    setup: (editor) => {
      editor.markdown.register({
        plainTextSafe: true,
        components: (components) => {
          const Link = typeof components.a === "string" ? undefined : components.a;
          return {
            ...components,
            a: (props) => {
              if (props.href === "https://unifiedjs.com/" && Link) {
                return (
                  <span className="demo-link-preview">
                    <Link {...props} /> <small>Markdown processing ecosystem</small>
                  </span>
                );
              }
              return Link ? <Link {...props} /> : <a href={props.href}>{props.children}</a>;
            },
          };
        },
      });
    },
  };
}
