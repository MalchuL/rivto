import { createBrowserInputRegion } from "../input-region";

it("observes subtree structure without delivering changes after detachment", async () => {
  const element = document.createElement("div");
  let attached = true;
  const region = createBrowserInputRegion(element, element, () => attached);
  const changed = jest.fn();
  const stop = region.observeStructure(changed);
  try {
    const child = document.createElement("div");
    element.append(child);
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    child.setAttribute("data-test", "unchanged structure");
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
    attached = false;
    child.append(document.createElement("span"));
    await Promise.resolve();
    expect(changed).toHaveBeenCalledTimes(1);
  } finally {
    stop();
    stop();
  }
});
