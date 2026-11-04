import type { BinaryProvider } from "../../../attachments";
import type { ReactEditorApi } from "../../../editor/types";

interface FileProviderRegistration {
  readonly provider: BinaryProvider;
}

const FILE_PROVIDERS = new WeakMap<ReactEditorApi, FileProviderRegistration>();

/**
 * Registers the provider owned by the generic file extension.
 *
 * @param editor - Editor whose file operations use the provider.
 * @param provider - Provider for generic file references.
 * @returns A disposer that removes this registration.
 */
export function configureFileProvider(
  editor: ReactEditorApi,
  provider: BinaryProvider,
): () => void {
  const registration = { provider };
  FILE_PROVIDERS.set(editor, registration);
  return () => {
    if (FILE_PROVIDERS.get(editor) === registration) {
      FILE_PROVIDERS.delete(editor);
    }
  };
}

/**
 * Reads the provider installed by the generic file extension.
 *
 * @param editor - Editor whose generic file extension is queried.
 * @returns Its provider, or undefined when the extension is not installed.
 */
export function getFileProvider(editor: ReactEditorApi): BinaryProvider | undefined {
  return FILE_PROVIDERS.get(editor)?.provider;
}
