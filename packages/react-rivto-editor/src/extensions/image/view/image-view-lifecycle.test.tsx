/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../../test-utils";
import { createTestViewFixture } from "../../../test-view-fixture";
import { imageExtension } from "../image";
import { ImageView } from "./image-view";

/** Object URL replacements and observed revocations used by the view fixture. */
interface ObjectUrlFixture {
  /** Object URLs revoked while the fixture is active. */
  readonly revoked: string[];
  /**
   * Restores the URL methods replaced by this fixture.
   *
   * @returns Restores the original object URL methods.
   */
  readonly restore: () => void;
}

/**
 * Records object URL cleanup while assigning distinct URLs to the two test blobs.
 *
 * @returns Observed revocations and a disposer for the replaced URL methods.
 */
function mockObjectUrls(): ObjectUrlFixture {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  // Give the two fixture blobs distinct object URLs.
  URL.createObjectURL = (blob) =>
    blob instanceof Blob && blob.size === 1 ? "blob:first" : "blob:second";
  const revoked: string[] = [];
  // Record revocations so the test can distinguish owned and borrowed URLs.
  URL.revokeObjectURL = (url) => {
    revoked.push(url);
  };
  return {
    revoked,
    // Restore both URL methods replaced for the test.
    restore: () => {
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
    },
  };
}

test("reloads an existing image when its extension provider is replaced", async () => {
  const urls = mockObjectUrls();
  const fixture = await createTestViewFixture();
  const { panel, container, root } = fixture;
  // The first provider produces a one-byte blob identified by the object-URL fixture.
  const first = { write: async () => "test:image", read: async () => new Blob(["a"]) };
  const second = {
    write: async () => "test:image",
    // Leave browser blob URLs unclaimed while returning new bytes for provider references.
    read: async (uri: string) => (uri.startsWith("blob:") ? undefined : new Blob(["ab"])),
  };
  let remove = panel.editor.extensions.install(imageExtension({ provider: first }));
  try {
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <ImageView kind="inline" uri="test:image" alt="image" />
        </TestPanel>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:first");
    await act(async () => {
      remove();
      remove = panel.editor.extensions.install(imageExtension({ provider: second }));
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:second");
    expect(urls.revoked).toContain("blob:first");
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <ImageView kind="inline" uri="blob:external" alt="image" />
        </TestPanel>,
      );
    });
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:external");
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <ImageView kind="inline" uri="blob:another" alt="image" />
        </TestPanel>,
      );
    });
    expect(urls.revoked).toContain("blob:second");
    expect(urls.revoked).not.toContain("blob:external");
  } finally {
    await fixture.dispose(() => remove());
    urls.restore();
  }
});
