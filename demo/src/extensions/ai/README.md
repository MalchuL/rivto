# Demo AI agent

This extension is a synchronous editing test. A mock model streams words into
the document through the normal block API. Those writes are ordinary editor
transactions, so a Yjs peer on `/?sync=1` sees them the same way it sees typing.

The mock is the stand-in for a future harness. Replace `createMockLlm()` in
`ai-agent.tsx` with a client that implements `LlmClient` (`llm.ts`). The agent
loop in `agent.ts` does not know which client it has.

## What you can do

- **AI** in the demo toolbar opens the agent panel.
- **Add paragraph**, **Duplicate block**, or a typed request runs one turn:
  thinking, a tool call, then a short reply.
- **AI** on the right edge of a block (visible on row hover) rewrites that block.
- While you type in a block, light ghost text offers a completion.

The row button sits in the block `right` slot.

## Keys

| Key | When ghost text is showing | Otherwise |
| --- | --- | --- |
| Tab | Insert the full suggestion at the caret. If words are still streaming, Tab waits for the rest of the phrase, then inserts it | Indent the block, as before |
| Escape | Dismiss the suggestion | Unchanged (slash menu, edgeless selection) |

Ghost text is only the text that would be inserted. It finishes the current
word with a few letters, then adds **2–5 words**, a comma or semicolon, and a
closing mark such as `.`, `...`, `!`, or `?`.

Suggestions wait until you pause typing, and they stay out of the way of a
slash command (`/`).

## Model interface

`LlmClient` covers the calls a harness will need:

- **Chat** (`chat`) streams `reasoning.delta`, `content.delta`, and
  `tool_call.delta` events, then `done`. This is the OpenAI-style chat stream
  with a thinking channel and tool calls.
- **Completion** (`complete`) streams the ghost-text suffix.
- **JSON mode** (`completeJson`, and chat `responseFormat: { type: "json_schema" }`
  or `json_object`) returns one JSON value. `completeJson({ name: "editor_plan" })`
  is the structured editor plan. Other schemas are filled from the same word
  generator.

Frames are an async iterator with a delay between items, the same shape a
websocket client would yield. Tests set the delay to `0`. Words come from a
seeded generator in `words.ts` (a small stand-in for a faker-style source, with
no network and no model weights).

## Tools

The harness in `editor-tools.ts` exposes:

| Tool | Effect |
| --- | --- |
| `list_blocks` | Ids, types, and content previews |
| `insert_block` | New paragraph. Text streams in as argument frames arrive |
| `update_block` | Replace a block's text, streamed the same way |
| `append_text` | Append streamed text |
| `duplicate_block` | Copy a block and its children after the source |
| `delete_block` | Remove a block when the prompt asks to delete or remove it |

`insert_block`, `update_block`, and `append_text` apply the JSON `content`
field before the tool call has closed. That is the sync-mode test: each new
word is a block write. A prompt can name a target as `[block <id>]`. The row
button and the composer do that when a block is known.

An unspecific prompt inserts a paragraph instead of rewriting whatever happens
to be focused.
