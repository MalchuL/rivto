import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("captures drop feedback through Root and discards it when its attachment ends", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(target);
  document.body.append(root);
  jest.spyOn(target, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  editor.dropTargets.register({
    identity: getBrowserElementIdentity(target),
    getRegions: () => [{ kind: "inside", destination: { kind: "inside", parentId: null } }],
  });
  const detach = attachTestRoot(editor, root);
  const inputRoot = editor.inputRoot!;
  const captureRegion = inputRoot.captureRegionByIdentity.bind(inputRoot);
  const capture = jest.spyOn(inputRoot, "captureRegionByIdentity");
  const hit = captureTestInputHit(target);
  try {
    const result = editor.dropTargets.resolve(50, 50, undefined, hit);
    expect(result?.destination).toEqual({ kind: "inside", parentId: null });
    expect(result?.anchor.getIdentity()).toBe(getBrowserElementIdentity(target));
    expect(capture).toHaveBeenCalledWith(getBrowserElementIdentity(target), expect.any(Function));
    capture.mockImplementation((identity, isCurrent) => {
      const region = captureRegion(identity, isCurrent);
      detach();
      return region;
    });
    expect(editor.dropTargets.resolve(50, 50, undefined, hit)).toBeUndefined();
    expect(result?.anchor.getIdentity()).toBeUndefined();
  } finally {
    hit.release();
    detach();
    editor.destroy();
    root.remove();
  }
});

it("does not inspect replacement registrations when hit testing replaces the Page attachment", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(target);
  document.body.append(root);
  const inputRoot = new BrowserInputRoot(root);
  const getRegions = jest.fn(() => []);
  editor.dropTargets.register({ identity: getBrowserElementIdentity(target), getRegions });
  const detach = editor.attach(inputRoot);
  let detachReplacement: (() => void) | undefined;
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => {
      detach();
      detachReplacement = editor.attach(inputRoot);
      return target;
    },
  });
  try {
    expect(editor.dropTargets.resolve(1, 2)).toBeUndefined();
    expect(getRegions).not.toHaveBeenCalled();
  } finally {
    detachReplacement?.();
    detach();
    inputRoot.detach();
    editor.destroy();
    root.remove();
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

it("does not inspect a replacement when hit ancestry changes the Page attachment", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(target);
  document.body.append(root);
  const inputRoot = new BrowserInputRoot(root);
  const getRegions = jest.fn(() => []);
  editor.dropTargets.register({ identity: getBrowserElementIdentity(target), getRegions });
  const detach = editor.attach(inputRoot);
  let detachReplacement: (() => void) | undefined;
  const closest = target.closest.bind(target);
  const lookup = jest.spyOn(target, "closest").mockImplementation((selector) => {
    detach();
    detachReplacement = editor.attach(inputRoot);
    return closest(selector);
  });
  const hit = captureTestInputHit(target);
  try {
    expect(editor.dropTargets.resolve(1, 2, undefined, hit)).toBeUndefined();
    expect(getRegions).not.toHaveBeenCalled();
  } finally {
    hit.release();
    lookup.mockRestore();
    detachReplacement?.();
    detach();
    inputRoot.detach();
    editor.destroy();
    root.remove();
  }
});

it("discards a drop when the attachment ends during an anchor measurement", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(target);
  document.body.append(root);
  const getRegions = jest.fn(() => [
    { kind: "inside" as const, destination: { kind: "inside" as const, parentId: null } },
  ]);
  editor.dropTargets.register({
    identity: getBrowserElementIdentity(target),
    getRegions,
  });
  const detach = attachTestRoot(editor, root);
  const hit = captureTestInputHit(target);
  const accepts = jest.fn(() => true);
  jest.spyOn(target, "getBoundingClientRect").mockImplementation(() => {
    detach();
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    };
  });
  try {
    expect(editor.dropTargets.resolve(50, 50, undefined, hit, accepts)).toBeUndefined();
    expect(accepts).not.toHaveBeenCalled();
    expect(getRegions).not.toHaveBeenCalled();
  } finally {
    hit.release();
    detach();
    editor.destroy();
    root.remove();
  }
});

it("discards a background target when its borrowed hit is released during resolution", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(target);
  document.body.append(root);
  jest.spyOn(target, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  const hit = captureTestInputHit(target);
  editor.dropTargets.register({
    identity: getBrowserElementIdentity(target),
    getRegions: () => {
      hit.release();
      return [
        { kind: "inside", coverage: "background", destination: { kind: "inside", parentId: null } },
      ];
    },
  });
  const detach = attachTestRoot(editor, root);
  try {
    expect(editor.dropTargets.resolve(50, 50, undefined, hit)).toBeUndefined();
  } finally {
    hit.release();
    detach();
    editor.destroy();
    root.remove();
  }
});

it("discards nested lookup when a hit moves between branches during registration reads", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(first, second);
  first.append(target);
  document.body.append(root);
  jest.spyOn(target, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  const getRegions = jest.fn(() => {
    second.append(target);
    return [{ kind: "inside" as const, destination: { kind: "inside" as const, parentId: null } }];
  });
  editor.dropTargets.register({ identity: getBrowserElementIdentity(target), getRegions });
  const detach = attachTestRoot(editor, root);
  const hit = captureTestInputHit(target);
  const accepts = jest.fn(() => true);
  try {
    expect(editor.dropTargets.resolve(50, 50, undefined, hit, accepts)).toBeUndefined();
    expect(getRegions).toHaveBeenCalledTimes(1);
    expect(accepts).not.toHaveBeenCalled();
  } finally {
    hit.release();
    detach();
    editor.destroy();
    root.remove();
  }
});

it("discards local lookup when the hit moves after nested discovery", () => {
  const adapter = new TestBlockEditorAdapter();
  adapter.rootIds = [];
  const editor = new BlockEditorController({ adapter });
  const root = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  const target = document.createElement("div");
  root.dataset.rivtoBlockEditor = "";
  root.append(first, second);
  first.append(target);
  document.body.append(root);
  jest.spyOn(target, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  let reads = 0;
  editor.dropTargets.register({
    identity: getBrowserElementIdentity(target),
    getRegions: () => {
      reads += 1;
      if (reads === 2) {
        second.append(target);
      }
      return [{ kind: "inside", destination: { kind: "inside", parentId: null } }];
    },
  });
  const detach = attachTestRoot(editor, root);
  const hit = captureTestInputHit(target);
  const accepts = jest.fn(() => true);
  try {
    expect(editor.dropTargets.resolve(50, 50, undefined, hit, accepts)).toBeUndefined();
    expect(reads).toBe(2);
    expect(accepts).not.toHaveBeenCalled();
  } finally {
    hit.release();
    detach();
    editor.destroy();
    root.remove();
  }
});
