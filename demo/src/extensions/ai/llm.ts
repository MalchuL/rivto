/**
 * Client seam for editor AI.
 *
 * A future harness implements {@link LlmClient} and replaces the mock in this
 * folder. The shapes follow the OpenAI chat surface: streamed assistant text,
 * reasoning, tool calls, inline completion, and JSON-mode / structured output.
 *
 * @module
 */

/** JSON schema subset the mock and a future harness both understand. */
export interface JsonSchema {
  readonly type?: "object" | "array" | "string" | "number" | "integer" | "boolean";
  readonly description?: string;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly enum?: readonly unknown[];
  readonly additionalProperties?: boolean;
}

/** One chat message, including tool results and assistant tool calls. */
export interface ChatMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolCalls?: readonly ChatToolCall[];
}

/** Tool the model may call. Arguments are a JSON object matching `parameters`. */
export interface ChatTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: JsonSchema;
}

/** Finished tool call accumulated from streamed argument deltas. */
export interface ChatToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/** OpenAI-style response format. `json_schema` is structured output. */
export type ChatResponseFormat =
  | { readonly type: "text" }
  | { readonly type: "json_object" }
  | { readonly type: "json_schema"; readonly name: string; readonly schema: JsonSchema };

/** Chat request. `reasoning` asks the model to stream a thinking trace. */
export interface ChatCompletionRequest {
  readonly model?: string;
  readonly messages: readonly ChatMessage[];
  readonly tools?: readonly ChatTool[];
  readonly toolChoice?: "auto" | "none" | "required" | { readonly name: string };
  readonly reasoning?: { readonly effort: "none" | "low" | "medium" | "high" };
  readonly responseFormat?: ChatResponseFormat;
  readonly seed?: number;
}

/** Incremental chat event. Tool arguments arrive as JSON text fragments. */
export type ChatStreamEvent =
  | { readonly type: "reasoning.delta"; readonly delta: string }
  | { readonly type: "content.delta"; readonly delta: string }
  | {
    readonly type: "tool_call.delta";
    readonly index: number;
    readonly id: string;
    readonly name?: string;
    readonly argumentsDelta: string;
  }
  | { readonly type: "done"; readonly finishReason: "stop" | "tool_calls" | "length" };

/** Caret-local completion. `prefix` is the text before the caret. */
export interface CompletionRequest {
  readonly prefix: string;
  readonly suffix?: string;
  readonly seed?: number;
}

/** One streamed fragment of ghost text. */
export interface CompletionStreamEvent {
  readonly type: "content.delta";
  readonly delta: string;
}

/** Non-streaming JSON mode. The result matches `schema`. */
export interface JsonCompletionRequest {
  readonly model?: string;
  readonly messages: readonly ChatMessage[];
  readonly name: string;
  readonly schema: JsonSchema;
  readonly seed?: number;
}

/**
 * Model client used by the editor harness.
 *
 * `chat`, `complete`, and `completeJson` are async iterables or promises so a
 * websocket transport and this mock share one caller. Aborting `signal` stops
 * the stream.
 */
export interface LlmClient {
  chat(request: ChatCompletionRequest, signal?: AbortSignal): AsyncIterable<ChatStreamEvent>;
  complete(request: CompletionRequest, signal?: AbortSignal): AsyncIterable<CompletionStreamEvent>;
  completeJson(request: JsonCompletionRequest, signal?: AbortSignal): Promise<unknown>;
}
