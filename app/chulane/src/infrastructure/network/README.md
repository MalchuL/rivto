# Network services

The Chulane runtime does not register or use these services. The implementation
is kept here for later use and can be exercised by its own tests. The optional
`NetworkServicesPlugin` registers both services in a Cordis scope when explicitly
installed; browser consumers can construct services from `index.ts`. Only Node
code should import `websocket/node.ts` or `plugin.ts`.

```ts
const http = new HttpService();
const client = http.create({ baseUrl: "https://api.example.com/" });

const response = await client.post<{ id: string }>("items", {
  body: { title: "Example" },
  signal,
});
console.log(response.data.id, response.status, response.headers.get("etag"));

const sockets = new NodeWebSocketService();
const connection = sockets.connect({
  url: "wss://api.example.com/events",
  handshakeTimeoutMs: 10_000,
  reconnect: { stableAfterMs: 30_000 },
});
const unsubscribe = connection.on("message", (message) => console.log(message));
// Dispose the services when their owning scope ends.
```

URL resolution follows `new URL(path, baseUrl)`: end a directory base with `/`;
a leading `/` selects an origin-relative path. JSON is the default response
format. Use `responseType: 'text'` or `'arraybuffer'` for other responses.
Multipart uploads take platform `FormData`; do not manually set its content type.
All method shortcuts take the same options object, including `body`.

```ts
const response = await client.stream("events", { signal });
for await (const event of parseSse(response.data)) {
  console.log(event.event, event.data, event.id, event.retry);
}
```

Streams are Web `ReadableStream<Uint8Array>` in both environments. The default
30-second stream timeout ends at response headers; ordinary requests time out
through body consumption. Set `timeoutMs: 0` to disable the timeout. Cancel the
reader, break SSE iteration, abort the request signal, or dispose the client to
stop abandoned work. SSE data stays text: JSON decoding, resume IDs, provider
sentinels, and reconnects belong to the consumer.

HTTP auth adapters implement `prepare(signal)` and `refresh(signal)`, optionally
`isAuthFailure(response)` (default: status 401). Use the same adapter object to
share one in-flight refresh across clients within a service. GET/HEAD retry once;
mutations require `retryAfterRefresh: true`, and exposed streams never replay.
Adapters should honor their signal. One cancelled request does not abort another
client's shared refresh. Authenticated clients reject cross-origin URL overrides
and redirects. HTTP errors preserve status/headers/body where available; network,
timeout, cancellation, and decoding failures have separate `HttpError.kind` values.
Type parameters describe expected payloads; validate untrusted data in the owning
application adapter before using it as a domain value.

Socket auth adapters prepare URL/subprotocol settings before each connection.
Runtime adapters may also prepare headers and `handshakeTimeoutMs`. The Node
handshake timeout defaults to 30 seconds; set it to zero to disable it. Browser
sockets use the native API and cannot add handshake headers or set a handshake
timeout. `isAuthFailure(close)` identifies protocol-specific
authentication close codes; a configured reconnect can refresh once before trying
again. Refresh rejection terminates the connection. Cookies and provider login
flows remain owned by their authentication integrations.

Reconnect is opt-in. Delays grow from 500 ms to 30 seconds with jitter and reset
after a stable connection (`stableAfterMs`, default 30 seconds). Normal/protocol/policy failures stop by
default; `shouldReconnect` can classify application close codes. Explicit `close`
is terminal. Services own all children, but consumers must dispose their clients
and connections when their narrower scope ends. Subscriptions return unsubscribe
functions and all subscriptions are removed on disposal.

`send` only accepts an open socket and never queues disconnected messages.
`bufferedAmount` reports local platform buffering, not acknowledgment. Durable
outboxes, delivery acknowledgments, replay, deduplication, and concrete credential
providers are deliberately outside this transport implementation.
