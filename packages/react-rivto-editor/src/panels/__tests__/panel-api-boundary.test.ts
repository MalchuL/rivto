import type { ReactPanelApi, ReactPanelSurfaceApi } from "../types";

const panelDoesNotExposeNativeRoot: "getRoot" extends keyof ReactPanelApi ? false : true = true;
const surfaceDoesNotExposePanelDestroy: "destroy" extends keyof ReactPanelSurfaceApi
  ? false
  : true = true;
const surfaceDoesNotExposeEditorDestroy: "destroy" extends keyof ReactPanelSurfaceApi["editor"]
  ? false
  : true = true;

it("keeps the native root out of the panel consumer contract", () => {
  expect(panelDoesNotExposeNativeRoot).toBe(true);
  expect(surfaceDoesNotExposePanelDestroy).toBe(true);
  expect(surfaceDoesNotExposeEditorDestroy).toBe(true);
});
