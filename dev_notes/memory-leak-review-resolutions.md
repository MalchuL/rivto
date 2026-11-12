# Memory leak review resolutions

- Editor storage now attempts registry, reference resolver, and document cleanup even when an earlier disposer fails. Failures are reported together, and repeated destruction shares the same promise. The editor storage test covers a throwing registry disposer.
- The public attachment API now documents that aborting stops waiting for a provider read without necessarily stopping the provider itself.
- The document pane's close callback now documents its parameter and side effect.

## Remaining review items

- The indent shortcut and several new browser tests exceed the repository's 50-line function guideline. Their extraction still needs to preserve selection restoration, viewport settlement, and test assertions.
- Closing the last demo document still compacts, base64-encodes, and writes its snapshot synchronously. Measure representative small and large documents before choosing a replacement; moving the same work to an idle callback alone would not eliminate the blocking work. Preserve reopen, storage-failure, and concurrent-model behavior when changing it.
