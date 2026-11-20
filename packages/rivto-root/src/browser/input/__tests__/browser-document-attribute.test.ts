import { BrowserInputRoot } from "../browser-input-root";

it("keeps a document marker while another matching occurrence remains", () => {
  const root = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.className = second.className = "marker-user";
  root.append(first, second);
  document.body.append(root);
  const occurrence = new BrowserInputRoot(root);
  const marker = occurrence.captureDocumentAttribute("data-test-marker");
  try {
    expect(marker.set()).toBe(true);
    first.remove();
    marker.removeWhenAbsent(".marker-user");
    expect(document.documentElement.hasAttribute("data-test-marker")).toBe(true);
    occurrence.detach();
    second.remove();
    marker.removeWhenAbsent(".marker-user");
    expect(document.documentElement.hasAttribute("data-test-marker")).toBe(false);
    expect(marker.set()).toBe(false);
    expect(document.documentElement.hasAttribute("data-test-marker")).toBe(false);
  } finally {
    root.remove();
    document.documentElement.removeAttribute("data-test-marker");
  }
});

it("cleans the captured document after the occurrence moves to another document", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const occurrence = new BrowserInputRoot(element);
  const marker = occurrence.captureDocumentAttribute("data-test-marker");
  const other = document.implementation.createHTMLDocument("other");
  try {
    marker.set();
    other.body.append(element);
    marker.removeWhenAbsent(".marker-user");
    expect(document.documentElement.hasAttribute("data-test-marker")).toBe(false);
    marker.set();
    expect(other.documentElement.hasAttribute("data-test-marker")).toBe(false);
    expect(document.documentElement.hasAttribute("data-test-marker")).toBe(false);
  } finally {
    element.remove();
    document.documentElement.removeAttribute("data-test-marker");
  }
});

it("can clean up after a marker write changes the document and then throws", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const marker = new BrowserInputRoot(element).captureDocumentAttribute("data-test-marker");
  const documentElement = document.documentElement;
  const set = documentElement.setAttribute.bind(documentElement);
  const failure = jest.spyOn(documentElement, "setAttribute").mockImplementation((name, value) => {
    set(name, value);
    throw new Error("marker write failed");
  });
  try {
    expect(() => marker.set()).toThrow("marker write failed");
    expect(documentElement.hasAttribute("data-test-marker")).toBe(true);
    marker.removeWhenAbsent(".marker-user");
    expect(documentElement.hasAttribute("data-test-marker")).toBe(false);
  } finally {
    failure.mockRestore();
    element.remove();
    documentElement.removeAttribute("data-test-marker");
  }
});
