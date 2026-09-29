/**
 * Mock model that streams random words.
 *
 * Frames are an async iterator with a delay between them, the same shape a
 * websocket client would yield. Word choice is seeded, so a prompt replays.
 * The client implements chat with reasoning, tool calls, inline completion,
 * and JSON mode (`completeJson` plus `responseFormat: json_schema`).
 *
 * @module
 */

import {
  planEditorAction,
  EDITOR_TOOLS,
  type EditorPlan,
} from "./editor-tools.ts";
import type {
  ChatCompletionRequest,
  ChatMessage,
  ChatStreamEvent,
  CompletionRequest,
  CompletionStreamEvent,
  JsonCompletionRequest,
  JsonSchema,
  LlmClient,
} from "./llm.ts";
import {
  buildCompletion,
  buildPassage,
  createRng,
  hashString,
  splitTokens,
  type Rng,
} from "./words.ts";

/** Options for the in-process mock. `latencyMs` is the pause between frames. */
export interface MockLlmOptions {
  /** Delay between streamed frames. Tests use `0`. Defaults to 36ms. */
  readonly latencyMs?: number;
  /** Mixed into the prompt hash so two clients can diverge. */
  readonly seed?: number;
}

/**
 * Waits between socket-like frames.
 *
 * @param ms - Delay. `0` resolves immediately.
 * @param signal - Aborts the wait.
 * @returns Nothing.
 */
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Yields items with a delay between them, like websocket frames.
 *
 * The first item is immediate so the UI can paint a thinking token without
 * waiting out a full interval.
 *
 * @param items - Frames already built by the mock.
 * @param latencyMs - Pause after each frame except the last.
 * @param signal - Stops the iterator.
 */
async function* streamFrames<T>(
  items: readonly T[],
  latencyMs: number,
  signal?: AbortSignal,
): AsyncGenerator<T> {
  for (let index = 0; index < items.length; index += 1) {
    if (signal?.aborted) return;
    if (index > 0) await wait(latencyMs, signal);
    yield items[index]!;
  }
}

/** @returns The latest user message, or an empty string. */
function latestUserText(messages: readonly ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "user") return message.content;
  }
  return "";
}

/** @returns True when the conversation is waiting on a tool result summary. */
function lastIsTool(messages: readonly ChatMessage[]): boolean {
  return messages.at(-1)?.role === "tool";
}

/**
 * JSON text fragments for one planned tool call.
 *
 * Structural fields are one frame. `content` is then one frame per token so
 * the harness can write the block as the "socket" delivers words.
 *
 * @param plan - Tool the mock decided to call.
 * @returns Fragments that concatenate to one JSON object.
 */
export function toolArgumentFrames(plan: EditorPlan): string[] {
  if (plan.content === undefined) {
    return [JSON.stringify(plan.blockId ? { blockId: plan.blockId } : {})];
  }
  let prefix = "{";
  if (plan.blockId) prefix += `"blockId":${JSON.stringify(plan.blockId)},`;
  if (plan.afterId) prefix += `"afterId":${JSON.stringify(plan.afterId)},`;
  const frames = [`${prefix}"content":"`];
  for (const token of splitTokens(plan.content)) {
    frames.push(JSON.stringify(token).slice(1, -1));
  }
  frames.push("\"}");
  return frames;
}

/**
 * Builds a JSON value for structured output.
 *
 * The name `editor_plan` returns the same tool plan chat would call. Any other
 * schema is filled from the word generator so JSON mode is not a special case
 * of one object shape.
 *
 * @param request - Schema request.
 * @param rng - Seeded generator.
 * @returns A JSON-compatible value.
 */
export function synthesizeJson(request: JsonCompletionRequest, rng: Rng): unknown {
  if (request.name === "editor_plan") {
    return planEditorAction({
      userText: latestUserText(request.messages),
      toolNames: EDITOR_TOOLS.map((tool) => tool.name),
      rng,
    }) ?? { tool: "insert_block", content: buildPassage(rng) };
  }
  return fillSchema(request.schema, rng);
}

/** @returns A value matching `schema`, using the word generator for strings. */
function fillSchema(schema: JsonSchema, rng: Rng): unknown {
  if (schema.enum?.length) return rng.pick(schema.enum);
  if (schema.type === "number" || schema.type === "integer") return rng.int(100);
  if (schema.type === "boolean") return rng.next() < 0.5;
  if (schema.type === "array") return [fillSchema(schema.items ?? { type: "string" }, rng)];
  if (schema.type === "object" || schema.properties) return fillObject(schema, rng);
  return buildPassage(rng);
}

/** @returns An object whose keys follow `schema.properties`. */
function fillObject(schema: JsonSchema, rng: Rng): Record<string, unknown> {
  const properties = schema.properties ?? {};
  const object: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) object[key] = fillSchema(value, rng);
  if (!Object.keys(object).length) object.note = buildPassage(rng);
  return object;
}

/**
 * Thinking trace: a run of random words, streamed as its own channel.
 *
 * @param rng - Seeded generator.
 * @returns A single-line thought.
 */
