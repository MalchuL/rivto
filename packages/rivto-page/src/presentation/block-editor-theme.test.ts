import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditorThemeProvider } from "./block-editor-theme";

const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousEnvironment = environment.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  environment.IS_REACT_ACT_ENVIRONMENT = previousEnvironment;
});

test("renders CSS properties directly on nested theme providers", () => {
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(
        BlockEditorThemeProvider,
        { theme: { "--rivto-block-padding": "calc(4px + 1em)", color: "red" } },
        createElement(BlockEditorThemeProvider, { theme: { "--rivto-block-indent": "2rem" } }),
      ),
    );
  });
  const outer = container.firstElementChild as HTMLElement;
  const inner = outer.firstElementChild as HTMLElement;
  expect(outer.style.getPropertyValue("--rivto-block-padding")).toBe("calc(4px + 1em)");
  expect(outer.style.color).toBe("red");
  expect(inner.style.getPropertyValue("--rivto-block-indent")).toBe("2rem");
  expect(inner.style.getPropertyValue("--rivto-block-padding")).toBe("");
  act(() => root.unmount());
});
