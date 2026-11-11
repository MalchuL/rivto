import assert from "node:assert/strict";
import test from "node:test";
import {
  clampFrameHeight,
  composeSrcDoc,
  formatWidgetProps,
  HTML_CHANNEL,
  isJsonValue,
  parseFrameMessage,
  parseWidgetProps,
  replacedPropPatch,
  validateHtmlElementProps,
} from "../src/extensions/html-surface/protocol.ts";
import {
  HTML_BLOCK_SAMPLES,
  HTML_ELEMENT_SAMPLES,
} from "../src/extensions/html-surface/samples.ts";

test("html documents keep authored markup and install the node bridge", () => {
  const fragment = composeSrcDoc("<p>Hi</p>", "token-1", "auto");
  assert.match(fragment, /<!DOCTYPE html>/);
  assert.match(fragment, /<p>Hi<\/p>/);
  assert.match(fragment, /window\.rivto/);
  assert.match(fragment, /"token-1"/);
  assert.equal(fragment.includes("height:100%"), false);

  const filled = composeSrcDoc("<p>Hi</p>", "token-1", "fill");
  assert.match(filled, /height:100%/);

  const document = composeSrcDoc(
    "<!DOCTYPE html><html><head><title>T</title></head><body><p>Hi</p></body></html>",
    "token-2",
    "auto",
  );
  assert.ok(document.indexOf("window.rivto") < document.indexOf("</head>"));
  assert.match(document, /<title>T<\/title>/);
  assert.match(document, /"token-2"/);
  assert.equal(document.includes(HTML_CHANNEL), true);
});

test("frame messages accept json writes for this token only", () => {
  assert.equal(
    parseFrameMessage({ channel: HTML_CHANNEL, token: "nope", kind: "ready" }, "token"),
    undefined,
  );
  assert.deepEqual(
    parseFrameMessage({ channel: HTML_CHANNEL, token: "token", kind: "ready" }, "token"),
    {
      kind: "ready",
    },
  );
  assert.deepEqual(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "token", kind: "set-prop", key: "start", value: true },
      "token",
    ),
    { kind: "set-prop", key: "start", value: true },
  );
  assert.equal(
    parseFrameMessage(
      { channel: HTML_CHANNEL, token: "token", kind: "set-prop", key: "__proto__", value: {} },
      "token",
    ),
    undefined,
  );
  assert.equal(
    parseFrameMessage(
      {
        channel: HTML_CHANNEL,
        token: "token",
        kind: "set-prop",
        key: "timer",
        value: Number.POSITIVE_INFINITY,
      },
      "token",
    ),
    undefined,
  );
  assert.equal(isJsonValue({ timer: 25, start: false }), true);
  assert.equal(clampFrameHeight(12), 140);
  assert.equal(clampFrameHeight(9000), 720);
});

test("element props require html and widget json survives editing", () => {
  assert.throws(() => validateHtmlElementProps({ label: "HTML" }));
  assert.deepEqual(
    validateHtmlElementProps({ html: "<p></p>", speed: 6, color: "#6d5efc" }).speed,
    6,
  );
  assert.throws(() => validateHtmlElementProps({ html: "<p></p>", speed: Number.NaN }));

  const current = { html: "<p></p>", rotation: 15, speed: 6, color: "#111111" };
  const patch = replacedPropPatch(current, { html: "<b></b>", speed: 8 }, ["rotation"]);
  assert.equal(patch.html, "<b></b>");
  assert.equal(patch.speed, 8);
  assert.equal(patch.rotation, 15);
  assert.equal(patch.color, undefined);
  assert.equal(formatWidgetProps(current, ["html", "rotation"]).includes("html"), false);
  assert.deepEqual(parseWidgetProps('{"timer":25,"start":false}'), { timer: 25, start: false });
  assert.throws(() => parseWidgetProps("[]"));
});

test("seeded widgets keep their props beside the html source", () => {
  const pomodoro = HTML_BLOCK_SAMPLES.find((sample) => sample.sample === "pomodoro");
  assert.equal(pomodoro.props.start, false);
  assert.equal(pomodoro.props.timer, 25);
  assert.match(pomodoro.html, /rivto\.setProp\("start"/);
  assert.match(pomodoro.html, /props\.timer/);

  const mood = HTML_BLOCK_SAMPLES.find((sample) => sample.sample === "mood");
  assert.equal(mood.listProps.tone, "soft");
  assert.match(mood.html, /listProps/);

  const circle = HTML_ELEMENT_SAMPLES.find((sample) => sample.sample === "circle");
  assert.equal(circle.props.speed, 6);
  assert.match(circle.html, /data-ring="true"/);
  assert.equal(HTML_BLOCK_SAMPLES.length, 4);
  assert.equal(HTML_ELEMENT_SAMPLES.length, 4);
});