function buildReasoning(rng: Rng): string {
  const count = 6 + rng.int(6);
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) words.push(rng.pick([
    "consider", "the", "block", "boundary", "then", "draft", "a", "short", "passage",
    "keep", "the", "edit", "local", "and", "stream", "each", "word",
  ]));
  return words.join(" ");
}

/** @returns A one-sentence acknowledgement after a tool result. */
function buildSummary(rng: Rng): string {
  return `Done. ${buildPassage(rng)}`;
}

/**
 * Mock LLM. Construct one per editor so two sync peers do not share an abort.
 *
 * @param options - Frame delay and seed salt.
 */
export class MockLlmClient implements LlmClient {
  private readonly latencyMs: number;
  private readonly seed: number;

  constructor(options: MockLlmOptions = {}) {
    this.latencyMs = options.latencyMs ?? 36;
    this.seed = options.seed ?? 0;
  }

  /** @returns Seed mixed from the request text so retries of the same prompt match. */
  private rngFor(text: string, seed?: number): Rng {
    return createRng((seed ?? hashString(text)) ^ this.seed);
  }

  /**
   * Streams a chat completion.
   *
   * Order: reasoning deltas, then either tool-call argument frames or assistant
   * text. A tool-role tail, `toolChoice: "none"`, or JSON `responseFormat`
   * skips tools and answers with text (JSON text when a schema was requested).
   */
  chat(request: ChatCompletionRequest, signal?: AbortSignal): AsyncIterable<ChatStreamEvent> {
    const transcript = JSON.stringify(request.messages);
    const rng = this.rngFor(transcript, request.seed);
    const events: ChatStreamEvent[] = [];
    const wantsReasoning = request.reasoning?.effort !== "none";
    if (wantsReasoning) {
      for (const token of splitTokens(buildReasoning(rng))) {
        events.push({ type: "reasoning.delta", delta: token });
      }
    }

    const jsonMode = request.responseFormat?.type === "json_object"
      || request.responseFormat?.type === "json_schema";
    if (jsonMode) {
      const schema = request.responseFormat?.type === "json_schema"
        ? request.responseFormat.schema
        : { type: "object" as const };
      const value = request.responseFormat?.type === "json_schema"
        ? synthesizeJson({
          messages: request.messages,
          name: request.responseFormat.name,
          schema,
        }, rng)
        : fillSchema(schema, rng);
      for (const token of splitTokens(JSON.stringify(value))) {
        events.push({ type: "content.delta", delta: token });
      }
      events.push({ type: "done", finishReason: "stop" });
      return streamFrames(events, this.latencyMs, signal);
    }

    const toolNames = request.tools?.map((tool) => tool.name) ?? [];
    const allowTools = request.toolChoice !== "none" && !lastIsTool(request.messages) && toolNames.length > 0;
    if (allowTools) {
      const plan = planEditorAction({
        userText: latestUserText(request.messages),
        toolNames,
        rng,
      });
      if (plan && (request.toolChoice !== "auto" || plan.tool)) {
        const forced = typeof request.toolChoice === "object" ? request.toolChoice.name : plan.tool;
        const selected = forced === plan.tool ? plan : { ...plan, tool: forced };
        const id = `call_${hashString(transcript).toString(16)}`;
        events.push({
          type: "tool_call.delta",
          index: 0,
          id,
          name: selected.tool,
          argumentsDelta: "",
        });
        for (const frame of toolArgumentFrames(selected)) {
          events.push({ type: "tool_call.delta", index: 0, id, argumentsDelta: frame });
        }
        events.push({ type: "done", finishReason: "tool_calls" });
        return streamFrames(events, this.latencyMs, signal);
      }
    }

    const answer = lastIsTool(request.messages) ? buildSummary(rng) : buildPassage(rng);
    for (const token of splitTokens(answer)) events.push({ type: "content.delta", delta: token });
    events.push({ type: "done", finishReason: "stop" });
    return streamFrames(events, this.latencyMs, signal);
  }

  /**
   * Streams a ghost-text suffix for the caret.
   *
   * The suffix completes the current word when the prefix ends in a letter,
   * then adds 2–5 words plus punctuation.
   */
  complete(request: CompletionRequest, signal?: AbortSignal): AsyncIterable<CompletionStreamEvent> {
    const rng = this.rngFor(`${request.prefix}\u0000${request.suffix ?? ""}`, request.seed);
    const text = buildCompletion(request.prefix, rng);
    const events: CompletionStreamEvent[] = splitTokens(text).map((delta) => ({
      type: "content.delta",
      delta,
    }));
    return streamFrames(events, this.latencyMs, signal);
  }

  /**
   * JSON mode. Resolves one object instead of streaming tokens.
   *
   * @param request - Messages plus a schema name.
   * @param signal - Rejects when already aborted.
   * @returns The synthesized JSON value.
   */
  async completeJson(request: JsonCompletionRequest, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const rng = this.rngFor(JSON.stringify(request.messages) + request.name, request.seed);
    await wait(this.latencyMs, signal);
    return synthesizeJson(request, rng);
  }
}

/** @returns The demo mock. Pass `latencyMs: 0` in tests. */
export function createMockLlm(options?: MockLlmOptions): LlmClient {
  return new MockLlmClient(options);
}
