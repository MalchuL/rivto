import { captureBrowserInputHit, readBrowserInputHit } from "../input-hit";

it("keeps a hit opaque and rejects disconnected or foreign-document targets", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const hit = captureBrowserInputHit(element);
  expect(hit).not.toHaveProperty("element");
  expect(readBrowserInputHit(hit, document)).toBe(element);
  const foreignDocument = document.implementation.createHTMLDocument("foreign");
  expect(readBrowserInputHit(hit, foreignDocument)).toBeUndefined();
  element.remove();
  expect(readBrowserInputHit(hit, document)).toBeUndefined();
  expect(
    readBrowserInputHit(
      {
        type: "input-hit",
        release: jest.fn(),
        isCurrent: jest.fn(),
        getNearestAncestorIdentity: jest.fn(),
      },
      document,
    ),
  ).toBeUndefined();
});
