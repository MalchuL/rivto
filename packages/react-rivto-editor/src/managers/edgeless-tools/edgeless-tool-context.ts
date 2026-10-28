import { CanvasToolContext } from "@chulane/rivto-edgeless";
import type { ReactPanelApi } from "../../panels/types";
import type { EdgelessToolbarTool, EdgelessToolbarGroup } from "../edgeless-toolbar/types";
import { EdgelessOperations } from "../elements/edgeless-operations";
import { EdgelessCreationDefaults } from "../elements/edgeless-creation-defaults";
import { EdgelessToolGroup } from "./edgeless-tool-group";
import type { EdgelessTool } from "./edgeless-tool";

/** Binds shared canvas tool ownership to one Rivto panel's document operations and settings. */
export class EdgelessToolContext extends CanvasToolContext<
  EdgelessTool,
  EdgelessToolGroup,
  EdgelessToolbarTool,
  EdgelessToolbarGroup
> {
  readonly defaults: EdgelessCreationDefaults;
  readonly operations: EdgelessOperations;

  /**
   * Creates isolated settings and document operations without external subscriptions.
   *
   * @param reactPanel - Fixed receiving panel; other surfaces create their own context.
   * @param defaults - Optional existing surface settings to retain during integration.
   */
  constructor(
    readonly reactPanel: ReactPanelApi,
    defaults = new EdgelessCreationDefaults(reactPanel.editor),
  ) {
    const operations = new EdgelessOperations(reactPanel.editor, reactPanel, defaults);
    super({
      registry: reactPanel.editor.edgelessToolbar,
      /**
       * Connects a registered group to the receiving surface's remembered settings.
       *
       * @param registration - Shared group metadata and settings policy.
       * @returns A group bound to this context's defaults owner.
       */
      createGroup: (registration) => new EdgelessToolGroup(registration, defaults),
      /**
       * Creates a registered tool with this panel's document operations.
       *
       * @param registration - Application tool factory and identity.
       * @param group - Surface-local settings group, absent for standalone tools.
       * @returns A new tool instance owned by this context.
       */
      createTool: (registration, group) =>
        registration.createTool({
          id: registration.id,
          operations,
          defaults,
          reactPanel,
          group,
        }),
    });
    this.defaults = defaults;
    this.operations = operations;
  }

  /**
   * Observes registrations, document changes, creation defaults and receiving-panel deactivation after mount.
   *
   * @returns Cleanup cancelling tools and releasing defaults, document, panel and registry subscriptions.
   */
  override observeChanges(): () => void {
    const stopTools = super.observeChanges();
    let stopDefaults: (() => void) | undefined;
    let stopOperations: (() => void) | undefined;
    let stopDeactivate: (() => void) | undefined;
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      try {
        try {
          stopDefaults?.();
        } finally {
          stopDeactivate?.();
        }
      } finally {
        try {
          stopOperations?.();
        } finally {
          stopTools();
        }
      }
    };
    try {
      stopDefaults = this.defaults.subscribe(() => this.changed());
      stopOperations = this.operations.observeChanges();
      stopDeactivate = this.reactPanel.subscribeDeactivation(() => this.active?.cancel());
    } catch (error) {
      try {
        release();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Edgeless tools connection failed");
      }
      throw error;
    }
    return release;
  }
}
