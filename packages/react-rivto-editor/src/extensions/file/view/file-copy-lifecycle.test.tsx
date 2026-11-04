/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../../test-utils";
import { createPendingBinaryRead, createTestViewFixture } from "../../../test-view-fixture";
import { fileExtension } from "../file";
import { FileView } from "./file-view";

test("cancels an in-flight copy when the mounted file reference changes", async () => {
  const fixture = await createTestViewFixture();
  const { panel, container, root } = fixture;
  const { provider, signals } = createPendingBinaryRead();
  const remove = panel.editor.extensions.install(fileExtension({ provider }));
  const removeWriter = panel.editor.clipboard.registerWriter({
    id: "test-writer",
    supports: () => true,
    write: async ({ data }) => {
      await data;
    },
  });
  try {
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <FileView uri="test:first" name="first.txt" mimeType="text/plain" />
        </TestPanel>,
      );
    });
    await act(async () => {
      container
        .querySelector(".rivto-file")!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent === "Copy file")!
        .click();
    });
    expect(signals).toHaveLength(1);
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <FileView uri="test:second" name="second.txt" mimeType="text/plain" />
        </TestPanel>,
      );
    });
    expect(signals[0]?.aborted).toBe(true);
  } finally {
    await fixture.dispose(() => {
      removeWriter();
      remove();
    });
  }
});
