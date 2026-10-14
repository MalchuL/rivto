/**
 * Accessible drag-handle slot for one page block row.
 *
 * The button is the only sensor activator. dnd-kit binds pointer and keyboard
 * listeners through the handle ref supplied by the armed registration, and its
 * accessibility plugin decorates the same element with role description,
 * description, and pressed state, so no legacy attribute spreading remains.
 * Reveal-on-hover geometry lives in `block-handle.css` because it depends on
 * ancestor row and container state.
 *
 * @module
 */
export { BlockHandle as PageDragBlockSlot } from "../../../components/block-handle/block-handle";
