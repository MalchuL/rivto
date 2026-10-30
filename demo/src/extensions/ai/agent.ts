/**
 * Runs one agent turn: think, call a tool, stream its text into the document,
 * then ask the model for a short summary.
 *
 * The loop is the future harness. It only knows {@link LlmClient} and
 * {@link AiDocumentPort}, so a real model can replace the mock without a
 * change here.
 *
 * @module
 */

import {
  createLiveTool,
  finishTool,
  pushToolDelta,
  type AiDocumentPort,
} from "./editor-tools.ts";
import type { ChatMessage, ChatTool, ChatToolCall, LlmClient } from "./llm.ts";

/** System prompt sent ahead of the transcript. A future model reads this. */
export const AGENT_SYSTEM_PROMPT = [
  "You edit a block document by calling tools.",
  "Stream content through insert_block, update_block, and append_text.",
  "Use duplicate_block to copy a block and delete_block only when the user asks to remove one.",
  "A user message may name the target as [block <id>].",
].join(" ");

/** UI-facing event. Text events are the full text so far, not a single token. */
export type AgentEvent =
  | { readonly type: "reasoning"; readonly text: string }
  | { readonly type: "assistant"; readonly text: string }
  | { readonly type: "tool"; readonly name: string; readonly detail: string }
  | { readonly type: "error"; readonly text: string };

/** One user request executed against a document port. */
export interface AgentTurnRequest {
  readonly client: LlmClient;
  readonly port: AiDocumentPort;
  readonly tools: readonly ChatTool[];
  readonly messages: readonly ChatMessage[];
  readonly focusBlockId?: string;
  readonly signal?: AbortSignal;
  readonly onEvent: (event: AgentEvent) => void;
}

/**
 * Executes at most two model calls: a tool call, then a text summary.
 *
 * @param request - Client, document, transcript, and a listener for the panel.
 * @returns The messages that should be appended to the transcript, excluding
 * the system prompt and the messages the caller already stored.
 */
export async function runAgentTurn(request: AgentTurnRequest): Promise<ChatMessage[]> {
  const added: ChatMessage[] = [];
  let messages: ChatMessage[] = [
    { role: "system", content: AGENT_SYSTEM_PROMPT },
    ...request.messages,
  ];

  for (let step = 0; step < 2; step += 1) {
    if (request.signal?.aborted) return added;
    const callTools = step === 0;
    let reasoning = "";
    let content = "";
    const calls = new Map<number, { id: string; name: string; arguments: string; live: ReturnType<typeof createLiveTool> }>();

    try {
      for await (const event of request.client.chat({
        model: "mock-llm-sync",
        messages,
        tools: callTools ? request.tools : undefined,
        toolChoice: callTools ? "auto" : "none",
        reasoning: { effort: "low" },
      }, request.signal)) {
        if (event.type === "reasoning.delta") {
          reasoning += event.delta;
          request.onEvent({ type: "reasoning", text: reasoning });
        } else if (event.type === "content.delta") {
          content += event.delta;
          request.onEvent({ type: "assistant", text: content });
        } else if (event.type === "tool_call.delta") {
          const current = calls.get(event.index) ?? {
            id: event.id,
            name: event.name ?? "",
            arguments: "",
            live: createLiveTool(),
          };
          if (event.name) current.name = event.name;
          current.arguments += event.argumentsDelta;
          pushToolDelta(current.live, {
            name: event.name,
            argumentsDelta: event.argumentsDelta,
          }, request.port, request.focusBlockId);
          calls.set(event.index, current);
          request.onEvent({
            type: "tool",
            name: current.name,
            detail: current.live.written || current.arguments,
          });
        }
      }
    } catch (error) {
      if (request.signal?.aborted) return added;
      const message = error instanceof Error ? error.message : "The model stream failed";
      request.onEvent({ type: "error", text: message });
      return added;
    }

    const toolCalls: ChatToolCall[] = [...calls.values()].map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
    }));
    if (!toolCalls.length) {
      const assistant: ChatMessage = { role: "assistant", content };
      added.push(assistant);
      return added;
    }

    const assistant: ChatMessage = { role: "assistant", content, toolCalls };
    added.push(assistant);
    messages = [...messages, assistant];
    for (const call of calls.values()) {
      const result = finishTool(call.live, request.port, request.focusBlockId);
      request.onEvent({ type: "tool", name: call.name, detail: result.summary });
      const toolMessage: ChatMessage = {
        role: "tool",
        toolCallId: call.id,
        content: JSON.stringify(result),
      };
      added.push(toolMessage);
      messages = [...messages, toolMessage];
      if (!result.ok) {
        request.onEvent({ type: "error", text: result.summary });
        return added;
      }
    }
  }
  return added;
}
