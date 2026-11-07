import { createTestCoreEditor, createTestReactEditor } from "../test-utils";
import {
  BLOCK_CONVERSION_DEFAULTS_KEY,
  registerBlockConversionDefaults,
} from "./block-conversion-defaults";

test("conversion contributions follow independent extension lifetimes and failed setup", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const extensions = panel.editor.extensions;
  const register = (id: string) =>
    extensions.install({
      id,
      setup: () => {
        registerBlockConversionDefaults(extensions, { collapsed: false });
      },
    });
  try {
    expect(extensions.shared.getArray(BLOCK_CONVERSION_DEFAULTS_KEY)).toBeUndefined();
    const removeFirst = register("first");
    const removeSecond = register("second");
    const entries = extensions.shared.getArray(BLOCK_CONVERSION_DEFAULTS_KEY)!;
    expect(entries.values()).toEqual([{ collapsed: false }, { collapsed: false }]);
    expect(() =>
      extensions.install({
        id: "failed",
        setup: () => {
          registerBlockConversionDefaults(extensions, { type: "list" });
          throw new Error("setup failed");
        },
      }),
    ).toThrow("setup failed");
    expect(entries.values()).toEqual([{ collapsed: false }, { collapsed: false }]);
    removeFirst();
    expect(entries.values()).toEqual([{ collapsed: false }]);
    removeSecond();
    expect(extensions.shared.getArray(BLOCK_CONVERSION_DEFAULTS_KEY)).toBeUndefined();
    expect(() => entries.values()).toThrow(/disposed/);
  } finally {
    await panel.editor.destroy();
    await core.destroy();
  }
});
