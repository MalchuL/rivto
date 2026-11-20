import { BlockLayoutRegions } from "../../../presentation/components/block-layout/block-layout-regions";
import { BlockPointerHitTest } from "../block-pointer-hit-test";
import { BlockVirtualizationRegistry } from "../../virtualization/block-virtualization-registry";
import { BlockDOMSelection } from "../block-dom-selection";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

it("invalidates a captured text gesture after the same occurrence root is remounted", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML = '<div data-block-id="block"><div data-block-content>Text</div></div>';
  document.body.append(root);
  const content = root.querySelector<HTMLElement>("[data-block-content]")!;
  const hitDescriptor = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const rangeDescriptor = Object.getOwnPropertyDescriptor(document, "caretRangeFromPoint");
  const hit = jest.fn(() => content);
  const range = document.createRange();
  range.setStart(content.firstChild!, 1);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hit });
  Object.defineProperty(document, "caretRangeFromPoint", {
    configurable: true,
    value: () => range,
  });
  const selection = new BlockDOMSelection(
    {
      getSelectableBlockIds: () => [],
      getTextLength: () => 0,
    },
    new BlockVirtualizationRegistry(),
  );
  const firstRoot = new BrowserInputRoot(root);
  const secondRoot = new BrowserInputRoot(root);
  try {
    expect(selection.createTextSelectionGesture()).toBeUndefined();
    const detach = selection.attach(
      new BlockPointerHitTest(firstRoot, new BlockLayoutRegions()),
      firstRoot,
    );
    const gesture = selection.createTextSelectionGesture()!;
    expect(gesture.readAnchor(1, 2)).toEqual({ blockId: "block", offset: 1 });
    gesture.readHead(2, 3);
    gesture.commitHead(true);
    detach();
    const detachAgain = selection.attach(
      new BlockPointerHitTest(secondRoot, new BlockLayoutRegions()),
      secondRoot,
    );
    expect(gesture.readAnchor(1, 2)).toBeUndefined();
    expect(gesture.hasHead()).toBe(false);
    gesture.restore();
    expect(hit).toHaveBeenCalledTimes(2);
    expect(selection.createTextSelectionGesture()).toBeDefined();
    detachAgain();
  } finally {
    firstRoot.detach();
    secondRoot.detach();
    root.remove();
    if (hitDescriptor) {
      Object.defineProperty(document, "elementFromPoint", hitDescriptor);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    if (rangeDescriptor) {
      Object.defineProperty(document, "caretRangeFromPoint", rangeDescriptor);
    } else {
      Reflect.deleteProperty(document, "caretRangeFromPoint");
    }
  }
});
