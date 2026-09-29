import assert from "node:assert/strict";
import test from "node:test";
import { runAgentTurn } from "../src/extensions/ai/agent.ts";
import {
  createLiveTool,
  createMemoryDocument,
  EDITOR_TOOLS,
  finishTool,
  planEditorAction,
  pushToolDelta,
} from "../src/extensions/ai/editor-tools.ts";
import { readJsonStringField } from "../src/extensions/ai/json-field.ts";
import { createMockLlm, toolArgumentFrames } from "../src/extensions/ai/mock-llm.ts";
import { buildCompletion, createRng } from "../src/extensions/ai/words.ts";

test("completion finishes the current word and adds two to five words plus punctuation", () => {
  const text = buildCompletion("hel", createRng(4));
  assert.match(text, /^[a-z]+ /);
  const words = text.replace(/^[a-z]+/, "").match(/[A-Za-z]+/g);
  assert.ok(words);
  assert.ok(words.length >= 2 && words.length <= 5);
  assert.match(text, /[,;]/);
  assert.match(text, /(?:\.\.\.|[.!?])$/);

  const spaced = buildCompletion("hello ", createRng(4));
  assert.match(spaced, /^[A-Za-z]/);
  assert.doesNotMatch(spaced, /^[a-z]{1,6}[A-Z]/);
});

test("mock completion streams more than one frame", async () => {
  const client = createMockLlm({ latencyMs: 0, seed: 3 });
  const chunks = [];
  for await (const event of client.complete({ prefix: "qui" })) chunks.push(event.delta);
  assert.ok(chunks.length > 1);
  assert.match(chunks.join(""), /^[a-z]+ /);
});

test("chat streams reasoning and a tool call whose JSON content parses", async () => {
  const client = createMockLlm({ latencyMs: 0, seed: 9 });
  const events = [];
  for await (const event of client.chat({
    messages: [{ role: "user", content: "[block b1] Rewrite this block." }],
    tools: EDITOR_TOOLS,
    reasoning: { effort: "low" },
  })) events.push(event);

  assert.ok(events.some((event) => event.type === "reasoning.delta"));
  assert.equal(events.at(-1)?.finishReason, "tool_calls");
  const args = events
    .filter((event) => event.type === "tool_call.delta")
    .map((event) => event.argumentsDelta)
    .join("");
  const parsed = JSON.parse(args);
  assert.equal(parsed.blockId, "b1");
  assert.match(parsed.content, /[A-Za-z]/);
  assert.ok(events.some((event) => event.type === "tool_call.delta" && event.name === "update_block"));
});

test("JSON mode returns an editor plan and can stream a schema object", async () => {
  const client = createMockLlm({ latencyMs: 0, seed: 2 });
  const plan = await client.completeJson({
    messages: [{ role: "user", content: "Add a new paragraph." }],
    name: "editor_plan",
    schema: { type: "object" },
  });
  assert.equal(plan.tool, "insert_block");
  assert.equal(typeof plan.content, "string");

  const events = [];
  for await (const event of client.chat({
    messages: [{ role: "user", content: "Add a note" }],
    responseFormat: {
      type: "json_schema",
      name: "note",
      schema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
      },
    },
  })) events.push(event);
  const body = events.filter((event) => event.type === "content.delta").map((event) => event.delta).join("");
  const note = JSON.parse(body);
  assert.equal(typeof note.title, "string");
  assert.equal(events.at(-1)?.finishReason, "stop");
});

test("a partial JSON content field grows until the quote closes", () => {
  assert.deepEqual(readJsonStringField('{"content":"Hel', "content"), { value: "Hel", closed: false });
  assert.deepEqual(readJsonStringField('{"content":"Hel\\nlo"}', "content"), { value: "Hel\nlo", closed: true });
  assert.equal(readJsonStringField('{"blockId":"b1"', "content"), undefined);
});

test("streamed tool arguments write the block one piece at a time", () => {
  const port = createMemoryDocument();
  port.seed({ id: "b1", content: "old" });
  const state = createLiveTool();
  const frames = toolArgumentFrames({
    tool: "update_block",
    blockId: "b1",
    content: "Hello world.",
  });
  pushToolDelta(state, { name: "update_block" }, port, "b1");
  for (const frame of frames) pushToolDelta(state, { argumentsDelta: frame }, port, "b1");
  assert.equal(port.getBlock("b1")?.content, "Hello world.");
  assert.ok(port.contentWrites.length > 1);
  assert.ok(port.contentWrites.at(-1).length > port.contentWrites[0].length);
  const result = finishTool(state, port, "b1");
  assert.equal(result.ok, true);
  assert.equal(port.getBlock("b1")?.content, "Hello world.");
});

test("the agent inserts, rewrites, duplicates, and deletes through the document port", async () => {
  const client = createMockLlm({ latencyMs: 0, seed: 11 });
  const port = createMemoryDocument();
  port.seed({ id: "b1", content: "Keep me" });
  const events = [];
  await runAgentTurn({
    client,
    port,
    tools: EDITOR_TOOLS,
    messages: [{ role: "user", content: "[block b1] Rewrite this block." }],
    focusBlockId: "b1",
    onEvent: (event) => events.push(event),
  });
  assert.notEqual(port.getBlock("b1")?.content, "Keep me");
  assert.ok(port.contentWrites.length > 1);
  assert.ok(events.some((event) => event.type === "reasoning"));
  assert.ok(events.some((event) => event.type === "assistant"));
  assert.ok(events.some((event) => event.type === "tool" && event.name === "update_block"));

  const added = createMemoryDocument();
  await runAgentTurn({
    client,
    port: added,
    tools: EDITOR_TOOLS,
    messages: [{ role: "user", content: "Add a new paragraph." }],
    onEvent: () => undefined,
  });
  assert.equal(added.listBlocks().length, 1);
  assert.match(added.listBlocks()[0].content, /[A-Za-z]/);

  const copied = createMemoryDocument();
  copied.seed({ id: "b1", content: "Keep me" });
  await runAgentTurn({
    client,
    port: copied,
    tools: EDITOR_TOOLS,
    messages: [{ role: "user", content: "[block b1] Duplicate this block." }],
    onEvent: () => undefined,
  });
  const blocks = copied.listBlocks();
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].content, "Keep me");

  const removed = createMemoryDocument();
  removed.seed({ id: "b1", content: "Gone" });
  await runAgentTurn({
    client,
    port: removed,
    tools: EDITOR_TOOLS,
    messages: [{ role: "user", content: "[block b1] Delete this block." }],
    onEvent: () => undefined,
  });
  assert.equal(removed.listBlocks().length, 0);
});

test("prompt words select the editor tool", () => {
  const rng = createRng(1);
  assert.equal(planEditorAction({
    userText: "Add a paragraph",
    toolNames: EDITOR_TOOLS.map((tool) => tool.name),
    rng,
  })?.tool, "insert_block");
  assert.equal(planEditorAction({
    userText: "[block b1] Duplicate this block.",
    toolNames: EDITOR_TOOLS.map((tool) => tool.name),
    rng,
  })?.tool, "duplicate_block");
});
