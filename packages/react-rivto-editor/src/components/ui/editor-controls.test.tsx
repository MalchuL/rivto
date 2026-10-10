import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "./button";
import { Input } from "./input";
import { NativeSelect } from "./native-select";
import { Textarea } from "./textarea";
import { EDITOR_CONTROL_ATTRIBUTE, editorControlProps } from "../../constants";

test("shared controls remain unmarked until their caller supplies editor interaction props", () => {
  const plain = renderToStaticMarkup(<><Button>Run</Button><Input /><Textarea /><NativeSelect /></>);
  expect(plain).not.toContain(EDITOR_CONTROL_ATTRIBUTE);
  const native = renderToStaticMarkup(<>
    <Button {...editorControlProps}>Run</Button>
    <Input {...editorControlProps} />
    <Textarea {...editorControlProps} />
    <NativeSelect {...editorControlProps} />
  </>);
  for (const tag of ["button", "input", "textarea", "select"]) {
    expect(native).toMatch(new RegExp(`<${tag}[^>]*${EDITOR_CONTROL_ATTRIBUTE}=""`));
  }
  const custom = renderToStaticMarkup(<Button {...editorControlProps} asChild><div role="button" tabIndex={0}>Custom</div></Button>);
  expect(custom).toMatch(new RegExp(`<div[^>]*${EDITOR_CONTROL_ATTRIBUTE}=""`));
  expect(custom).toContain('role="button"');
  expect(custom).not.toContain("<button");
});
