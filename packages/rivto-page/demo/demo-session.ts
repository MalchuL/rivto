import { KanbanLayout, ColumnLayout, BentoLayout, ContainerTitle } from "./container-layouts";
import type { ComponentType } from "react";
import {
  BlockEditorController,
  BlockListSlot,
  BlockCollapseSlot,
  type BlockRenderer,
  type BlockWrapperComponent,
  type BlockSlotProps,
} from "../src";
import { DemoAdapter } from "./demo-adapter";
import { DemoBlock } from "./demo-block";

/** Example host owning data and a separately configured editor across view remounts. */
export class DemoSession {
  readonly adapter: DemoAdapter;
  readonly editor: BlockEditorController;
  private removeCustomRenderer: (() => void) | undefined;
  private removeExtraSlot: (() => void) | undefined;
  private removeWrapper: (() => void) | undefined;

  /**
   * Creates example data and installs structural controls as an editor extension.
   *
   * @param repeat - Fixture multiplier clamped to 1–200 by the demo root.
   * @param example - Host-only fixture choice; defaults to the existing outline.
   */
  constructor(repeat: number, example: "outline" | "kanban" | "bento" = "outline") {
    this.adapter = new DemoAdapter(repeat, example);
    this.editor = new BlockEditorController({ adapter: this.adapter });
    this.editor.extensions.register("demo-block-presentation", {
      /**
       * Installs demo presentation and whole-editor focus observation.
       *
       * @param editor - Instance automatically owning these synchronous registrations.
       * @returns Registrations remain active until the session ends.
       */
      setup(editor) {
        editor.renderers.register("text", { content: DemoBlock });
        editor.renderers.register("demo-kanban", { content: ContainerTitle, layout: KanbanLayout });
        editor.renderers.register("demo-column", { content: ContainerTitle, layout: ColumnLayout });
        editor.renderers.register("demo-bento", { content: ContainerTitle, layout: BentoLayout });
        editor.slots.register({ position: "start", component: BlockListSlot, priority: 300 });
        editor.slots.register({ position: "start", component: BlockCollapseSlot, priority: 200 });
        editor.events.on("focus", () =>
          editor.getRoot()?.setAttribute("data-demo-focused", "true"),
        );
        editor.events.on("blur", () => editor.getRoot()?.removeAttribute("data-demo-focused"));
      },
    });
  }

  /**
   * Replaces the optional content renderer without changing data or editor identity.
   *
   * @param renderer - Stable host component, or undefined to remove its registration.
   * @returns The previous renderer is removed and the requested renderer is installed.
   */
  setCustomRenderer(renderer: BlockRenderer | undefined): void {
    this.removeCustomRenderer?.();
    this.removeCustomRenderer = undefined;
    if (renderer) {
      this.removeCustomRenderer = this.editor.renderers.register("custom", { content: renderer });
    }
  }

  /**
   * Installs or removes a dynamic extension contributing a block end slot.
   *
   * @param component - Stable host component, or undefined to uninstall the extension.
   * @returns Previous extension resources are released before the replacement is installed.
   */
  setExtraSlot(component: ComponentType<BlockSlotProps> | undefined): void {
    this.removeExtraSlot?.();
    this.removeExtraSlot = undefined;
    if (component) {
      this.removeExtraSlot = this.editor.extensions.register("demo-extra-slot", {
        /**
         * Adds a host component to each block's end anchor.
         *
         * @param editor - Instance owning this extension's captured registration.
         * @returns The slot is installed and is released automatically on extension removal.
         */
        setup(editor) {
          editor.slots.register({ position: "end", component });
        },
      });
    }
  }

  /**
   * Replaces a dynamically installed extension contributing a generic block decorator.
   *
   * @param component - Stable host decorator, or undefined to remove its extension.
   * @returns Previous registration is released before the requested decorator is installed.
   * @throws Propagates extension setup or cleanup failures.
   */
  setWrapper(component: BlockWrapperComponent | undefined): void {
    this.removeWrapper?.();
    this.removeWrapper = undefined;
    if (component) {
      this.removeWrapper = this.editor.extensions.register("demo-wrapper", {
        /**
         * Adds a decorator owning its element and pointer handler through the wrapper registry.
         *
         * @param editor - Borrowed editor capturing this registration for extension cleanup.
         * @returns The decorator remains installed until this extension is removed.
         */
        setup(editor) {
          editor.wrappers.register({ component, priority: 100 });
        },
      });
    }
  }

  /**
   * Ends the host session and releases editor resources after the view is removed.
   *
   * @returns The editor's registrations, event subscriptions, and node cache are released.
   * @throws Propagates aggregated editor cleanup failures.
   */
  destroy(): void {
    this.editor.destroy();
  }
}
