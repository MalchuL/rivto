import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

/**
 * Supplies deterministic client geometry for a mounted fixture element.
 *
 * @param left - Left edge in client pixels.
 * @param top - Top edge in client pixels.
 * @param width - Width in client pixels.
 * @param height - Height in client pixels.
 * @returns Rectangle matching the requested fixture dimensions.
 */
const bounds = (left: number, top: number, width: number, height: number) => ({
  x: left,
  y: top,
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  toJSON: () => ({}),
});

it("returns gap metadata without exposing neighboring DOM registrations", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.setNode("parent", { childIds: ["a", "b"] });
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  const host = document.createElement("div");
  const previous = document.createElement("div");
  const next = document.createElement("div");
  previous.dataset.blockId = "a";
  host.append(previous, next);
  root.append(host);
  document.body.append(root);
  jest.spyOn(host, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 400, 400));
  jest.spyOn(previous, "getBoundingClientRect").mockReturnValue(bounds(0, 0, 200, 100));
  jest.spyOn(next, "getBoundingClientRect").mockReturnValue(bounds(220, 0, 200, 100));
  const destination = {
    kind: "between",
    parentId: "parent",
    previousId: "a",
    nextId: "b",
  } as const;
  const first = {
    identity: getBrowserElementIdentity(previous),
    getRegions: () => [{ kind: "edge" as const, side: "inline-end" as const, destination }],
  };
  const second = {
    identity: getBrowserElementIdentity(next),
    getRegions: () => [{ kind: "edge" as const, side: "inline-start" as const, destination }],
  };
  editor.dropTargets.register(first);
  editor.dropTargets.register(second);
  editor.dropTargets.registerLayout({
    identity: getBrowserElementIdentity(host),
    axis: "grid",
    gaps: true,
    getItems: () => [first, second],
  });
  attachTestRoot(editor, root);
  try {
    const target = editor.dropTargets.resolve(210, 50, undefined, captureTestInputHit(host));
    expect(target?.destination).toEqual(destination);
    expect(target?.region).toEqual({ kind: "gap", axis: "horizontal" });
    expect(target?.indicator).toBeDefined();
  } finally {
    editor.destroy();
    root.remove();
    jest.restoreAllMocks();
  }
});
