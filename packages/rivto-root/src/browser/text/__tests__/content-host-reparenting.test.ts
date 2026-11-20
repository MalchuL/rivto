import { captureBrowserTextHost } from "../browser-text-host";

it("keeps host identity while excluding a host moved to another occurrence", () => {
  const firstRoot = document.createElement("div");
  const secondRoot = document.createElement("div");
  const firstBlock = document.createElement("div");
  const secondBlock = document.createElement("div");
  firstBlock.dataset.blockId = "first";
  secondBlock.dataset.blockId = "second";
  const content = document.createElement("span");
  content.textContent = "original";
  firstBlock.append(content);
  firstRoot.append(firstBlock);
  secondRoot.append(secondBlock);
  const original = captureBrowserTextHost(content, firstRoot)!;

  expect(original.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("first");
  secondBlock.append(content);
  const moved = captureBrowserTextHost(content, secondRoot)!;
  expect(original.isSameHost(moved)).toBe(true);
  expect(original.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
  expect(moved.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("second");
  expect(original.readText()).toBe("original");
});
