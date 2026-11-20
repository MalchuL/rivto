import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockEditorEvents } from "../block-editor-events";

it("delivers pointer-down through normalized listeners with the current mounted root", () => {
  const owner = {
    /**
     * Keeps the test owner active.
     *
     * @returns Registration is allowed.
     */
    assertActive() {},
    /**
     * Retains the registration disposer for the test.
     *
     * @param release - Registration cleanup.
     * @returns The same cleanup callback.
     */
    registerCleanup(release: () => void) {
      return release;
    },
  };
  const dispatcher = new BlockEditorEvents(owner);
  const seen: object[] = [];
  dispatcher.register("pointer", { type: "pointerdown", priority: 0 }, (event) => {
    seen.push(event.root);
    return "continue";
  });
  const first = document.createElement("div");
  const second = document.createElement("div");
  const firstRoot = new BrowserInputRoot(first);
  const secondRoot = new BrowserInputRoot(second);
  const observeFirst = jest.spyOn(firstRoot, "createInputObserver");
  const observeSecond = jest.spyOn(secondRoot, "createInputObserver");
  const detachFirst = dispatcher.attach(firstRoot);
  first.dispatchEvent(new Event("pointerdown"));
  detachFirst();
  const detachSecond = dispatcher.attach(secondRoot);
  detachFirst();
  first.dispatchEvent(new Event("pointerdown"));
  second.dispatchEvent(new Event("pointerdown"));
  expect(seen).toEqual([firstRoot, secondRoot]);
  expect(observeFirst).toHaveBeenCalledTimes(1);
  expect(observeSecond).toHaveBeenCalledTimes(1);
  detachSecond();
  firstRoot.detach();
  secondRoot.detach();
  observeFirst.mockRestore();
  observeSecond.mockRestore();
});
