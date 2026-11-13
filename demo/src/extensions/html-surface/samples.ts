/**
 * Seeded HTML widgets for the demo page and canvas.
 *
 * Each widget is ordinary HTML, CSS, and JavaScript. It reads the live node
 * through `rivto.ready()` and writes back with `rivto.setProp`.
 *
 * @module
 */

import { ORBIT_HTML, WEEKLY_PROGRESS_HTML } from "./animated-samples.ts";
import { MIXER_HTML, PRIORITY_BOARD_HTML } from "./interactive-samples.ts";

/** One pasted block stored as HTML content plus JSON props. */
export interface HtmlBlockSample {
  /** Stable id copied onto the block so tests can find it. */
  readonly sample: string;
  /** Authored document fragment. */
  readonly html: string;
  /** Widget props, including `sample` and `label`. */
  readonly props: Record<string, unknown>;
  /** Outline props the widget can read from the block node. */
  readonly listProps?: Record<string, unknown>;
}

/** One pasted canvas element. `html` is stored in `props.html` at seed time. */
export interface HtmlElementSample {
  /** Stable id copied onto the element so tests can find it. */
  readonly sample: string;
  /** Authored document fragment. The frame fills the element box. */
  readonly html: string;
  /** Widget props besides the HTML source. */
  readonly props: Record<string, unknown>;
  /** Initial canvas box in unscaled canvas units. */
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

const POMODORO_HTML = `<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; }
  .card {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 22px 18px 18px;
    border-radius: 22px;
    background:
      radial-gradient(120% 90% at 50% 0%, #ffd9cf 0%, transparent 58%),
      linear-gradient(180deg, #fff8f5, #ffe8e0);
    color: #4a1d16;
    box-shadow: inset 0 0 0 1px rgba(122, 46, 28, 0.14);
  }
  .face {
    --progress: 360deg;
    width: 168px;
    height: 168px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: conic-gradient(#e23d2b var(--progress), #f3cfc6 0);
  }
  .well {
    width: 142px;
    height: 142px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #fff8f6;
  }
  .time {
    font-variant-numeric: tabular-nums;
    font-size: 40px;
    font-weight: 650;
    letter-spacing: -0.05em;
  }
  button {
    border: 0;
    border-radius: 999px;
    padding: 10px 22px;
    background: #e23d2b;
    color: white;
    font: inherit;
    font-weight: 650;
    cursor: pointer;
  }
  button:focus-visible { outline: 2px solid #4a1d16; outline-offset: 3px; }
  .meta { margin: 0; font-size: 13px; color: #8a5348; }
</style>
<div class="card">
  <div class="face" id="face"><div class="well"><div class="time" id="time">25:00</div></div></div>
  <p class="meta" id="meta">25 minute focus</p>
  <button type="button" id="toggle">Start</button>
</div>
<script>
  rivto.ready().then(function (node) {
    var timerId = 0;
    var duration = 0;
    var endsAt = 0;
    var running = false;
    var time = document.getElementById("time");
    var face = document.getElementById("face");
    var meta = document.getElementById("meta");
    var toggle = document.getElementById("toggle");
    function paint(left) {
      var seconds = Math.max(0, Math.ceil(left / 1000));
      var minutes = Math.floor(seconds / 60);
      var remain = seconds % 60;
      time.textContent = String(minutes).padStart(2, "0") + ":" + String(remain).padStart(2, "0");
      var progress = duration ? Math.max(0, Math.min(1, left / duration)) : 0;
      face.style.setProperty("--progress", progress * 360 + "deg");
    }
    function stop() {
      window.clearInterval(timerId);
      timerId = 0;
    }
    function tick() {
      var left = endsAt - Date.now();
      paint(Math.max(0, left));
      if (left > 0) return;
      stop();
      running = false;
      toggle.textContent = "Start";
      paint(duration);
      rivto.setProp("start", false);
    }
    function apply(next) {
      var minutes = Number(next.props.timer);
      var safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 25;
      var nextDuration = safeMinutes * 60000;
      var nextRunning = next.props.start === true;
      var wasRunning = running;
      if (nextDuration !== duration) {
        duration = nextDuration;
        if (!nextRunning) paint(duration);
      }
      meta.textContent = safeMinutes + " minute focus";
      if (nextRunning && !wasRunning) endsAt = Date.now() + duration;
      running = nextRunning;
      toggle.textContent = running ? "Pause" : "Start";
      if (!running) {
        stop();
        paint(duration);
        return;
      }
      if (wasRunning) return;
      stop();
      tick();
      timerId = window.setInterval(tick, 200);
    }
    apply(node);
    rivto.subscribe(apply);
    toggle.addEventListener("click", function () { rivto.setProp("start", !running); });
  });
</script>`;

const GOAL_HTML = `<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #163024; }
  .card {
    display: grid;
    gap: 12px;
    padding: 18px;
    border-radius: 22px;
    background: linear-gradient(180deg, #f3fbf4, #e5f6ea);
    box-shadow: inset 0 0 0 1px rgba(22, 80, 48, 0.12);
  }
  .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  h2 { margin: 0; font-size: 18px; letter-spacing: -0.03em; }
  strong { font-variant-numeric: tabular-nums; font-size: 28px; letter-spacing: -0.04em; }
  .track { height: 14px; border-radius: 999px; background: #d5eadc; overflow: hidden; }
  .fill { height: 100%; width: 0; border-radius: inherit; background: linear-gradient(90deg, #1f8a4c, #8ed39a); }
  .actions { display: flex; gap: 8px; }
  button {
    width: 36px; height: 36px; border-radius: 12px; border: 0;
    background: #1f8a4c; color: white; font: inherit; font-size: 20px; cursor: pointer;
  }
  button:focus-visible { outline: 2px solid #163024; outline-offset: 2px; }
</style>
<div class="card">
  <div class="row"><h2 id="label">Reading goal</h2><strong id="count">0</strong></div>
  <div class="track"><div class="fill" id="fill"></div></div>
  <div class="actions">
    <button type="button" id="minus" aria-label="Decrease pages">−</button>
    <button type="button" id="plus" aria-label="Increase pages">+</button>
  </div>
</div>
<script>
  rivto.ready().then(function (node) {
    var value = 0;
    var goal = 1;
    var label = document.getElementById("label");
    var count = document.getElementById("count");
    var fill = document.getElementById("fill");
    function paint() {
      count.textContent = value + " / " + goal;
      fill.style.width = Math.max(0, Math.min(100, (value / goal) * 100)) + "%";
    }
    function apply(next) {
      value = Number(next.props.value);
      goal = Number(next.props.goal);
      if (!Number.isFinite(value)) value = 0;
      if (!Number.isFinite(goal) || goal <= 0) goal = 1;
      label.textContent = typeof next.props.label === "string" ? next.props.label : "Goal";
      paint();
    }
    apply(node);
    rivto.subscribe(apply);
    document.getElementById("plus").addEventListener("click", function () {
      value += 1;
      paint();
      rivto.setProp("value", value);
    });
    document.getElementById("minus").addEventListener("click", function () {
      value = Math.max(0, value - 1);
      paint();
      rivto.setProp("value", value);
    });
  });
</script>`;

const QUOTE_HTML = `<style>
  body { margin: 0; font-family: Georgia, "Iowan Old Style", Palatino, serif; color: #2a241c; }
  blockquote {
    margin: 0;
    padding: 22px 22px 18px;
    border-radius: 22px;
    background:
      linear-gradient(180deg, rgba(255,255,255,0.55), transparent 40%),
      #f6efe4;
    box-shadow: inset 0 0 0 1px rgba(90, 62, 28, 0.12);
  }
  p { margin: 0; font-size: 26px; line-height: 1.35; letter-spacing: -0.03em; }
  p::before { content: "“"; color: #b5793b; font-size: 42px; line-height: 0; margin-right: 4px; }
  footer { margin-top: 14px; font-family: ui-sans-serif, system-ui, sans-serif; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #7a6248; }
</style>
<blockquote>
  <p id="quote"></p>
  <footer id="author"></footer>
</blockquote>
<script>
  rivto.ready().then(function (node) {
    var quote = document.getElementById("quote");
    var author = document.getElementById("author");
    function apply(next) {
      quote.textContent = typeof next.props.quote === "string" ? next.props.quote : "";
      author.textContent = typeof next.props.author === "string" ? next.props.author : "";
    }
    apply(node);
    rivto.subscribe(apply);
  });
</script>`;

const MOOD_HTML = `<style>
  body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #24183d; }
  .card {
    display: grid; gap: 12px; padding: 18px; border-radius: 22px;
    background: linear-gradient(180deg, #f7f3ff, #ece4fb);
    box-shadow: inset 0 0 0 1px rgba(70, 48, 120, 0.12);
  }
  .moods { display: flex; flex-wrap: wrap; gap: 8px; }
  button {
    border: 0; border-radius: 999px; padding: 8px 14px; background: white; color: #24183d;
    font: inherit; font-weight: 600; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(70, 48, 120, 0.16);
  }
  button[aria-pressed="true"] { background: #6d4aff; color: white; }
  button:focus-visible { outline: 2px solid #24183d; outline-offset: 2px; }
  .node { margin: 0; font-size: 12px; color: #655684; font-variant-numeric: tabular-nums; }
</style>
<div class="card">
  <div class="moods" id="moods">
    <button type="button" data-mood="calm">Calm</button>
    <button type="button" data-mood="bright">Bright</button>
    <button type="button" data-mood="tired">Tired</button>
  </div>
  <p class="node" id="node"></p>
</div>
<script>
  rivto.ready().then(function (node) {
    var line = document.getElementById("node");
    var buttons = Array.prototype.slice.call(document.querySelectorAll("[data-mood]"));
    function apply(next) {
      var mood = next.props.mood;
      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", button.getAttribute("data-mood") === mood ? "true" : "false");
      });
      line.textContent = "list props " + JSON.stringify(next.listProps) + " · children " + next.childIds.length;
    }
    apply(node);
    rivto.subscribe(apply);
    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        rivto.setProp("mood", button.getAttribute("data-mood"));
      });
    });
  });
</script>`;

const CIRCLE_HTML = `<style>
  html, body { height: 100%; margin: 0; }
  .stage {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 40%, #f4f1ff, #e4e7f8 70%);
    position: relative;
  }
  .spin { width: 72%; height: 72%; animation: spin linear infinite; }
  .ring {
    box-sizing: border-box; width: 100%; height: 100%; border-radius: 50%;
    border: 14px solid rgba(109, 94, 252, 0.18);
    border-top-color: #6d5efc; border-right-color: #6d5efc;
  }
  .label {
    position: absolute; font-family: ui-sans-serif, system-ui, sans-serif;
    font-weight: 700; letter-spacing: -0.04em; color: #2a2458; font-size: 18px;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
<div class="stage">
  <div class="spin" id="spin" data-ring="true"><div class="ring" id="ring"></div></div>
  <div class="label" id="label">Focus</div>
</div>
<script>
  rivto.ready().then(function (node) {
    var spin = document.getElementById("spin");
    var ring = document.getElementById("ring");
    var label = document.getElementById("label");
    function apply(next) {
      var speed = Number(next.props.speed);
      var color = typeof next.props.color === "string" ? next.props.color : "#6d5efc";
      spin.style.animationDuration = (Number.isFinite(speed) && speed > 0 ? speed : 8) + "s";
      ring.style.borderTopColor = color;
      ring.style.borderRightColor = color;
      label.textContent = typeof next.props.label === "string" ? next.props.label : "Focus";
    }
    apply(node);
    rivto.subscribe(apply);
  });
</script>`;

const CLOCK_HTML = `<style>
  html, body { height: 100%; margin: 0; }
  .stage { width: 100%; height: 100%; display: grid; place-items: center; background: #f7f5f1; }
  .face {
    width: 78%; height: 78%; border-radius: 50%; position: relative;
    background: radial-gradient(circle at 50% 40%, #fff, #efeae2);
    box-shadow: inset 0 0 0 10px #243056, 0 10px 24px rgba(28, 32, 48, 0.12);
    color: #243056;
  }
  .hand { position: absolute; left: 50%; bottom: 50%; transform-origin: 50% 100%; border-radius: 999px; background: currentColor; }
  .hour { width: 5px; height: 26%; margin-left: -2.5px; }
  .minute { width: 3px; height: 36%; margin-left: -1.5px; }
  .second { width: 2px; height: 40%; margin-left: -1px; background: #d4532b; }
  .cap { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px; border-radius: 50%; background: currentColor; }
</style>
<div class="stage" data-rivto-drag-handle><div class="face" id="face">
  <div class="hand hour" id="hour"></div>
  <div class="hand minute" id="minute"></div>
  <div class="hand second" id="second"></div>
  <div class="cap"></div>
</div></div>
<script>
  rivto.ready().then(function (node) {
    var face = document.getElementById("face");
    var hour = document.getElementById("hour");
    var minute = document.getElementById("minute");
    var second = document.getElementById("second");
    function paint(next) {
      face.style.color = typeof next.props.accent === "string" ? next.props.accent : "#243056";
    }
    function tick() {
      var now = new Date();
      var seconds = now.getSeconds() + now.getMilliseconds() / 1000;
      var minutes = now.getMinutes() + seconds / 60;
      var hours = (now.getHours() % 12) + minutes / 60;
      second.style.transform = "rotate(" + seconds * 6 + "deg)";
      minute.style.transform = "rotate(" + minutes * 6 + "deg)";
      hour.style.transform = "rotate(" + hours * 30 + "deg)";
    }
    paint(node);
    rivto.subscribe(paint);
    tick();
    window.setInterval(tick, 200);
  });
</script>`;

const TALLY_HTML = `<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: grid; place-items: center; height: 100%;
    background: linear-gradient(180deg, #fff7ee, #ffe8d2);
    color: #5a3414; font-family: ui-sans-serif, system-ui, sans-serif;
  }
  .card { display: grid; justify-items: center; gap: 8px; }
  strong { font-size: 64px; line-height: 1; letter-spacing: -0.06em; font-variant-numeric: tabular-nums; }
  p { margin: 0; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; }
  button {
    border: 0; border-radius: 999px; padding: 8px 16px; background: #e07a2f; color: white;
    font: inherit; font-weight: 700; cursor: pointer;
  }
  button:focus-visible { outline: 2px solid #5a3414; outline-offset: 3px; }
</style>
<div class="card">
  <strong id="count">0</strong>
  <p id="caption">Tea</p>
  <button type="button" id="plus" aria-label="Add one">Add</button>
</div>
<script>
  rivto.ready().then(function (node) {
    var count = 0;
    var figure = document.getElementById("count");
    var caption = document.getElementById("caption");
    function paint(next) {
      count = Number(next.props.count);
      if (!Number.isFinite(count)) count = 0;
      figure.textContent = String(count);
      var label = typeof next.props.label === "string" ? next.props.label : "Count";
      caption.textContent = label + " · layer " + next.zIndex;
    }
    paint(node);
    rivto.subscribe(paint);
    document.getElementById("plus").addEventListener("click", function () {
      count += 1;
      figure.textContent = String(count);
      rivto.setProp("count", count);
    });
  });
</script>`;

const SIGNAL_HTML = `<style>
  html, body { height: 100%; margin: 0; }
  .stage {
    width: 100%; height: 100%; display: grid; place-items: center; position: relative;
    background: #161326; color: white; font-family: ui-sans-serif, system-ui, sans-serif; overflow: hidden;
  }
  .orb {
    width: 64%; height: 64%; border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, #fff, hsl(var(--hue), 85%, 62%) 28%, hsl(var(--hue), 70%, 28%) 70%);
    box-shadow: 0 0 40px hsl(var(--hue), 90%, 60%);
    animation: pulse 2.8s ease-in-out infinite;
  }
  .ring {
    position: absolute; width: 78%; height: 78%; border-radius: 50%;
    border: 2px dashed hsl(var(--hue), 90%, 76%);
    animation: spin 14s linear infinite;
  }
  p { position: absolute; margin: 0; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; font-size: 13px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 50% { transform: scale(0.94); } }
</style>
<div class="stage" id="stage">
  <div class="ring"></div>
  <div class="orb"></div>
  <p id="status">On air</p>
</div>
<script>
  rivto.ready().then(function (node) {
    var stage = document.getElementById("stage");
    var status = document.getElementById("status");
    function apply(next) {
      var hue = Number(next.props.hue);
      stage.style.setProperty("--hue", String(Number.isFinite(hue) ? hue : 262));
      status.textContent = typeof next.props.status === "string" ? next.props.status : "Live";
    }
    apply(node);
    rivto.subscribe(apply);
  });
</script>`;

/** Page widgets seeded ahead of the notebook. Pomodoro's timer lives in props. */
export const HTML_BLOCK_SAMPLES: readonly HtmlBlockSample[] = [
  {
    sample: "pomodoro",
    html: POMODORO_HTML,
    props: { sample: "pomodoro", label: "Pomodoro", start: false, timer: 25 },
  },
  {
    sample: "goal",
    html: GOAL_HTML,
    props: { sample: "goal", label: "Reading goal", value: 36, goal: 80 },
  },
  {
    sample: "priorities",
    html: PRIORITY_BOARD_HTML,
    props: { sample: "priorities", label: "Priority board", items: ["Plan", "Build", "Review"] },
  },
  {
    sample: "mixer-block",
    html: MIXER_HTML,
    props: { sample: "mixer-block", label: "Page mixer", volume: 40, playing: false },
  },
  {
    sample: "quote",
    html: QUOTE_HTML,
    props: {
      sample: "quote",
      label: "Field note",
      quote: "Watching for a while is enough.",
      author: "Saturday morning",
    },
  },
  {
    sample: "weekly-progress",
    html: WEEKLY_PROGRESS_HTML,
    props: { sample: "weekly-progress", label: "Weekly progress", sessions: [2, 3, 1, 4, 2, 0, 0] },
  },
  {
    sample: "mood",
    html: MOOD_HTML,
    props: { sample: "mood", label: "Mood", mood: "calm" },
    listProps: { tone: "soft" },
  },
];

/** Canvas widgets placed to the right of the picnic diagram. */
export const HTML_ELEMENT_SAMPLES: readonly HtmlElementSample[] = [
  {
    sample: "circle",
    html: CIRCLE_HTML,
    props: { sample: "circle", label: "Focus", speed: 6, color: "#6d5efc" },
    frame: { x: 2140, y: 48, width: 250, height: 250 },
  },
  {
    sample: "clock",
    html: CLOCK_HTML,
    props: { sample: "clock", label: "Clock", accent: "#243056" },
    frame: { x: 2410, y: 48, width: 250, height: 250 },
  },
  {
    sample: "tally",
    html: TALLY_HTML,
    props: { sample: "tally", label: "Tea", count: 2 },
    frame: { x: 2680, y: 48, width: 230, height: 250 },
  },
  {
    sample: "orbit",
    html: ORBIT_HTML,
    props: { sample: "orbit", label: "Orbit", running: true },
    frame: { x: 3200, y: 48, width: 250, height: 250 },
  },
  {
    sample: "signal",
    html: SIGNAL_HTML,
    props: { sample: "signal", label: "Signal", status: "On air", hue: 262 },
    frame: { x: 2930, y: 48, width: 250, height: 250 },
  },
  {
    sample: "mixer",
    html: MIXER_HTML,
    props: { sample: "mixer", label: "Sound mixer", volume: 40, playing: false },
    frame: { x: 3470, y: 48, width: 280, height: 250 },
  },
  {
    sample: "priorities-element",
    html: PRIORITY_BOARD_HTML,
    props: {
      sample: "priorities-element",
      label: "Canvas priorities",
      items: ["Sketch", "Create", "Share"],
    },
    frame: { x: 3470, y: 360, width: 300, height: 290 },
  },
];
