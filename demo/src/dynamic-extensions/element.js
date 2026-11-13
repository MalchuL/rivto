import { createElement as h } from "react";
import { elementControlProps, elementExtension } from "@chulane/rivto-react/authoring";

/**
 * Renders the canvas element and its detached creation preview.
 *
 * @param {import('@chulane/rivto-react/authoring').ElementRenderProps} props - Shared element rendering context.
 * @returns {import('react').ReactNode} Fluid content sized by the shared canvas host.
 */
function Element({ element, operations, reactPanel, preview }) {
  return h(
    "div",
    { className: "dynamic-element", "data-dynamic-element": "" },
    h("span", null, String(element.props.label)),
    h(
      "button",
      {
        ...elementControlProps(),
        type: "button",
        onClick: () => {
          if (preview) {
            return;
          }
          const current = reactPanel.elements.getElementNode(element.id);
          if (current) {
            operations.updateProperties(element.id, { count: Number(current.props.count) + 1 });
          }
        },
      },
      `Element count: ${element.props.count}`,
    ),
  );
}

/**
 * Creates an extension with a canvas element and its placement tool.
 *
 * @returns {import('@chulane/rivto-react/authoring').ReactEditorExtension} Element extension.
 */
export function createExtension() {
  return elementExtension({
    definition: { type: "dynamic.element", defaults: { label: "Dynamic element", count: 0 } },
    title: "Dynamic element",
    render: Element,
    creation: {
      title: "Dynamic element",
      create: () => ({ type: "dynamic.element", frame: { x: 0, y: 0, width: 160, height: 100 } }),
    },
  });
}
