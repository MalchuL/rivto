import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { BlockDropFeedback } from "../block-drop-feedback";

it("releases foreign feedback when the source occurrence becomes inactive", () => {
  const source = document.createElement("div");
  const receiver = document.createElement("div");
  document.body.append(source, receiver);
  let active = true;
  const root = new BrowserInputRoot(source, () => active);
  const feedback = new BlockDropFeedback(root);
  const target = {
    anchor: captureTestInputRegion(receiver, receiver, () => true),
    destination: { kind: "inside" as const, parentId: null },
  };
  try {
    feedback.update(target);
    expect(receiver.hasAttribute("data-block-drop-active")).toBe(true);
    active = false;
    feedback.update(target);
    expect(receiver.hasAttribute("data-block-drop-active")).toBe(false);
  } finally {
    feedback.clear();
    source.remove();
    receiver.remove();
  }
});

it("releases a foreign marker if its write invalidates the source occurrence", () => {
  const source = document.createElement("div");
  const receiver = document.createElement("div");
  document.body.append(source, receiver);
  let active = true;
  const feedback = new BlockDropFeedback(new BrowserInputRoot(source, () => active));
  const write = receiver.setAttribute.bind(receiver);
  const spy = jest.spyOn(receiver, "setAttribute").mockImplementation((name, value) => {
    if (name === "data-block-drop-active") {
      active = false;
    }
    write(name, value);
  });
  try {
    feedback.update({
      anchor: captureTestInputRegion(receiver, receiver, () => true),
      destination: { kind: "inside", parentId: null },
    });
    expect(receiver.hasAttribute("data-block-drop-active")).toBe(false);
  } finally {
    spy.mockRestore();
    feedback.clear();
    source.remove();
    receiver.remove();
  }
});

it("releases feedback if the line is reparented while the target is marked", () => {
  const source = document.createElement("div");
  const receiver = document.createElement("div");
  const other = document.createElement("div");
  document.body.append(source, receiver, other);
  const feedback = new BlockDropFeedback(new BrowserInputRoot(source));
  const write = receiver.setAttribute.bind(receiver);
  const spy = jest.spyOn(receiver, "setAttribute").mockImplementation((name, value) => {
    if (name === "data-block-drop-active") {
      other.append(source.querySelector(".rivto-block-drop-line")!);
    }
    write(name, value);
  });
  try {
    feedback.update({
      anchor: captureTestInputRegion(receiver, receiver, () => true),
      destination: { kind: "inside", parentId: null },
      indicator: { left: 1, top: 2, width: 10, height: 2 },
    });
    expect(receiver.hasAttribute("data-block-drop-active")).toBe(false);
    expect(other.querySelector(".rivto-block-drop-line")).toBeNull();
  } finally {
    spy.mockRestore();
    feedback.clear();
    source.remove();
    receiver.remove();
    other.remove();
  }
});
