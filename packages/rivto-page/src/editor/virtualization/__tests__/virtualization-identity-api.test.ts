import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockVirtualizationRegistry } from "../block-virtualization-registry";

it("accepts a region identity but rejects a region capability or DOM element", () => {
  const element = document.createElement("div");
  const region = captureTestInputRegion(element, element, () => true);
  const identity: Parameters<BlockVirtualizationRegistry["register"]>[0] =
    getBrowserElementIdentity(element);
  // @ts-expect-error A region capability is not its opaque identity.
  const invalidRegion: Parameters<BlockVirtualizationRegistry["register"]>[0] = region;
  // @ts-expect-error A browser element is not an opaque identity.
  const invalidElement: Parameters<BlockVirtualizationRegistry["register"]>[0] = element;
  expect(identity).toBe(region.getIdentity());
  expect(invalidRegion).toBe(region);
  expect(invalidElement).toBe(element);
});
