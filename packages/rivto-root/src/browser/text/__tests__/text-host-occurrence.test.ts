import type { TextHost, TextHostQuery } from "../../../text/types";
import type { TextInput } from "../../../events/types";
import { BrowserInputListeners } from "../../input/browser-input-listeners";
import { BrowserInputRoot } from "../../input/browser-input-root";
import { captureBrowserInput } from "../../input/capture-browser-input";

const query: TextHostQuery = {
  ownerSelector: "[data-block-id]",
  ownerAttribute: "data-block-id",
  ownerValue: "one",
  contentSelector: "[data-content]",
  boundarySelector: "[data-panel]",
};

it("shares host identity across input and occurrence lookup without crossing nested panels", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div data-panel><div data-block-id="one"><span data-content>nested</span></div></div><div data-block-id="one"><span data-content>original</span></div>';
  document.body.append(root);
  const content = root.querySelectorAll<HTMLElement>("[data-content]")[1]!;
  const occurrence = new BrowserInputRoot(root);
  const listeners = new BrowserInputListeners();
  let captured: TextHost | undefined;
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    captured = input.captureTextHost?.("[data-content]");
  });
  const detach = listeners.attach(root);
  try {
    content.dispatchEvent(new Event("input", { bubbles: true }));
    const found = occurrence.findTextHost(query);
    expect(found?.readText()).toBe("original");
    expect(captured?.isSameHost(found!)).toBe(true);
    expect(captured?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("one");
    content.remove();
    expect(captured?.readText()).toBe("original");
    expect(captured?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
    expect(occurrence.findTextHost(query)).toBeUndefined();
    root.lastElementChild!.append(content);
    expect(occurrence.findTextHost(query)?.readText()).toBe("original");
    occurrence.detach();
    expect(occurrence.findTextHost(query)).toBeUndefined();
    const replacement = new BrowserInputRoot(root);
    expect(replacement.findTextHost(query)?.isSameHost(captured!)).toBe(true);
    replacement.detach();
  } finally {
    detach();
    occurrence.detach();
    root.remove();
  }
});

it("discards a host if its occurrence becomes stale during lookup", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="one"><span data-content>text</span></div>';
  let current = true;
  const occurrence = new BrowserInputRoot(root, () => current);
  const queryAll = root.querySelectorAll.bind(root);
  const spy = jest.spyOn(root, "querySelectorAll").mockImplementation((selector) => {
    const result = queryAll(selector);
    current = false;
    return result;
  });
  try {
    expect(occurrence.findTextHost(query)).toBeUndefined();
  } finally {
    spy.mockRestore();
    occurrence.detach();
  }
});

it("discards an owner removed from the occurrence during lookup", () => {
  const root = document.createElement("div");
  root.innerHTML = '<div data-block-id="one"><span data-content>text</span></div>';
  const owner = root.querySelector<HTMLElement>("[data-block-id]")!;
  const read = owner.getAttribute.bind(owner);
  const spy = jest.spyOn(owner, "getAttribute").mockImplementation((attribute) => {
    const value = read(attribute);
    owner.remove();
    return value;
  });
  const occurrence = new BrowserInputRoot(root);
  try {
    expect(occurrence.findTextHost(query)).toBeUndefined();
  } finally {
    spy.mockRestore();
    occurrence.detach();
  }
});

it("discards an owner moved into a nested occurrence during lookup", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div data-block-id="one"><span data-content>text</span></div><div data-panel></div>';
  const owner = root.querySelector<HTMLElement>("[data-block-id]")!;
  const nested = root.querySelector<HTMLElement>("[data-panel]")!;
  const read = owner.getAttribute.bind(owner);
  let reads = 0;
  const spy = jest.spyOn(owner, "getAttribute").mockImplementation((attribute) => {
    const value = read(attribute);
    if (++reads === 2) {
      nested.append(owner);
    }
    return value;
  });
  const occurrence = new BrowserInputRoot(root);
  try {
    expect(occurrence.findTextHost(query)).toBeUndefined();
  } finally {
    spy.mockRestore();
    occurrence.detach();
  }
});

