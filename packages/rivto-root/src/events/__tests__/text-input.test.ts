import { captureTextInputData } from "../text-input";

it("copies text input data and defaults missing values", () => {
  const source = { inputType: "insertText", data: "/", isComposing: true };
  const captured = captureTextInputData(source);
  source.data = "changed";
  expect(captured).toEqual({ inputType: "insertText", data: "/", isComposing: true });
  expect(captureTextInputData({})).toEqual({ inputType: "", data: null, isComposing: false });
});
