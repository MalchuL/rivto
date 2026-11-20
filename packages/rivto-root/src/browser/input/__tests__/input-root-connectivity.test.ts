import { BrowserInputRoot } from "../browser-input-root";

it("reports live document connectivity only while the registration is current", () => {
  const element = document.createElement("div");
  let current = true;
  const mounted = new BrowserInputRoot(element, () => current);
  try {
    expect(mounted.isAttached()).toBe(true);
    expect(mounted.isConnected()).toBe(false);
    document.body.append(element);
    expect(mounted.isConnected()).toBe(true);
    element.remove();
    expect(mounted.isConnected()).toBe(false);
    document.body.append(element);
    current = false;
    expect(element.isConnected).toBe(true);
    expect(mounted.isConnected()).toBe(false);
    current = true;
    expect(mounted.isConnected()).toBe(true);
    mounted.detach();
    expect(mounted.isConnected()).toBe(false);
  } finally {
    mounted.detach();
    element.remove();
  }
});
