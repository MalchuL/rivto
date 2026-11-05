/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../../test-utils";
import { createPendingBinaryRead, createTestViewFixture } from "../../../test-view-fixture";
import { imageExtension } from "../image";
import { ImageView } from "./image-view";

test("cancels a pending image copy when its view unmounts", async () => {
  const fixture = await createTestViewFixture();
  const { panel, container, root } = fixture;
  const { provider, signals } = createPendingBinaryRead({ skipFirstRead: true });
  const remove = panel.editor.extensions.install(imageExtension({ provider }));
  const removeWriter = panel.editor.clipboard.registerWriter({
    id: "test-writer",
    // Accept the fixture MIME type so copying reaches the pending read.
    supports: () => true,
    // Wait for the provider read so cancellation remains observable.
    write: async ({ data }) => {
      await data;
    },
  });
  try {
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <ImageView kind="inline" uri="data:image/png;base64,AA==" alt="image" />
        </TestPanel>,
      );
    });
    await act(async () => {
      container
        .querySelector(".rivto-image-frame")!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('.rivto-image-context-menu [role="menuitem"]')!
        .click();
    });
    expect(signals).toHaveLength(1);
    await act(async () => {
      document
        .querySelector('.rivto-image-context-menu[role="menu"]')!
        .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(signals[0]?.aborted).toBe(false);
    await act(async () => root.unmount());
    expect(signals[0]?.aborted).toBe(true);
  } finally {
    await fixture.dispose(() => {
      removeWriter();
      remove();
    });
  }
});
