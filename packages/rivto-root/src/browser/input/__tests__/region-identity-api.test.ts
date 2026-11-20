import type { InputRoot } from "../../../events/types";
import { createBrowserInputRegion } from "../input-region";
import { inputElementIdentity } from "../input-element-identity";

it("requires identities for region capture, focus, and editable capture", () => {
  const element = document.createElement("div");
  const region = createBrowserInputRegion(element, element, () => true);
  const identity = inputElementIdentity(element);
  const capture: Parameters<InputRoot["captureRegionByIdentity"]>[0] = identity;
  const focus: Parameters<InputRoot["focusRegionByIdentity"]>[0] = identity;
  const editable: Parameters<InputRoot["captureEditableTextByIdentity"]>[0] = identity;
  // @ts-expect-error A region capability is not an identity.
  const invalidRegion: Parameters<InputRoot["captureRegionByIdentity"]>[0] = region;
  // @ts-expect-error Native elements cannot stand in for region identities.
  const invalidElement: Parameters<InputRoot["focusRegionByIdentity"]>[0] = element;
  // @ts-expect-error Editable capture also requires an opaque identity.
  const invalidEditable: Parameters<InputRoot["captureEditableTextByIdentity"]>[0] = element;
  expect([capture, focus, editable]).toEqual([identity, identity, identity]);
  expect(invalidRegion).toBe(region);
  expect(invalidElement).toBe(element);
  expect(invalidEditable).toBe(element);
});
