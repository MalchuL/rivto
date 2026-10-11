import { isInDocumentView } from "./document-view";

test("DOM walks stay within the displayed document occurrence, including regions inside a view", () => {
  const surface = { closest: () => surface } as unknown as HTMLElement;
  const card = { closest: () => surface } as unknown as HTMLElement;
  const ownContent = { closest: () => surface } as unknown as Element;
  const nestedSurface = { closest: () => nestedSurface } as unknown as HTMLElement;
  const nestedContent = { closest: () => nestedSurface } as unknown as Element;
  expect(isInDocumentView(surface, ownContent)).toBe(true);
  expect(isInDocumentView(card, ownContent)).toBe(true);
  expect(isInDocumentView(card, nestedContent)).toBe(false);
  expect(isInDocumentView(surface, nestedContent)).toBe(false);
  expect(isInDocumentView(nestedSurface, nestedContent)).toBe(true);
});
