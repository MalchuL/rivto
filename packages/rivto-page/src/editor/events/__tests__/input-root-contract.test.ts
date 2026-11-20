import type { BlockInputEvent } from "../types";
import type { BlockEditorController } from "../../block-editor-controller";
import type { PageInputRoot } from "../../types";

it("exposes occurrence operations without input attachment authority", () => {
  const canFocus: "focus" extends keyof BlockInputEvent<"pointerdown">["root"] ? true : false =
    true;
  const canCreateObserver: "createInputObserver" extends keyof BlockInputEvent<"pointerdown">["root"]
    ? true
    : false = false;
  const canAttach: "attach" extends keyof BlockInputEvent<"pointerdown">["root"] ? true : false =
    false;
  const canDestroy: "destroy" extends keyof BlockInputEvent<"pointerdown">["root"] ? true : false =
    false;
  expect({ canFocus, canCreateObserver, canAttach, canDestroy }).toEqual({
    canFocus: true,
    canCreateObserver: false,
    canAttach: false,
    canDestroy: false,
  });
});

it("limits the controller's borrowed occurrence to rendering operations", () => {
  type Root = NonNullable<BlockEditorController["inputRoot"]>;
  const canObserveWindow: "observeWindowInput" extends keyof Root ? true : false = true;
  const canCreateObserver: "createInputObserver" extends keyof Root ? true : false = false;
  const canAttach: "attach" extends keyof Root ? true : false = false;
  expect({ canObserveWindow, canCreateObserver, canAttach }).toEqual({
    canObserveWindow: true,
    canCreateObserver: false,
    canAttach: false,
  });
});

it("requires only the Root capabilities Page attaches or passes to its consumers", () => {
  const canObserveInput: "createInputObserver" extends keyof PageInputRoot ? true : false = true;
  const canReadSelection: "readTextSelection" extends keyof PageInputRoot ? true : false = true;
  const canObserveWindow: "observeWindowInput" extends keyof PageInputRoot ? true : false = true;
  const canWriteClipboard: "writeClipboard" extends keyof PageInputRoot ? true : false = false;
  expect({ canObserveInput, canReadSelection, canObserveWindow, canWriteClipboard }).toEqual({
    canObserveInput: true,
    canReadSelection: true,
    canObserveWindow: true,
    canWriteClipboard: false,
  });
});
