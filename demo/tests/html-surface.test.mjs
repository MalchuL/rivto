import assert from "node:assert/strict";
import test from "node:test";
import {
  HTML_BLOCK_SAMPLES,
  HTML_ELEMENT_SAMPLES,
} from "../src/extensions/html-surface/samples.ts";

test("seeded widgets keep their props beside the html source", () => {
  const pomodoro = HTML_BLOCK_SAMPLES.find((sample) => sample.sample === "pomodoro");
  assert.equal(pomodoro.props.startedAt, null);
  assert.equal(pomodoro.props.timer, 25);
  assert.match(
    pomodoro.html,
    /rivto\.setProps\(\{ timer: minutesInput.valueAsNumber, startedAt: Date.now\(\) \}/,
  );
  assert.match(pomodoro.html, /props\.timer/);

  const mood = HTML_BLOCK_SAMPLES.find((sample) => sample.sample === "mood");
  assert.equal(mood.listProps.tone, "soft");
  assert.match(mood.html, /listProps/);

  const circle = HTML_ELEMENT_SAMPLES.find((sample) => sample.sample === "circle");
  assert.equal(circle.props.speed, 6);
  assert.match(circle.html, /data-ring="true"/);
  assert.equal(HTML_BLOCK_SAMPLES.length, 8);
  assert.equal(HTML_ELEMENT_SAMPLES.length, 7);
});
