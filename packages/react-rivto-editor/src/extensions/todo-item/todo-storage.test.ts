/**
 * Covers TODO-storage validation and its pure direct-child search, filtering,
 * project, and stable ordering rules without coupling behavior to DOM layout.
 *
 * @module
 */
import type { EditorBlock } from "@chulane/rivto";
import {
  createTodoStorageProps,
  deriveTodoProjects,
  matchesTodoStorage,
  normalizeTodoSearch,
  orderTodoStorageChildren,
  todoStoragePropsSchema,
} from "./todo-storage";

/** Builds a detached block sufficient for storage rule tests. */
function block(id: string, type: string, props: Record<string, unknown> = {}, content = id): EditorBlock {
  return { id, type, content, props, listProps: {}, pluginData: {}, children: [] };
}

/** Builds a TODO child with valid searchable/filterable properties. */
function todo(
  id: string,
  status: "todo" | "doing" | "done",
  priority: 1 | 2 | 3 | 4,
  project: string,
  description = "",
): EditorBlock {
  return block(id, "todo-item", { status, priority, project, description }, id);
}

describe("TODO storage rules", () => {
  test("provides defaults and validates only exact status permutations", () => {
    expect(createTodoStorageProps()).toEqual({ orderMode: "status", statusOrder: ["todo", "doing", "done"] });
    expect(todoStoragePropsSchema.safeParse(createTodoStorageProps()).success).toBe(true);
    expect(todoStoragePropsSchema.safeParse({ orderMode: "status", statusOrder: ["todo", "todo", "done"] }).success).toBe(false);
    expect(todoStoragePropsSchema.safeParse({ orderMode: "manual", statusOrder: ["done", "doing", "todo"] }).success).toBe(true);
  });

  test("normalizes search and combines categories with AND and values with OR", () => {
    const candidate = todo("Write Spec", "doing", 2, "Rivto", "Résumé review");
    expect(normalizeTodoSearch("ＲÉSUMÉ")).toBe("résumé");
    expect(matchesTodoStorage(candidate, "résumé", {
      statuses: new Set(["todo", "doing"]),
      priorities: new Set([1, 2]),
      projects: new Set(["Rivto"]),
    })).toBe(true);
    expect(matchesTodoStorage(candidate, "write", {
      statuses: new Set(["done"]),
      priorities: new Set(),
      projects: new Set(),
    })).toBe(false);
  });

  test("derives display-sorted projects and retains no project", () => {
    expect(deriveTodoProjects([
      todo("a", "todo", 1, "Zulu"),
      block("note", "paragraph", { project: "Ignored" }),
      todo("b", "done", 2, ""),
      todo("c", "doing", 3, "Alpha"),
      todo("d", "todo", 4, "Zulu"),
    ])).toEqual(["Alpha", "", "Zulu"]);
  });

  test("stably sorts TODOs while retaining non-TODO slots", () => {
    const children = [
      todo("doing-1", "doing", 1, ""),
      block("note", "paragraph"),
      todo("todo-1", "todo", 1, ""),
      todo("doing-2", "doing", 1, ""),
      block("separator", "separator"),
      todo("done-1", "done", 1, ""),
    ];
    expect(orderTodoStorageChildren(children, ["done", "doing", "todo"])).toEqual([
      "done-1", "note", "doing-1", "doing-2", "separator", "todo-1",
    ]);
  });
});
