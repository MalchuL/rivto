import type { ReactEditorExtension } from "@chulane/rivto-react";

interface DynamicExtensionModule {
  /**
   * Creates a fresh registration for one document runtime.
   *
   * @returns Extension installed by the runtime.
   */
  createExtension(): ReactEditorExtension;
}

let factories: readonly DynamicExtensionModule[] = [];

/**
 * Loads the demo's JavaScript extension modules before any document editor is created.
 *
 * @returns Resolves when all extension factories are available; loading errors reject.
 */
export async function loadDynamicExtensions(): Promise<void> {
  const response = await fetch("/dynamic-extensions.json");
  if (!response.ok) {
    throw new Error(`Failed to load extension list: ${response.status}`);
  }
  const urls: unknown = await response.json();
  if (!Array.isArray(urls) || !urls.every((url) => typeof url === "string")) {
    throw new TypeError("Extension list must contain module URLs");
  }
  factories = await Promise.all(
    urls.map((url: string) => import(/* @vite-ignore */ url) as Promise<DynamicExtensionModule>),
  );
}

/**
 * Creates independent extension registrations for a document's editor runtime.
 *
 * @returns Extensions from the loaded JavaScript modules.
 */
export function createDynamicExtensions(): ReactEditorExtension[] {
  return factories.map(({ createExtension }) => createExtension());
}
