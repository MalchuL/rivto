1. Remove from block definitions and move it to plugins
  slash?: {
    title: string;
    aliases?: string[];
    group?: string;
  };
  /** Command-backed actions shown in the main toolbar for this block. */
  toolbar?: BlockUIAction[];
  /** Command-backed actions shown beside this block. */
  sideMenu?: BlockUIAction[];
  /** Normalized event hooks and interaction capabilities. */
  behavior?: BlockBehavior;
Corresponding classes also must be part of plugins

2. Remove from block definitions and move it to plugins
export type BlockBehavior = Partial<Record<RuntimeEventType, RuntimeEventHandler>> & {
  /** Whether selection UI may treat this block as a selectable object. */
  selectable?: boolean;
  /** Whether interaction plugins may offer drag behavior for this block. */
  draggable?: boolean;
};
Corresponding features must be part of plugins. And without draggable or selectable. Plugin must define it.
3. Maybe we don't need 
 supportedModes?: EditorMode[];
 Because we already have this when define for rendering

4.   prepare(input: BlockInput): BlockInput {
    const definition = this.require(input.type);
    const props = { ...definition.defaultProps, ...input.props };
    return { ...input, props: definition.propSchema?.parse(props) ?? props };
  }
I think we can use more advanced merging properties. Like merge object keys hierarchically.
5. Don't use plugins inside editor, use inside demo
6. After fetching update, merge only changed (e.g. only blocks)
7. supports() maybe not needed.

src/editor/managers/command-registry.ts
8. registerDynamic not needed. Just use register() with dynamic name. We adds this for typing, but now we default names.
9. executeDynamic not needed. Just use execute() with dynamic name. We adds this for typing, but now we default names.
To supports type inference make this method generic. If we want to call something from plugin just specify plugin commands in <> brackets

