import type { PanelAPI } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import type { ReactEditorExtensionApi } from "../types";

const extensionCannotDestroy: "destroy" extends keyof ReactEditorExtensionApi ? false : true = true;
const extensionCannotRegisterPanel: "registerPanel" extends keyof ReactEditorExtensionApi["panels"]
  ? false
  : true = true;
const panelCannotDestroyEditor: "destroy" extends keyof ReactPanelApi["editor"] ? false : true = true;
const panelCannotRegisterPanel: "registerPanel" extends keyof ReactPanelApi["editor"]["panels"]
  ? false
  : true = true;
const panelCannotDestroyDocument: "destroy" extends keyof PanelAPI["document"] ? false : true =
  true;

it("keeps lifecycle operations outside borrowed editor contracts", () => {
  expect(extensionCannotDestroy).toBe(true);
  expect(extensionCannotRegisterPanel).toBe(true);
  expect(panelCannotDestroyEditor).toBe(true);
  expect(panelCannotRegisterPanel).toBe(true);
  expect(panelCannotDestroyDocument).toBe(true);
});
