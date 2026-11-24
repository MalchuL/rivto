# HTML surface review against main

## [P1] Revoke iframe access when it navigates away from the approved source

[html-frame.tsx:456](../packages/react-rivto-editor/src/extensions/html-surface/components/html-frame.tsx#L456)

A link or form can navigate the iframe while the persisted block source stays unchanged. On the next `load`, the host sends the replacement document the widget snapshot and the same bridge token. The browser also retains the iframe’s `WindowProxy`, so the sender check still passes. For an enabled Unsafe HTML block, the replacement document consequently inherits editor access that the user granted to the original source. Bind the bridge to the authored document’s lifetime and invalidate it on navigation.

## [P2] Preserve concurrent widget updates when saving a source draft

[html-block.tsx:300](../packages/react-rivto-editor/src/extensions/html-surface/components/html-block.tsx#L300)

If a collaborator adds a property while the source editor is open, clicking **Done** deletes it even when the local user edited only HTML. `replacedPropPatch` compares the opening draft against the *current* properties and marks every missing key for deletion. The element editor uses the same logic, and both editors also write the opening source back after a props-only edit. Compute the user’s changes against the opening snapshot and apply only those changes to the current node.

## [P2] Scope source-editing state to the mounted panel

[use-html-editing.ts:105](../packages/react-rivto-editor/src/extensions/html-surface/hooks/use-html-editing.ts#L105)

Two panels on the same React editor share the extension store. When both display the same block, **Edit HTML** opens a separate draft in each panel because the store key contains only the kind and ID. Saving or closing either editor unmounts both and discards the other panel’s unsaved draft. The existing isolation test uses two independent editor runtimes, which misses this supported layout.

## [P2] Keep native disclosure controls outside host drag regions

[protocol.ts:268](../packages/react-rivto-editor/src/extensions/html-surface/protocol/protocol.ts#L268)

The automatic control selector omits `<summary>`. Its text is excluded separately, but the host places a drag target over the rest of the clickable disclosure row. In Chromium I confirmed that a point inside a 300-pixel-wide summary, to the right of its title, was claimed by the host. Exclude the native control’s full hit area.

## [P2] Refresh automatic drag regions after native layout changes

[protocol.ts:347](../packages/react-rivto-editor/src/extensions/html-surface/protocol/protocol.ts#L347)

Opening `<details>` moves the controls below it. The mutation filter misses `open`, and the handle resize observer watches explicit markers only. In a fixed-size iframe, I confirmed that the old drag overlay still covered a button at its new position after the disclosure opened. Automatic regions need to be invalidated when native layout changes inside an unchanged viewport.

## [P2] Install the bridge before authored scripts in documents with an omitted head

[protocol.ts:468](../packages/react-rivto-editor/src/extensions/html-surface/protocol/protocol.ts#L468)

The `<head[^>]*>` expression also matches `<header>`. In Chromium, a valid document with an omitted `<head>`, an early body script, and a later `<header>` saw `window.rivto` as `undefined` during startup. Insert the bridge at the document head without treating a body element as the insertion point.

## [P2] Answer the iframe’s ready message with its initial snapshot

[html-frame.tsx:319](../packages/react-rivto-editor/src/extensions/html-surface/components/html-frame.tsx#L319)

The iframe announces when its listener is installed, but the host discards that message. If the initial snapshot was posted before the listener existed, the next guaranteed send waits for iframe `load`. A slow image can therefore leave `rivto.ready()` pending and widget controls uninitialized even though the widget script is already running. Send the latest snapshot in response to `ready`.

## [P3] Release automatic drag exclusions when widget listeners are removed

[protocol.ts:369](../packages/react-rivto-editor/src/extensions/html-surface/protocol/protocol.ts#L369)

A live element that once had a pointer or click listener stays in `interactiveNodes` after `removeEventListener`, including after a one-shot listener fires. A widget that temporarily makes its background interactive can never drag from that background again while the element remains mounted. The existing garbage-collection test covers detached elements only.

## [P3] Preserve source-editor undo history across fullscreen toggles

[html-chrome.tsx:261](../packages/react-rivto-editor/src/extensions/html-surface/components/html-chrome.tsx#L261)

Expanding or collapsing destroys the CodeMirror views and creates fresh editor states from the draft strings. The text survives, but the selection and undo history are lost. A user who types inline and then expands the editor cannot undo the edit they just made.

## Overall assessment and validation

I would fix the navigation grant before merging. I reviewed `9afad8e2` against merge base `dce1fde8`. All 31 demo tests and 18 focused React tests passed. The Chromium checks exercised disclosure hit regions and bridge startup. I did not run the full browser or performance suites.
