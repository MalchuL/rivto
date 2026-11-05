import type { Components } from "react-markdown";

/**
 * Decorates external Markdown links with their origin's favicon.
 *
 * The previous renderer remains responsible for link behavior and custom links.
 *
 * @param components - Markdown renderers contributed earlier in the pipeline.
 * @returns Renderer set with external-link favicon decoration.
 */
export function linkFaviconComponents(components: Components): Components {
  const Link = typeof components.a === "string" ? undefined : components.a;
  return {
    ...components,
    a: (props) => {
      let favicon: string | undefined;
      try {
        const target = new URL(props.href ?? "");
        if (target.protocol === "http:" || target.protocol === "https:") {
          favicon = new URL("/favicon.ico", target.origin).href;
        }
      } catch {
        // Relative and custom links keep their original presentation.
      }
      if (!favicon || !Link) {
        return Link ? <Link {...props} /> : <a href={props.href}>{props.children}</a>;
      }
      return (
        <Link {...props}>
          <img
            src={favicon}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            referrerPolicy="no-referrer"
          />{" "}
          {props.children}
        </Link>
      );
    },
  };
}
