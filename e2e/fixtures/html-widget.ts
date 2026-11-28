import type { Frame, Locator, Page } from "@playwright/test";
import type { DocumentEditorAPI } from "@chulane/rivto";
import { blockIdSelector } from "../dom-markers";

/**
 * Resolves a seeded HTML widget to its existing block or element DOM identity.
 *
 * @param page - Demo page with an active editor.
 * @param sample - Value of the sample property used by the demo seed.
 * @param kind - Model collection containing the widget. Defaults to blocks.
 * @returns The locator for the node's mounted occurrence.
 * @throws If the demo document has no matching sample.
 */
export async function htmlSample(
  page: Page,
  sample: string,
  kind: "block" | "element" = "block",
): Promise<Locator> {
  await page.waitForFunction(() => "__rivtoDemo" in window);
  const id = await page.evaluate(
    ({ sample, kind }) => {
      const { editor } = (window as unknown as { __rivtoDemo: { editor: DocumentEditorAPI } })
        .__rivtoDemo;
      const nodes =
        kind === "block" ? editor.blocks.getBlocks() : editor.elements.getElementNodes();
      return nodes.find((node) => node.props.sample === sample)?.id;
    },
    { sample, kind },
  );
  if (!id) {
    throw new Error(`Missing HTML ${kind} sample: ${sample}`);
  }
  return page.locator(
    kind === "block" ? blockIdSelector(id) : `[data-edgeless-object-id=${JSON.stringify(id)}]`,
  );
}

/**
 * Gets the current browser Frame for one iframe locator.
 *
 * @param iframe - Locator resolving to the iframe in the desired node occurrence.
 * @returns The frame attached to the located iframe.
 * @throws If the element is unavailable or has no frame.
 */
export async function attachedFrame(iframe: Locator): Promise<Frame> {
  const element = await iframe.elementHandle();
  try {
    const frame = await element.contentFrame();
    if (!frame) {
      throw new Error("Missing HTML widget frame");
    }
    return frame;
  } finally {
    await element.dispose();
  }
}
