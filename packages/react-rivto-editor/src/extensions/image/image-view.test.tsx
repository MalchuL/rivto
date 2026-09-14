/** Regression coverage for the shared image presentation customization API. @module */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createTestReactEditor, TestPanel } from "../../test-utils";
import { createTestCoreEditor } from "../../test-utils";
import { imageExtension } from "./image";
import { ImageView, type ImageHoverMenuProps, type ImageViewKind } from "./image-view";

const IMAGE_RESIZE_CLASS = "rivto-image-resize";

/**
 * Renders a recognizable host-defined image menu.
 *
 * @param props - Shared image state supplied by ImageView.
 * @returns A minimal custom hover action.
 */
function TestHoverMenu({ kind }: ImageHoverMenuProps) {
  return <button type="button">Custom {kind} menu</button>;
}

describe("ImageView", () => {
  test("shares host controls and resize behavior across inline, block, and element images", async () => {
    const editor = await createTestCoreEditor();
    const reactPanel = createTestReactEditor({
      editor,
      extensions: [
        imageExtension({
          views: {
            inline: { resizeMode: "stretch", HoverMenu: TestHoverMenu },
            block: { HoverMenu: TestHoverMenu },
            element: { resizeMode: "stretch", dragResize: true, HoverMenu: TestHoverMenu },
          },
        }),
      ],
    });
    const kinds: readonly ImageViewKind[] = ["inline", "block", "element"];

    /** Renders all persisted image contexts through the public shared component. */
    function Surface() {
      return (
        <>
          {kinds.map((kind) => (
            <ImageView
              key={kind}
              kind={kind}
              uri="data:image/png;base64,"
              alt={kind}
              onChange={() => undefined}
            />
          ))}
        </>
      );
    }

    const markup = renderToStaticMarkup(
      createElement(TestPanel, { panel: reactPanel }, createElement(Surface)),
    );

    expect(markup.match(/data-image-kind=/g)).toHaveLength(3);
    expect(markup.match(/Custom (?:inline|block|element) menu/g)).toHaveLength(3);
    expect(markup.match(/data-resize-mode="stretch"/g)).toHaveLength(2);
    expect(markup.split(IMAGE_RESIZE_CLASS)).toHaveLength(4);

    await reactPanel.editor.destroy();
    await editor.destroy();
  });
});
