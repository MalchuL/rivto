/**
 * The sandboxed iframe that runs a widget's HTML.
 *
 * @module
 */
import { HtmlDragHandles } from "./html-drag-handles";
import { useHtmlFrame, type UseHtmlFrameOptions } from "./use-html-frame";

/** Props for {@link HtmlFrame}: the frame name plus everything {@link useHtmlFrame} needs. */
export interface HtmlFrameProps extends UseHtmlFrameOptions {
  /** Accessible title and window name of the iframe. Tests locate frames by it. */
  readonly frameName: string;
}

/**
 * Runs a widget's HTML in a sandboxed iframe.
 *
 * The sandbox allows scripts and forms but not `allow-same-origin`, so the
 * widget cannot read the editor's DOM, cookies or storage. It talks to the
 * editor only through the message bridge (`window.rivto`).
 *
 * The page is rebuilt only when the source or sizing changes; node updates
 * are posted into the running page, so widget state such as a running timer
 * is not reset.
 *
 * For interactive occurrences, transparent drag handles are laid over the
 * iframe where the widget reports background areas, so pressing there moves
 * the block or element. In a Page block they also act as block-selection
 * anchors.
 *
 * @param props - Frame name plus the {@link useHtmlFrame} options.
 * @param props.frameName - Accessible title and window name of the iframe.
 * @param props.source - The widget's HTML.
 * @param props.node - Document data posted to the widget as `rivto.node`.
 * @param props.context - Presentation posted to the widget as `rivto.context`.
 * @param props.fit - `auto` grows with the content (Page); `fill` fills the host box (canvas).
 * @param props.limits - Frame limits of the extension installation.
 * @param props.interactive - Whether widget writes and drag handles are enabled.
 * @param props.unsafeAccess - Editor access for an Unsafe HTML block, if any.
 * @param props.onCommand - Receives validated pointer notifications and writes.
 * @returns The iframe and its drag handles inside a positioned container.
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
