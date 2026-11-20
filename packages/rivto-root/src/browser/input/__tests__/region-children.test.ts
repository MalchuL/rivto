/** @jest-environment jsdom */
import { createBrowserInputRegion } from "../input-region";
import { inputElementIdentity } from "../input-element-identity";

it("reads immediate children by live index and invalidates moved children", () => {
  const root = document.createElement("div");
  const parent = document.createElement("section");
  const first = document.createElement("span");
  const second = document.createElement("span");
  const other = document.createElement("section");
  parent.append(first, second);
  root.append(parent, other);
  let attached = true;
  const region = createBrowserInputRegion(root, parent, () => attached);
  const children = region.captureChildren()!;
  expect(children.getLength()).toBe(2);
  const captured = children.get(0)!;
  expect(captured.getIdentity()).toBe(inputElementIdentity(first));
  other.append(first);
  expect(captured.getIdentity()).toBeUndefined();
  expect(children.getLength()).toBe(1);
  expect(children.get(0)?.getIdentity()).toBe(inputElementIdentity(second));
  expect(children.get(-1)).toBeUndefined();
  attached = false;
  expect(children.getLength()).toBeUndefined();
  expect(children.get(0)).toBeUndefined();
});
