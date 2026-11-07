import type { BinaryProvider } from "../../../attachments";
import type { ReactEditorApi } from "../../../editor/types";

/** Provider registration associated with one editor runtime. */
interface FileProviderRegistration {
  /** Provider used for generic file references. */
  readonly provider: BinaryProvider;
}

const FILE_PROVIDER_KEY = "rivto.file.provider";

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
  const space = editor.extensions.shared;
  const release = space.reserve(FILE_PROVIDER_KEY, "value");
  const shared = space.getValue<FileProviderRegistration>(FILE_PROVIDER_KEY)!;
  shared.set(registration);
  // An older disposer must not remove a newer registration for the same editor.
  return () => {
    try {
      if (space.getValue<FileProviderRegistration>(FILE_PROVIDER_KEY)?.get() === registration) {
        shared.set(undefined);
      }
    } finally {
      release();
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
  return editor.extensions.shared.getValue<FileProviderRegistration>(FILE_PROVIDER_KEY)?.get()
    ?.provider;
}
