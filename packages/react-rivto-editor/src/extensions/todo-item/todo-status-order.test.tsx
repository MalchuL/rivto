/**
 * Verifies the standalone TODO status-order component's accessible sortable
 * rows and the immutable reorder operation used by drag completion.
 *
 * @module
 */
import { renderToStaticMarkup } from "react-dom/server";
import { TodoStatusOrder, reorderTodoStatuses } from "./todo-status-order";

describe("TodoStatusOrder", () => {
  test("renders the controlled order as accessible sortable rows", () => {
    /** Accepts controlled updates; rendering alone must not invoke it. */
    const onChange = (): void => undefined;
    const markup = renderToStaticMarkup(
      <TodoStatusOrder order={["done", "todo", "doing"]} onChange={onChange} />,
    );

    expect(markup).toContain('aria-label="Status order"');
    expect(markup).toContain("Done status order. Position 1 of 3");
    expect(markup).toContain("Todo status order. Position 2 of 3");
    expect(markup).toContain("Doing status order. Position 3 of 3");
    expect(markup.indexOf("↕ Done")).toBeLessThan(markup.indexOf("↕ Todo"));
  });

  test("moves the source status to its final sortable index without mutating input", () => {
    const order = ["todo", "doing", "done"] as const;

    expect(reorderTodoStatuses(order, 2, 0)).toEqual(["done", "todo", "doing"]);
    expect(reorderTodoStatuses(order, 0, 2)).toEqual(["doing", "done", "todo"]);
    expect(reorderTodoStatuses(order, 2, 1)).toEqual(["todo", "done", "doing"]);
    expect(order).toEqual(["todo", "doing", "done"]);
  });

  test("returns the same sequence for no-op or invalid indexes", () => {
    const order = ["todo", "doing", "done"] as const;

    expect(reorderTodoStatuses(order, 1, 1)).toBe(order);
    expect(reorderTodoStatuses(order, -1, 1)).toBe(order);
    expect(reorderTodoStatuses(order, 0, 3)).toBe(order);
    expect(reorderTodoStatuses(order, 0, 1.5)).toBe(order);
  });
});