it("does not read ownership after a captured host moves into a nested occurrence", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div data-block-id="one"><span data-content>text</span></div><div data-panel><div data-block-id="one"></div></div>';
  const owner = root.querySelector<HTMLElement>("[data-block-id]")!;
  const nestedOwner = root.querySelectorAll<HTMLElement>("[data-block-id]")[1]!;
  const content = root.querySelector<HTMLElement>("[data-content]")!;
  const occurrence = new BrowserInputRoot(root);
  try {
    const host = occurrence.findTextHost(query)!;
    nestedOwner.append(content);
    expect(host.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
    owner.append(content);
    expect(host.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("one");
  } finally {
    occurrence.detach();
  }
});

it("bounds input-captured hosts to their original nested occurrence", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div data-block-id="one"><span data-content>text</span></div><div data-panel><div data-block-id="one"></div></div>';
  const content = root.querySelector<HTMLElement>("[data-content]")!;
  const nested = root.querySelectorAll<HTMLElement>("[data-block-id]")[1]!;
  const listeners = new BrowserInputListeners();
  let host: TextHost | undefined;
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    host = input.captureTextHost?.("[data-content]", "[data-panel]");
  });
  const detach = listeners.attach(root);
  try {
    content.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("one");
    nested.append(content);
    expect(host?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
    host = undefined;
    content.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host).toBeUndefined();
  } finally {
    detach();
  }
});

it("discards an attribute if its host moves into a nested occurrence during the read", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML =
    '<div data-block-id="one"><span data-content>text</span></div><div data-panel><div data-block-id="one"></div></div>';
  const owner = root.querySelector<HTMLElement>("[data-block-id]")!;
  const content = root.querySelector<HTMLElement>("[data-content]")!;
  const nested = root.querySelectorAll<HTMLElement>("[data-block-id]")[1]!;
  const occurrence = new BrowserInputRoot(root);
  const host = occurrence.findTextHost(query)!;
  const read = owner.getAttribute.bind(owner);
  const spy = jest.spyOn(owner, "getAttribute").mockImplementation((attribute) => {
    const value = read(attribute);
    nested.append(content);
    return value;
  });
  try {
    expect(host.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
  } finally {
    spy.mockRestore();
    occurrence.detach();
  }
});

it("rejects input capture when the attachment check moves a host into a nested occurrence", () => {
  const root = document.createElement("div");
  root.dataset.panel = "";
  root.innerHTML = '<span data-content>text</span><div data-panel></div>';
  const content = root.querySelector<HTMLElement>("[data-content]")!;
  const nested = root.querySelector<HTMLElement>("[data-panel]")!;
  const event = new Event("input", { bubbles: true });
  content.dispatchEvent(event);
  let checks = 0;
  const input = captureBrowserInput(event, root, () => {
    if (++checks === 2) {
      nested.append(content);
    }
    return true;
  });
  if (input.type !== "input" || !("captureTextHost" in input)) {
    throw new Error("Expected a text input");
  }
  expect(input.captureTextHost?.("[data-content]", "[data-panel]")).toBeUndefined();
});

it("captures the host for each dispatch of a reused input event", () => {
  const root = document.createElement("div");
  root.innerHTML = "<span data-content>first</span><span data-content>second</span>";
  const [first, second] = root.querySelectorAll("span");
  const hosts: Array<TextHost | undefined> = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    hosts.push(input.captureTextHost?.("[data-content]"));
  });
  const detach = listeners.attach(root);
  try {
    const event = new Event("input", { bubbles: true });
    first!.dispatchEvent(event);
    second!.dispatchEvent(event);
    expect(hosts.map((host) => host?.readText())).toEqual(["first", "second"]);
    expect(hosts[0]?.isSameHost(hosts[1]!)).toBe(false);
  } finally {
    detach();
  }
});

