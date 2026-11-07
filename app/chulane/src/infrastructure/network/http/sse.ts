/**
 * Parses SSE framing independently of HTTP, provider payloads, and reconnection.
 * Incremental decoding preserves split UTF-8 and CRLF boundaries; consumer exit
 * cancels the source so abandoned AI streams do not keep network work alive.
 */
import type { SseEvent } from "./types.ts";

/**
 * @param source - Byte stream from an HTTP response.
 * @returns Parsed, dispatched SSE events.
 */
export async function* parseSse(
  source: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const reader = source.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let id = "";
  let retry: number | undefined;
  let event = "";
  let data: string[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += chunk.value ?? "";
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer))) {
        // A trailing CR may become CRLF in the next chunk.
        if (
          !chunk.done &&
          match[0] === "\r" &&
          match.index === buffer.length - 1
        )
          break;
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (!line) {
          if (data.length)
            yield {
              event: event || "message",
              data: data.join("\n"),
              id,
              ...(retry === undefined ? {} : { retry }),
            };
          data = [];
          event = "";
        } else {
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          const value =
            colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
          if (field === "data") data.push(value);
          else if (field === "event") event = value;
          else if (field === "id" && !value.includes("\0")) id = value;
          else if (
            field === "retry" &&
            /^\d+$/.test(value) &&
            Number.isSafeInteger(Number(value))
          )
            retry = Number(value);
        }
      }
      if (chunk.done) break;
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}
