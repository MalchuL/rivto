import { Button } from "../../components/ui/button";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { PointerInput } from "@chulane/rivto-root";
import type { ElementRenderProps } from "../../managers/elements/types";
import type {
  ConnectorEndpoint,
  ConnectorEndpointKey,
  ConnectorGesture,
  ConnectorInteraction,
} from "./types";
import type { Point } from "@chulane/rivto-edgeless";
import { editorControlProps } from "../../constants";
import { useConnectorEndpointInput } from "./use-connector-endpoint-input";

/** Connector creation and reconnect gestures share the same canvas hit testing. */
export const ConnectorInteractionContext = createContext<ConnectorInteraction | null>(null);

/**
 * Keeps endpoint drag previews local to this connector renderer.
 *
 * @param props - Current connector snapshot and the receiving panel’s shared operations.
 * @param props.element - Persisted connector endpoints observed by the local preview.
 * @param props.operations - Panel operations used to commit the final property update.
 * @returns Current endpoints merged with a local draft, its setter and interaction context;
 * interaction is null outside the gesture provider. Draft setters never write document state.
 * Unmount clears reconnect hover through the provider.
 */
export function useConnectorPreview({ element, operations }: ElementRenderProps) {
  const interaction = useContext(ConnectorInteractionContext);
  const gesture = useRef<ConnectorGesture | null>(null);
  const [draft, setDraft] = useState<{
    key: "source" | "target";
    endpoint: ConnectorEndpoint;
  } | null>(null);
  const onReconnectHover = interaction?.onReconnectHover;
  useEffect(() => () => onReconnectHover?.(null), [onReconnectHover]);
  return {
    interaction,
    gesture,
    draft,
    setDraft,
    operations,
    source: draft?.key === "source" ? draft.endpoint : (element.props.source as ConnectorEndpoint),
    target: draft?.key === "target" ? draft.endpoint : (element.props.target as ConnectorEndpoint),
  };
}

/**
 * Selected connector endpoints use pointer capture and commit through the shared property API.
 *
 * Pointer movement updates a local endpoint draft; release writes one property patch.
 * Pointer cancellation clears the draft and hover without persisting changes.
 * Transparent buttons preserve reconnect pointer targets without painting endpoint boxes.
 * A circular marker appears on hover or keyboard focus to show where a reconnect may begin.
 *
 * @param props - Connector snapshot, selection state and state from useConnectorPreview.
 * @param props.element - Persisted connector frame used to position the endpoint targets.
 * @param props.selected - Whether the endpoint controls should be mounted.
 * @param props.preview - Local endpoint drafts and panel-owned interaction services.
 * @returns Endpoint controls when selected, an empty fragment when unselected, or null without an interaction provider.
 */
export function ConnectorEndpoints({
  element,
  selected,
  preview,
}: Omit<ElementRenderProps, "preview"> & { preview: ReturnType<typeof useConnectorPreview> }) {
  const { interaction, gesture, source, target, setDraft, operations } = preview;
  /**
   * Previews one endpoint and its current attachment target without changing the document.
   *
   * @param key - Endpoint being reconnected.
   * @param point - Pointer position in client CSS pixels.
   * @returns Updates the local draft and attachment feedback without writing the document.
   */
  const moveEndpoint = (key: "source" | "target", point: Point) => {
    const active = gesture.current;
    if (!active) {
      return;
    }
    const endpoint = active.interaction.resolveEndpoint(point);
    setDraft(endpoint ? { key, endpoint } : null);
    active.interaction.onReconnectHover(endpoint ? point : null);
  };
  /**
   * Commits the released endpoint and clears its local preview and attachment feedback.
   *
   * @param key - Endpoint being reconnected.
   * @param event - Release event supplying the final pointer position.
   * @returns Writes the endpoint through the panel's property operations when
   * its originating canvas attachment is available; otherwise clears the preview.
   * @throws If pointer capture release fails or the property update fails validation or storage.
   */
  const endEndpoint = (key: ConnectorEndpointKey, event: PointerInput) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    gesture.current = null;
    active.releasePointer();
    const endpoint = active.interaction.resolveEndpoint({ x: event.clientX, y: event.clientY });
    setDraft(null);
    active.interaction.onReconnectHover(null);
    if (endpoint) {
      operations.updateProperties(element.id, { [key]: endpoint });
    }
  };
  /**
   * Clears the active gesture and releases its original pointer capture.
   *
   * @returns The local draft and attachment feedback are cleared without a document write.
   * @throws If pointer release or feedback cleanup fails.
   */
  const cancelEndpoint = () => {
    const active = gesture.current;
    if (!active) {
      return;
    }
    gesture.current = null;
    try {
      active.releasePointer();
    } finally {
      setDraft(null);
      active.interaction.onReconnectHover(null);
    }
  };
  /**
   * Applies normalized pointer input to the originating endpoint gesture.
   *
   * @param key - Endpoint receiving this input.
   * @param input - Current Root-normalized pointer delivery.
   * @returns Updates the local preview or commits the released endpoint.
   * @throws Propagates pointer capture or document update failures.
   */
  const onInput = (key: ConnectorEndpointKey, input: PointerInput) => {
    if (input.type === "pointerdown") {
      if (!interaction) {
        return;
      }
      const releasePointer = input.captureTargetPointer("[data-edgeless-connector-endpoint]");
      if (!releasePointer) {
        return;
      }
      cancelEndpoint();
      input.stopPropagation();
      gesture.current = { pointerId: input.pointerId, interaction, releasePointer };
      moveEndpoint(key, { x: input.clientX, y: input.clientY });
      return;
    }
    if (input.type === "pointerup") {
      input.stopPropagation();
    }
    const active = gesture.current;
    if (!active || active.pointerId !== input.pointerId) {
      return;
    }
    if (input.type === "pointermove") {
      input.stopPropagation();
      moveEndpoint(key, { x: input.clientX, y: input.clientY });
    } else if (input.type === "pointerup") {
      endEndpoint(key, input);
    } else if (input.type === "pointercancel" || input.type === "lostpointercapture") {
      cancelEndpoint();
    }
  };
  const endpointRefs = useConnectorEndpointInput(
    interaction?.inputRoot,
    selected && !!interaction,
    onInput,
    cancelEndpoint,
  );
  if (!interaction) {
    return null;
  }
  return (
    <>
      {selected &&
        (["source", "target"] as const).map((key) => {
          const point = (key === "source" ? source : target).position;
          return (
            <Button
              variant="ghost"
              {...editorControlProps}
              key={key}
              ref={endpointRefs[key]}
              className="edgeless-connector-endpoint border-0 bg-transparent hover:bg-transparent"
              data-edgeless-connector-endpoint={key}
              type="button"
              aria-label={`Reconnect ${key}`}
              style={{ left: point.x - element.frame.x, top: point.y - element.frame.y }}
            />
          );
        })}
    </>
  );
}
