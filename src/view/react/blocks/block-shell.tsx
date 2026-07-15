import { createElement, type HTMLAttributes, type MouseEvent, type ReactNode, type Ref } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { EditorBlock } from "../../../editor/model";
import type { SurfaceRenderProps, SurfaceType } from "../editor/types";
import { RIVTO_BLOCK_ATTR, RIVTO_SELECTED_ATTR } from "./dom";
import { RIVTO_BLOCK_HANDLE_CLASS, RIVTO_BLOCK_SHELL_CLASS } from "./constants";

interface BlockShellProps {
  /** Detached block value represented by this shell. */
  readonly block: EditorBlock;
  /** Editor runtime used for selection commands. */
  readonly editor: RivtoEditorApi;
  /** Surface currently placing this shell. */
  readonly surface: SurfaceType;
  /** Surface props used to render content and child shells. */
  readonly renderProps: SurfaceRenderProps;
  /** Whether this shell is part of the current block/edgeless selection. */
  readonly selected: boolean;
  /** Extra class names supplied by surface-specific wrappers. */
  readonly className?: string;
  /** Surface-specific styles, including sortable transforms or canvas position. */
  readonly style?: HTMLAttributes<HTMLDivElement>["style"];
  /** Optional handle props from dnd-kit or custom edgeless dragging. */
  readonly handleProps?: HTMLAttributes<HTMLButtonElement>;
  /** Extra shell props, kept small so surfaces own layout behavior. */
  readonly shellProps?: HTMLAttributes<HTMLDivElement> & Record<string, unknown> & { ref?: Ref<HTMLDivElement> };
  /** Optional recursive renderer supplied by surfaces that wrap children. */
  readonly renderChild?: (block: EditorBlock) => ReactNode;
}

function isSelected(editor: RivtoEditorApi, blockId: string): boolean {
  const selection = editor.selection.get();
  return selection ? selection.type !== "text" && selection.blockIds.includes(blockId) : false;
}

function defaultSelect(editor: RivtoEditorApi, surface: SurfaceType, blockId: string): void {
  if (surface === "edgeless") {
    editor.execute("selection.set", { selection: { type: "edgeless", blockIds: [blockId] } });
    return;
  }
  editor.execute("selection.set", {
    selection: {
      type: "block",
      blockIds: [blockId],
      anchorBlockId: blockId,
      focusBlockId: blockId,
    },
  });
}

/**
 * Generic React block wrapper.
 *
 * The shell owns DOM markers, selection visuals, the drag handle slot, and
 * recursive child placement. Concrete block renderers stay content-only, so a
 * paragraph renderer does not need to know whether it is on the page surface,
 * on the edgeless canvas, selected, sortable, or nested.
 */
export function BlockShell({
  block,
  editor,
  surface,
  renderProps,
  selected,
  className,
  style,
  handleProps,
  shellProps,
  renderChild,
}: BlockShellProps): ReactNode {
  const renderer = renderProps.renderers.get(block.type, surface);
  const content = renderer
    ? createElement(renderer.component, { block, editor, surface })
    : renderProps.fallback?.(block);
  if (!content) return null;
  const children = block.children.map((child) => renderChild ? renderChild(child) : createElement(BlockShell, {
    key: child.id,
    block: child,
    editor,
    surface,
    renderProps,
    selected: isSelected(editor, child.id),
  }));
  const shellClass = [RIVTO_BLOCK_SHELL_CLASS, className].filter(Boolean).join(" ");

  return createElement(
    "div",
    {
      ...shellProps,
      key: block.id,
      className: shellClass,
      [RIVTO_BLOCK_ATTR]: block.id,
      "data-type": block.type,
      [RIVTO_SELECTED_ATTR]: selected ? "true" : undefined,
      style,
      onClick(event) {
        shellProps?.onClick?.(event);
        if (event.defaultPrevented) return;
        const target = typeof Element !== "undefined" && event.target instanceof Element ? event.target : null;
        if (target?.closest('[contenteditable="true"],input,textarea,select,a,button')) return;
        event.stopPropagation();
        defaultSelect(editor, surface, block.id);
      },
    },
    createElement("button", {
      type: "button",
      "aria-label": "Drag block",
      ...handleProps,
      className: [RIVTO_BLOCK_HANDLE_CLASS, handleProps?.className].filter(Boolean).join(" "),
      onClick(event) {
        (handleProps?.onClick as ((event: MouseEvent<HTMLButtonElement>) => void) | undefined)?.(event as unknown as MouseEvent<HTMLButtonElement>);
        if (event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        defaultSelect(editor, surface, block.id);
      },
    }),
    content,
    children.length ? createElement("div", { className: "rv-block-children" }, children) : null,
  );
}
