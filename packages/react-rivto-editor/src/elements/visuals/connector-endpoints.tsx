import { Button } from "../../components/ui/button";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ElementRenderProps } from "../../managers/elements/types";
import type { ConnectorEndpoint } from "./types";
import { editorControlProps } from "../../constants";

/** Connector creation and reconnect gestures share the same canvas hit testing. */
export const ConnectorInteractionContext = createContext<{
  /**
   * Resolves pointer coordinates to a connector attachment or free endpoint.
   *
   * @param event - Native or React event supplying the current input.
   * @returns Endpoint at the pointer's current position.
   */
  resolveEndpoint(event: Pick<PointerEvent, "clientX" | "clientY">): ConnectorEndpoint;
  /**
   * Updates the reconnect hover target, or clears it when the pointer is absent.
   *
   * @param event - Native or React event supplying the current input.
   */
  onReconnectHover(event: Pick<PointerEvent, "clientX" | "clientY"> | null): void;
} | null>(null);

/**
 * Keeps endpoint drag previews local to this connector renderer.
 * @param props - Current connector snapshot and the receiving panel’s shared operations.
 * @returns Current endpoints merged with a local draft, its setter and interaction context;
 * interaction is null outside the gesture provider. Draft setters never write document state.
 * Unmount clears reconnect hover through the provider.
 */
export function useConnectorPreview({ element, operations }: ElementRenderProps) {
  const interaction = useContext(ConnectorInteractionContext);
  const [draft, setDraft] = useState<{
    key: "source" | "target";
    endpoint: ConnectorEndpoint;
  } | null>(null);
  const onReconnectHover = interaction?.onReconnectHover;
  useEffect(() => () => onReconnectHover?.(null), [onReconnectHover]);
  return {
    interaction,
    draft,
    setDraft,
    operations,
    source: draft?.key === "source" ? draft.endpoint : (element.props.source as ConnectorEndpoint),
    target: draft?.key === "target" ? draft.endpoint : (element.props.target as ConnectorEndpoint),
  };
}

/**
 * Selected connector endpoints use pointer capture and commit through the shared property API.
 * Pointer movement updates a local endpoint draft; release writes one property patch.
 * Pointer cancellation clears the draft and hover without persisting changes.
 * @param props - Connector snapshot, selection state and state from useConnectorPreview.
 * @returns Endpoint controls when selected, an empty fragment when unselected, or null without an interaction provider.
 */
export function ConnectorEndpoints({
  element,
  selected,
  preview,
}: Omit<ElementRenderProps, "preview"> & { preview: ReturnType<typeof useConnectorPreview> }) {
  const { interaction, source, target, setDraft, operations } = preview;
  if (!interaction) {
    return null;
  }
  const { resolveEndpoint, onReconnectHover } = interaction;
  const moveEndpoint = (
    key: "source" | "target",
    event: Pick<PointerEvent, "clientX" | "clientY">,
  ) => {
    setDraft({ key, endpoint: resolveEndpoint(event) });
    onReconnectHover(event);
  };
  const endEndpoint = (key: "source" | "target", event: ReactPointerEvent<HTMLButtonElement>) => {
    const endpoint = resolveEndpoint(event.nativeEvent);
    setDraft(null);
    onReconnectHover(null);
    operations.updateProperties(element.id, { [key]: endpoint });
  };
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
              className="edgeless-connector-endpoint"
              data-edgeless-connector-endpoint={key}
              type="button"
              aria-label={`Reconnect ${key}`}
              style={{ left: point.x - element.frame.x, top: point.y - element.frame.y }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                event.stopPropagation();
                moveEndpoint(key, event.nativeEvent);
              }}
              onPointerMove={(event) => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                  return;
                }
                event.stopPropagation();
                moveEndpoint(key, event.nativeEvent);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                endEndpoint(key, event);
              }}
              onPointerCancel={() => {
                setDraft(null);
                onReconnectHover(null);
              }}
            />
          );
        })}
    </>
  );
}
