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

  test("moves the active status to the sortable target without mutating input", () => {
    const order = ["todo", "doing", "done"] as const;

    expect(reorderTodoStatuses(order, "done", "todo")).toEqual(["done", "todo", "doing"]);
    expect(order).toEqual(["todo", "doing", "done"]);
    expect(reorderTodoStatuses(order, "doing", "doing")).toBe(order);
    expect(reorderTodoStatuses(order, "done", "done", -30)).toEqual(["todo", "done", "doing"]);
  });
});
