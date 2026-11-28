/**
 * The sandboxed iframe that runs a widget's HTML.
 *
 * @module
 */
import { HtmlEditorPointerTargets } from "./html-editor-pointer-targets";
import { useHtmlFrame, type UseHtmlFrameOptions } from "./use-html-frame";

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
 * For interactive occurrences, transparent targets are laid over the iframe
 * where the widget reports editor pointer regions, so pressing there reaches
 * the surface: on the canvas it selects and moves the element; in a Page block
 * the targets act as block-selection anchors.
 *
 * @param props - HTML source, node snapshot, and frame options.
 * @param props.source - The widget's HTML.
 * @param props.node - Document data posted to the widget as `rivto.node`.
 * @param props.context - Presentation posted to the widget as `rivto.context`.
 * @param props.fit - `auto` grows with the content (Page); `fill` fills the host box (canvas).
 * @param props.limits - Frame limits of the extension installation.
 * @param props.interactive - Whether widget writes and editor pointer targets are enabled.
 * @param props.unsafeAccess - Editor access for an Unsafe HTML block, if any.
 * @param props.onCommand - Receives validated pointer notifications and writes.
 * @returns The iframe and its editor pointer targets inside a positioned container.
 */
export function HtmlFrame(options: UseHtmlFrameOptions) {
  const { iframeRef, srcDoc, height, editorPointerRegions } = useHtmlFrame(options);
  const fill = options.fit === "fill";
  return (
    <div
      className={fill ? "html-frame-container html-frame-container-fill" : "html-frame-container"}
    >
      <iframe
        ref={iframeRef}
        className={fill ? "html-surface-frame html-surface-frame-fill" : "html-surface-frame"}
        sandbox="allow-scripts allow-forms"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={fill ? undefined : { height }}
      />
      {options.interactive && (
        <HtmlEditorPointerTargets
          regions={editorPointerRegions}
          blockSelectionAnchor={options.node.kind === "block"}
        />
      )}
    </div>
  );
}
