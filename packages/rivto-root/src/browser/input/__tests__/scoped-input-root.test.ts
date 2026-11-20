import { BrowserInputRoot } from "../browser-input-root";

it("bounds a registration capability to its mounted root without detaching the owner", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const owner = new BrowserInputRoot(element);
  let current = true;
  const registration = owner.captureRegionByIdentity(owner.getElementIdentity(), () => current)!;
  const write = jest.spyOn(element, "setAttribute");
  try {
    current = false;
    registration.setTemporaryAttribute("data-preview", "true");
    expect(write).not.toHaveBeenCalled();
    current = true;
    registration.setTemporaryAttribute("data-preview", "true");
    expect(write).toHaveBeenCalledTimes(1);
    current = false;
    expect(owner.isAttached()).toBe(true);
    expect(registration.getIdentity()).toBeUndefined();
    const replacement = owner.captureRegionByIdentity(owner.getElementIdentity())!;
    owner.detach();
    expect(replacement.getIdentity()).toBeUndefined();
    replacement.setTemporaryAttribute("data-preview", "true");
    expect(write).toHaveBeenCalledTimes(1);
  } finally {
    write.mockRestore();
    element.remove();
  }
});
