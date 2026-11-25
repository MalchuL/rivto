/**
 * Sandboxed iframe that paints authored HTML and exchanges the live node with it.
 *
 * @module
 */
import { HtmlDragHandles } from "./html-drag-handles";
import { useHtmlFrame, type UseHtmlFrameOptions } from "./use-html-frame";

/** Props for one sandboxed HTML document. */
export interface HtmlFrameProps extends UseHtmlFrameOptions {
  /** Accessible title and window name of the iframe. */
  readonly frameName: string;
}

/**
 * Renders authored HTML in a script-capable iframe that cannot reach the parent origin.
 *
 * The sandbox allows scripts and forms but not `allow-same-origin`. Drag regions
 * reported by an interactive document are overlaid as host pointer targets; in
 * a Page block they also act as block-selection anchors.
 *
 * @param props - Frame name plus the {@link useHtmlFrame} options.
 * @returns The iframe and its drag-region overlay inside a positioned container.
 */
export function HtmlFrame({ frameName, ...options }: HtmlFrameProps) {
  const { iframeRef, srcDoc, height, dragRegions } = useHtmlFrame(options);
  const fill = options.fit === "fill";
  return (
    <div
      className={fill ? "html-frame-container html-frame-container-fill" : "html-frame-container"}
    >
      <iframe
        ref={iframeRef}
        className={fill ? "html-surface-frame html-surface-frame-fill" : "html-surface-frame"}
        title={frameName}
        name={frameName}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={fill ? undefined : { height }}
      />
      {options.interactive && (
        <HtmlDragHandles
          regions={dragRegions}
          blockSelectionAnchor={options.node.kind === "block"}
        />
      )}
    </div>
  );
}
