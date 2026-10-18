import type { ReactNode } from "react";
import { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import type {
  EdgelessTool,
  EdgelessToolOptions,
  EdgelessToolPointer,
} from "../../../../managers/edgeless-tools/edgeless-tool";
import type {
  ConnectorEndpoint,
  ConnectorRoute,
  ConnectorLineStyle,
  ConnectorEndpointStyle,
} from "../../../../elements/visuals/types";
import { ConnectorTargets, type ConnectorHover, type ConnectorPreview } from "./connector-targets";
import { ConnectorGesturePreview } from "./connector-preview";
import { VISUAL_ELEMENT_TYPES } from "../../../../elements/visuals/constants";

/** Connector creation with local endpoint and attachment previews. */
export class ConnectorTool extends EdgelessCreationTool {
  override readonly supportsPlacement = false;
  private pointerId?: number;
  private source?: ConnectorEndpoint;
  private target?: ConnectorEndpoint;
  private preview: ConnectorPreview | null = null;
  private hover: ConnectorHover | null = null;

  /**
   * Binds a route preset to the connector's registered type and shared settings.
   *
   * @param options - Surface dependencies and resolved group.
   * @param route - Route preset selected by this registered tool.
   */
  constructor(
    options: EdgelessToolOptions,
    readonly route: ConnectorRoute,
  ) {
    super({
      ...options,
      type: VISUAL_ELEMENT_TYPES.connector,
      create: () => ({ type: VISUAL_ELEMENT_TYPES.connector }),
    });
  }

  /**
   * Applies the selected route without changing existing connector records.
   *
   * @param _previous - Previously active tool.
   * @returns Updates the group's route setting.
   */
  override activate(_previous?: EdgelessTool): void {
    this.group?.setSettings({ props: { route: this.route } });
  }

  /**
   * Starts a connector only when the primary pointer hits an attachment target.
   *
   * @param input - Initial point and attachment-halo scale.
   * @returns Whether a valid source was found and the pointer should be captured.
   */
  override pointerDown(input: EdgelessToolPointer): boolean {
    if (input.button !== 0) {
      return false;
    }
    const targets = new ConnectorTargets(this.options.operations, input.zoom);
    const id = targets.objectAt(input.point);
    if (!id) {
      return false;
    }
    this.pointerId = input.pointerId;
    this.source = targets.endpoint(id, input.point);
    this.hover = targets.hoverFor(input.point);
    this.changed();
    return true;
  }

  /**
   * Updates attachment hover and a detached connector path.
   *
   * @param input - Current canvas point and scale.
   * @returns Publishes local geometry without document updates.
   */
  override pointerMove(input: EdgelessToolPointer): void {
    const targets = new ConnectorTargets(this.options.operations, input.zoom);
    this.hover = targets.hoverFor(input.point);
    if (input.pointerId === this.pointerId && this.source) {
      const id = targets.objectAt(input.point);
      this.target = id ? targets.endpoint(id, input.point) : undefined;
      this.preview = {
        source: this.source.position,
        target: this.target?.position ?? input.point,
        route: this.route,
        sourceAnchor: this.source.anchor,
        targetAnchor: this.target?.anchor,
        sourceFrame: this.source.elementId
          ? this.options.operations.getBounds(this.source.elementId)
          : undefined,
        targetFrame: this.target?.elementId
          ? this.options.operations.getBounds(this.target.elementId)
          : undefined,
      };
    }
    this.changed();
  }

  /**
   * Creates one connector when both endpoints resolve to eligible targets.
   *
   * @param input - Accepted pointer release.
   * @returns Commits valid geometry and clears the draft even when creation fails.
   * @throws If the element manager rejects creation.
   */
  override pointerUp(input: EdgelessToolPointer): void {
    if (input.pointerId !== this.pointerId) {
      return;
    }
    try {
      if (this.source && this.target) {
        this.options.operations.createElement({
          type: this.creation.type,
          props: { source: this.source, target: this.target, route: this.route },
        });
      }
    } finally {
      this.cancel();
    }
    this.pointerMove(input);
  }

  /**
   * Clears hover feedback when leaving without a captured connection.
   *
   * @returns Publishes the removed hover marker.
   */
  override pointerLeave(): void {
    if (this.pointerId === undefined) {
      this.hover = null;
      this.changed();
    }
  }

  /**
   * Clears source, target and preview without changing document or settings.
   *
   * @returns Whether an active connection gesture was cancelled.
   */
  override cancel(): boolean {
    const active = this.pointerId !== undefined;
    this.pointerId = undefined;
    this.source = undefined;
    this.target = undefined;
    this.preview = null;
    this.hover = null;
    this.changed();
    return active;
  }

  /**
   * Renders path, markers and attachment feedback using shared connector styles.
   *
   * @param zoom - Canvas scale used for screen-sized strokes and anchor markers.
   * @returns Connector-specific SVG preview.
   */
  override renderPreview(zoom: number): ReactNode {
    const props = this.getSettings().props!;
    return (
      <ConnectorGesturePreview
        zoom={zoom}
        connectorPreview={this.preview}
        connectorHover={this.hover}
        connectorStroke={String(props.stroke)}
        connectorStrokeWidth={Number(props.strokeWidth)}
        connectorLineStyle={props.lineStyle as ConnectorLineStyle}
        connectorStartStyle={props.startStyle as ConnectorEndpointStyle}
        connectorEndStyle={props.endStyle as ConnectorEndpointStyle}
      />
    );
  }
}
