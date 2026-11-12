/** @jest-environment ../../../jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@chulane/rivto-page";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { htmlSurfaceExtension } from "./extension";
import { HTML_BLOCK_TYPE } from "./protocol/protocol";

test("separate editors do not share editing state for the same block ID", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  const scrollTo = window.scrollTo;
  window.scrollTo = () => {};
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const cores = await Promise.all([createTestCoreEditor(), createTestCoreEditor()]);
  const panels = cores.map((editor) =>
    createTestReactEditor({ editor, extensions: [htmlSurfaceExtension()] }),
  );
  const containers = cores.map(() => document.body.appendChild(document.createElement("div")));
  const roots = containers.map((container) => createRoot(container));
  let firstUnmounted = false;
  try {
    for (const core of cores) {
      core.blocks.insertBlock({ id: "same-id", type: HTML_BLOCK_TYPE, content: "<p>Widget</p>" });
    }
    act(() => {
      roots.forEach((root, index) =>
        root.render(
          <TestPanel panel={panels[index]}>
            <BlockEditor editor={panels[index].page} />
          </TestPanel>,
        ),
      );
    });
    const edit = containers[0].querySelector<HTMLButtonElement>('button[aria-label="Edit HTML"]');
    expect(edit).not.toBeNull();
    act(() => edit!.click());
    expect(containers[0].querySelector(".html-source-editor")).not.toBeNull();
    expect(containers[1].querySelector(".html-source-editor")).toBeNull();
    act(() => roots[0].unmount());
    firstUnmounted = true;
    expect(containers[1].querySelector('button[aria-label="Edit HTML"]')).not.toBeNull();
  } finally {
    act(() => {
      if (!firstUnmounted) {
        roots[0].unmount();
      }
      roots[1].unmount();
    });
    panels.forEach((panel) => panel.editor.destroy());
    await Promise.all(cores.map((core) => core.destroy()));
    containers.forEach((container) => container.remove());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
    window.scrollTo = scrollTo;
  }
});
