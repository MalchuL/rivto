import { BlockDropFeedback } from "./block-drop-feedback";

it("outlines the receiving shell across its header and child-list append regions", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<section data-block-id="parent"><header></header><div class="children"></div></section>';
  const shell = root.querySelector("section")!;
  const header = root.querySelector("header")!;
  const children = root.querySelector<HTMLElement>(".children")!;
  const feedback = new BlockDropFeedback(root);
  const destination = { kind: "inside" as const, parentId: "parent" };
  for (const element of [header, children, header]) {
    feedback.update({ element, destination, outlineElement: shell });
    expect(shell.getAttribute("data-block-drop-active")).toBe("true");
    expect(root.querySelectorAll("[data-block-drop-active]")).toHaveLength(1);
    expect(element.hasAttribute("data-block-drop-active")).toBe(false);
  }
  feedback.clear();
  expect(root.querySelectorAll("[data-block-drop-active]")).toHaveLength(0);
});

it("paints the supplied region without inferring a shell from DOM ancestry", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  root.innerHTML =
    '<section data-block-id="parent"><div data-rivto-block-editor><header></header></div></section>';
  const shell = root.querySelector("section")!;
  const header = root.querySelector("header")!;
  const feedback = new BlockDropFeedback(root);
  const destination = { kind: "inside" as const, parentId: "parent" };
  feedback.update({ element: header, destination });
  expect(header.getAttribute("data-block-drop-active")).toBe("true");
  expect(shell.hasAttribute("data-block-drop-active")).toBe(false);
  shell.append(header);
  feedback.update({
    element: header,
    destination,
    indicator: { left: 0, top: 0, width: 50, height: 2 },
  });
  expect(header.getAttribute("data-block-drop-active")).toBe("between");
  expect(shell.hasAttribute("data-block-drop-active")).toBe(false);
  feedback.clear();
  expect(root.querySelectorAll("[data-block-drop-active]")).toHaveLength(0);
});
