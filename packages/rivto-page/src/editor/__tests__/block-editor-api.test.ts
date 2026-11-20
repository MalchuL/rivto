import type { BlockEditorApi } from "../types";
import type { BlockEditorViewApi } from "../../presentation/components/block-editor/block-editor-scope";

it("keeps native root reads outside the mounting and extension contracts", () => {
  const extensionExposesRoot: "getRoot" extends keyof BlockEditorApi ? true : false = false;
  const viewExposesRoot: "getRoot" extends keyof BlockEditorViewApi ? true : false = false;
  const viewCanDetachRoot: "detach" extends keyof NonNullable<BlockEditorViewApi["inputRoot"]>
    ? true
    : false = false;
  const extensionExposesRegions: "regions" extends keyof BlockEditorApi ? true : false = false;
  const extensionExposesVirtualization: "virtualization" extends keyof BlockEditorApi
    ? true
    : false = false;
  const extensionRegistersDropTargets: "register" extends keyof BlockEditorApi["dropTargets"]
    ? true
    : false = false;
  const extensionRegistersDropLayouts: "registerLayout" extends keyof BlockEditorApi["dropTargets"]
    ? true
    : false = false;
  expect(extensionExposesRoot).toBe(false);
  expect(viewExposesRoot).toBe(false);
  expect(viewCanDetachRoot).toBe(false);
  expect(extensionExposesRegions).toBe(false);
  expect(extensionExposesVirtualization).toBe(false);
  expect(extensionRegistersDropTargets).toBe(false);
  expect(extensionRegistersDropLayouts).toBe(false);
});