it("cannot capture a host from an input after its listener is remounted", () => {
  const root = document.createElement("div");
  root.innerHTML = "<span data-content>text</span>";
  const content = root.querySelector("span")!;
  const inputs: TextInput[] = [];
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    inputs.push(input);
  });
  const detachFirst = listeners.attach(root);
  content.dispatchEvent(new Event("input", { bubbles: true }));
  const firstHost = inputs[0]?.captureTextHost?.("[data-content]");
  expect(firstHost).toBeDefined();
  detachFirst();
  const detachSecond = listeners.attach(root);
  try {
    expect(inputs[0]?.captureTextHost?.("[data-content]")).toBeUndefined();
    content.dispatchEvent(new Event("input", { bubbles: true }));
    const secondHost = inputs[1]?.captureTextHost?.("[data-content]");
    expect(secondHost?.isSameHost(firstHost!)).toBe(true);
  } finally {
    detachSecond();
  }
});

it("discards a captured host moved out during the attachment check", () => {
  const root = document.createElement("div");
  const content = document.createElement("span");
  content.dataset.content = "";
  root.append(content);
  const event = new Event("input", { bubbles: true });
  Object.defineProperty(event, "target", { value: content });
  let checks = 0;
  const input = captureBrowserInput(event, root, () => {
    checks += 1;
    if (checks === 2) {
      content.remove();
    }
    return true;
  });
  expect(input.type).toBe("input");
  if (input.type !== "input" || !("captureTextHost" in input)) {
    throw new Error("Expected normalized text input");
  }
  expect(input.captureTextHost?.("[data-content]")).toBeUndefined();
});

it("discards a captured host when the target moves to another host during the check", () => {
  const root = document.createElement("div");
  root.innerHTML = "<span data-content><b></b></span><span data-content></span>";
  const [first, second] = root.querySelectorAll("[data-content]");
  const target = first!.querySelector("b")!;
  const event = new Event("input", { bubbles: true });
  Object.defineProperty(event, "target", { value: target });
  let checks = 0;
  const input = captureBrowserInput(event, root, () => {
    checks += 1;
    if (checks === 2) {
      second!.append(target);
    }
    return true;
  });
  if (input.type !== "input" || !("captureTextHost" in input)) {
    throw new Error("Expected normalized text input");
  }
  expect(input.captureTextHost?.("[data-content]")).toBeUndefined();
});

it("does not read an ancestor outside the captured occurrence", () => {
  const outer = document.createElement("div");
  outer.dataset.blockId = "outside";
  const root = document.createElement("div");
  const content = document.createElement("span");
  content.dataset.content = "";
  root.append(content);
  outer.append(root);
  document.body.append(outer);
  let host: TextHost | undefined;
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    host = input.captureTextHost?.("[data-content]");
  });
  const detach = listeners.attach(root);
  try {
    content.dispatchEvent(new Event("input", { bubbles: true }));
    expect(host).toBeDefined();
    expect(host?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
  } finally {
    detach();
    outer.remove();
  }
});

it("discards an ancestor attribute when the host moves during the read", () => {
  const root = document.createElement("div");
  root.innerHTML =
    '<div data-block-id="first"><span data-content></span></div><div data-block-id="second"></div>';
  const [first, second] = root.querySelectorAll<HTMLElement>("[data-block-id]");
  const content = root.querySelector<HTMLElement>("[data-content]")!;
  let host: TextHost | undefined;
  const listeners = new BrowserInputListeners();
  listeners.register({ type: "input", target: "root", capture: false }, (input) => {
    host = input.captureTextHost?.("[data-content]");
  });
  const detach = listeners.attach(root);
  content.dispatchEvent(new Event("input", { bubbles: true }));
  const read = first!.getAttribute.bind(first);
  const spy = jest.spyOn(first!, "getAttribute").mockImplementation((name) => {
    const value = read(name);
    second!.append(content);
    return value;
  });
  try {
    expect(host?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
    expect(host?.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("second");
  } finally {
    spy.mockRestore();
    detach();
  }
});
