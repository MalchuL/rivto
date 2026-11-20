import { useEffect, useMemo } from "react";
import type { PointerEvent } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { PREVENT_TEXT_EDITING_ATTRIBUTE } from "../../constants";
import { useReactPanelContext } from "../editor/use-react-panel-context";
import { NestedEditableSelection } from "./nested-editable-selection";
import type { PreventTextEditingAttributes } from "./types";

export type { PreventTextEditingAttributes } from "./types";

/**
 * Gives nested controls their own pointer gestures without activating raw block editing.
 *
 * Root owns the accepted editable selection and its temporary window listeners.
 * The hook releases a gesture when its occurrence changes or the component unmounts.
 *
 * @returns Stable opt-out attributes; temporary window listeners are removed on unmount.
 * @throws If used outside an EditorPanel or if Root gesture setup fails.
 */
export function usePreventTextEditing(): PreventTextEditingAttributes {
  const { reactPanel } = useReactPanelContext();
  const selection = useMemo(() => new NestedEditableSelection(reactPanel), [reactPanel]);
  const attributes = useMemo(() => {
    /**
     * Gives a nested editable its own pointer selection without activating the parent.
     *
     * @param event - React pointer delivery, absent when called outside React.
     * @returns Propagation stops and Root tracks any accepted editable gesture when delivered.
     * @throws Propagates Root selection, subscription, and cleanup failures.
     */
    const onPointerDown = (event?: PointerEvent<HTMLElement>) => {
      if (!event) {
        return;
      }
      event.stopPropagation();
      const root = reactPanel.inputRoot;
      const region = root?.captureRegionByIdentity(getBrowserElementIdentity(event.currentTarget));
      if (root && region) {
        selection.start(root, region, {
          clientX: event.clientX,
          clientY: event.clientY,
          pointerId: event.pointerId,
          preventDefault: () => event.preventDefault(),
        });
      }
    };
    return { [PREVENT_TEXT_EDITING_ATTRIBUTE]: "" as const, onPointerDown };
  }, [reactPanel, selection]);
  useEffect(() => () => selection.destroy(), [selection]);
  return attributes;
}
