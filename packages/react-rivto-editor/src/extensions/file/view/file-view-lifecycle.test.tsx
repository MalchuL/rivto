/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../../test-utils";
import { createTestViewFixture } from "../../../test-view-fixture";
import { fileExtension } from "../file";
import { RegisteredFileView } from "./file-view";
import type { ReactEditorExtension } from "../../../managers/extensions/types";

const provider = { write: async () => "data:text/plain,file", read: async () => undefined };

/** Rich inline file renderer installed by the lifecycle test. */
const richFileExtension: ReactEditorExtension = {
  id: "rich-text-file",
  /**
   * Registers the rich text-file view for this fixture.
   *
   * @param editor - Runtime that owns the handler registration.
   * @returns Registers the handler until the extension is removed.
   */
  setup(editor) {
    editor.clipboard.registerFileHandler({
      id: "rich-text-file",
      provider,
      matches: ({ reference }) => reference.mimeType === "text/plain",
      prepare: () => ({ kind: "inline", content: "rich" }),
      InlineView: () => <span>Rich file</span>,
    });
  },
};

test("updates mounted inline files when rich handlers are installed and removed", async () => {
  const fixture = await createTestViewFixture();
  const { panel, container, root } = fixture;
  const removeFile = panel.editor.extensions.install(fileExtension({ provider }));
  let removeRich: (() => void) | undefined;
  let removeDirect: (() => void) | undefined;
  try {
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <RegisteredFileView
            reference={{ uri: "data:text/plain,file", name: "notes.txt", mimeType: "text/plain" }}
          />
        </TestPanel>,
      );
    });
    expect(container.querySelector('[aria-label="Open file notes.txt"]')).not.toBeNull();
    await act(async () => {
      removeRich = panel.editor.extensions.install(richFileExtension);
    });
    expect(container.textContent).toContain("Rich file");
    await act(async () => removeRich?.());
    expect(container.querySelector('[aria-label="Open file notes.txt"]')).not.toBeNull();
    await act(async () => {
      removeDirect = panel.editor.clipboard.registerFileHandler({
        id: "direct-file",
        provider,
        prepare: () => ({ kind: "inline", content: "direct" }),
        InlineView: () => <span>Default file</span>,
      });
      panel.editor.clipboard.setDefaultFileHandler("direct-file");
    });
    expect(container.textContent).toContain("Default file");
    await act(async () => panel.editor.clipboard.setDefaultFileHandler("file"));
    expect(container.querySelector('[aria-label="Open file notes.txt"]')).not.toBeNull();
  } finally {
    await fixture.dispose(() => {
      removeRich?.();
      removeDirect?.();
      removeFile();
    });
  }
});
