# View Notes

## UI Plugins

Block renderers only own visual content for one block. UI behavior such as drag
and drop, block handles, slash menus, format bars, and selection overlays should
live in view plugins instead of individual block renderers.

Minimal future shape:

```ts
interface ViewPluginContext {
  editor: RivtoEditorApi;
  surface: SurfaceType;
  root: HTMLElement;
}

interface ViewPlugin {
  id: string;
  mount(context: ViewPluginContext): void | (() => void);
}
```

This keeps behavior modular without adding DI or a full event framework. A
plugin can attach DOM listeners to the editor root and return one cleanup
function.

For drag and drop, the view layer also needs a stable DOM convention:

```tsx
<div data-rivto-block-id={block.id}>...</div>
```

Recommended order:

1. Renderer registry.
2. Surface component types.
3. Editor view component.
4. Stable block DOM marker.
5. View plugin type and simple mounting.
6. Drag and drop plugin.
