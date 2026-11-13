/** Interactive HTML samples shared by the demo's block and canvas fixtures. */

/** A task list with native drag and drop, keyboard controls and editable input. */
export const PRIORITY_BOARD_HTML = `<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px ui-sans-serif, system-ui, sans-serif; color: var(--rivto-foreground, #151522); }
  .board { padding: 18px; border: 1px solid var(--rivto-border, #c5c8d5); border-radius: 16px; background: var(--rivto-background, #fff); }
  .heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  h2 { margin: 0; font-size: 16px; } p { color: var(--rivto-muted-foreground, #555569); margin: 6px 0 12px; }
  .list { display: grid; gap: 6px; }
  .item { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 8px; border-radius: 8px; background: var(--rivto-muted, #e9ebf2); transition: background 160ms; }
  .item[draggable=true] { cursor: grab; } .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  button, input { font: inherit; } button { cursor: pointer; border: 1px solid var(--rivto-border, #c5c8d5); background: var(--rivto-background, #fff); border-radius: 6px; padding: 4px 8px; }
  form { display: flex; gap: 6px; margin-top: 12px; } input { min-width: 0; flex: 1; border: 1px solid var(--rivto-input, #aaafc1); border-radius: 6px; padding: 6px 8px; }
  @media (prefers-reduced-motion: reduce) { .item { transition: none; } }
</style>
<section class="board">
  <div class="heading"><h2>Priority board</h2><span id="total"></span></div>
  <p>Drag a task or use its arrows to reorder.</p>
  <div class="list" id="list" aria-label="Priorities"></div>
  <form id="form"><input id="task" aria-label="New task" placeholder="Add a task" disabled><button id="add" disabled>Add</button></form>
</section>
<script>
  var addTask = null;
  document.getElementById("form").addEventListener("submit", function (event) {
    event.preventDefault();
    if (addTask) addTask();
  });
  rivto.ready().then(function (node) {
    var items = [];
    var rendered = false;
    var list = document.getElementById("list");
    var input = document.getElementById("task");
    /**
     * Updates the visible list and commits its new order to the widget.
     *
     * @param next - Complete task order.
     * @returns The new list is rendered and sent to the host.
     */
    function save(next) {
      items = next;
      render();
      rivto.setProp("items", items);
    }
    /**
     * Moves one task and restores the active reorder control when possible.
     *
     * @param from - Existing task index.
     * @param to - Destination index in the list.
     * @returns The task and focused control have moved, or invalid indices are ignored.
     */
    function move(from, to) {
      if (from < 0 || to < 0 || from >= items.length || to >= items.length || from === to) return;
      var focused = document.activeElement;
      var direction = list.children[from].contains(focused) ? focused.dataset.direction : null;
      var next = items.slice();
      next.splice(to, 0, next.splice(from, 1)[0]);
      save(next);
      if (direction) {
        var buttons = list.children[to].querySelectorAll("button");
        var preferred = buttons[direction === "-1" ? 0 : 1];
        (preferred.disabled ? buttons[direction === "-1" ? 1 : 0] : preferred).focus();
      }
    }
    /**
     * Rebuilds the task rows and their keyboard reorder buttons.
     *
     * @returns The current task order is visible in the list.
     */
    function render() {
      rendered = true;
      list.replaceChildren();
      document.getElementById("total").textContent = items.length + " tasks";
      items.forEach(function (item, index) {
        var row = document.createElement("div");
        row.className = "item"; row.draggable = true; row.dataset.index = String(index);
        var label = document.createElement("span"); label.className = "name"; label.textContent = item;
        row.appendChild(label);
        [-1, 1].forEach(function (direction) {
          var button = document.createElement("button"); button.type = "button";
          button.textContent = direction < 0 ? "↑" : "↓";
          button.dataset.direction = String(direction);
          button.setAttribute("aria-label", (direction < 0 ? "Move up " : "Move down ") + item);
          button.disabled = index + direction < 0 || index + direction >= items.length;
          button.addEventListener("click", function () { move(index, index + direction); });
          row.appendChild(button);
        });
        list.appendChild(row);
      });
    }
    /**
     * Applies document updates without replacing unchanged focused controls.
     *
     * @param next - Latest detached widget snapshot.
     * @returns Changed tasks are rendered; identical updates keep focus intact.
     */
    function apply(next) {
      var updated = Array.isArray(next.props.items) ? next.props.items.filter(function (item) { return typeof item === "string"; }) : [];
      if (rendered && items.length === updated.length && items.every(function (item, index) { return item === updated[index]; })) return;
      items = updated;
      render();
    }
    list.addEventListener("dragstart", function (event) {
      var row = event.target.closest(".item");
      if (row) event.dataTransfer.setData("text/plain", row.dataset.index);
    });
    list.addEventListener("dragover", function (event) { event.preventDefault(); });
    list.addEventListener("drop", function (event) {
      event.preventDefault();
      var row = event.target.closest(".item");
      var source = event.dataTransfer.getData("text/plain");
      if (row && source !== "") move(Number(source), Number(row.dataset.index));
    });
    /**
     * Appends the nonempty input value to the persisted task list.
     *
     * @returns A new task is added and the field is cleared when text exists.
     */
    addTask = function () {
      var value = input.value.trim();
      if (value) { save(items.concat(value)); input.value = ""; }
    };
    input.disabled = false;
    document.getElementById("add").disabled = false;
    apply(node); rivto.subscribe(apply);
  });
</script>`;

/** A compact mixer with a quiet looping melody and live volume control. */
export const MIXER_HTML = `<style>
  * { box-sizing: border-box; }
  html, body { height: 100%; } body { margin: 0; font: 14px ui-sans-serif, system-ui, sans-serif; color: var(--rivto-foreground, #151522); }
  .mixer { height: 100%; display: grid; align-content: center; gap: 12px; padding: 18px; background: var(--rivto-background, #fff); border: 1px solid var(--rivto-border, #c5c8d5); border-radius: 16px; }
  .top, .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  h2 { margin: 0; font-size: 16px; } .meter { width: 12px; height: 12px; border-radius: 50%; background: #71717a; }
  .meter[data-playing=true] { background: #22c55e; animation: pulse 1.5s ease-in-out infinite; }
  label { display: grid; gap: 6px; } input { width: 100%; accent-color: var(--rivto-accent, #5038b3); }
  button { cursor: pointer; font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--rivto-border, #c5c8d5); background: var(--rivto-background, #fff); color: inherit; }
  .status { margin: 0; font-size: 12px; color: var(--rivto-muted-foreground, #555569); }
  @keyframes pulse { 50% { opacity: .45; transform: scale(.8); } }
  @media (prefers-reduced-motion: reduce) { .meter { animation: none !important; } }
</style>
<section class="mixer">
  <div class="top"><h2>Sound mixer</h2><span class="meter" id="meter" aria-hidden="true"></span></div>
  <label><span class="row">Volume <output id="value">40</output></span><input id="volume" aria-label="Volume" type="range" min="0" max="100" value="40"></label>
  <div class="row"><span>Playback</span><button id="play" type="button">Play</button></div>
  <p class="status" id="status" role="status">A gentle looping melody</p>
</section>
<script>
  rivto.ready().then(function (node) {
    var volume = document.getElementById("volume");
    var value = document.getElementById("value");
    var play = document.getElementById("play");
    var meter = document.getElementById("meter");
    var status = document.getElementById("status");
    var playing = false;
    var starting = false;
    var audio = null;
    var oscillator = null;
    var oscillatorStarted = false;
    var gain = null;
    var noteGain = null;
    var phraseTimer = 0;
    var nextPhrase = 0;
    /**
     * Updates the visible playback controls from the local audio lifecycle.
     *
     * @returns The button and indicator reflect active or starting playback.
     */
    function renderPlayback() {
      play.disabled = starting;
      play.textContent = playing ? "Pause" : "Play";
      meter.dataset.playing = String(playing);
    }
    /**
     * Applies the slider to active playback without writing intermediate values.
     *
     * @returns The output label and audio gain reflect the current slider value.
     */
    function applyVolume() {
      value.value = volume.value;
      if (audio && gain) {
        gain.gain.setTargetAtTime(Math.max(0, Math.min(100, Number(volume.value))) / 100 * 0.08, audio.currentTime, 0.01);
      }
    }
    /**
     * Stops the melody and releases its browser audio resources.
     *
     * @returns The oscillator is stopped and the audio context is closing when present.
     */
    function stopSound() {
      var context = audio;
      audio = null;
      window.clearInterval(phraseTimer);
      phraseTimer = 0;
      if (oscillator) {
        if (oscillatorStarted) {
          oscillator.stop();
        }
        oscillator.disconnect(); oscillator = null; oscillatorStarted = false;
      }
      if (gain) {
        gain.disconnect(); gain = null;
      }
      if (noteGain) {
        noteGain.disconnect(); noteGain = null;
      }
      if (context && context.state !== "closed") {
        context.close().catch(function () {});
      }
      playing = false;
      starting = false;
      renderPlayback();
    }
    /**
     * Schedules one short phrase ahead of the current audio clock.
     *
     * @returns Eight notes are queued, or nothing changes when playback has stopped.
     */
    function schedulePhrase() {
      if (!audio || audio.state !== "running" || !oscillator || !noteGain) {
        return;
      }
      var start = Math.max(audio.currentTime + 0.02, nextPhrase);
      var notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
      notes.forEach(function (frequency, index) {
        var time = start + index * 0.25;
        oscillator.frequency.setValueAtTime(frequency, time);
        noteGain.gain.setValueAtTime(0, time);
        noteGain.gain.linearRampToValueAtTime(1, time + 0.02);
        noteGain.gain.setValueAtTime(1, time + 0.18);
        noteGain.gain.linearRampToValueAtTime(0, time + 0.24);
      });
      nextPhrase = start + notes.length * 0.25;
    }
    /**
     * Starts the melody in direct response to a user activation.
     *
     * @returns Audio starts asynchronously; an unavailable device is reported in the widget.
     */
    function startSound() {
      var AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) {
        status.textContent = "Audio is unavailable in this browser.";
        return;
      }
      try {
        var context = new AudioEngine();
        audio = context;
        noteGain = context.createGain();
        gain = context.createGain();
        oscillator = context.createOscillator();
        oscillator.type = "sine";
        noteGain.gain.value = 0;
        applyVolume();
        oscillator.connect(noteGain);
        noteGain.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillatorStarted = true;
        starting = true;
        renderPlayback();
        context.resume().then(function () {
          if (audio !== context) {
            return;
          }
          if (context.state !== "running") {
            stopSound(); status.textContent = "Audio could not start.";
            return;
          }
          nextPhrase = 0;
          schedulePhrase();
          schedulePhrase();
          phraseTimer = window.setInterval(schedulePhrase, 2000);
          starting = false; playing = true;
          status.textContent = "A gentle looping melody";
          renderPlayback(); rivto.setProp("playing", true);
        }).catch(function () {
          if (audio !== context) {
            return;
          }
          stopSound(); status.textContent = "Audio could not start.";
        });
      } catch (error) {
        stopSound(); status.textContent = "Audio could not start.";
      }
    }
    /**
     * Renders volume and playback from a detached widget snapshot.
     *
     * @param next - Latest mixer state published by the host.
     * @returns Slider, value, button and indicator reflect the snapshot.
     */
    function apply(next) {
      volume.value = String(Number(next.props.volume) || 0);
      applyVolume();
      if (next.props.playing !== true && playing) {
        stopSound();
      }
      renderPlayback();
    }
    volume.addEventListener("input", applyVolume);
    volume.addEventListener("change", function () { rivto.setProp("volume", Number(volume.value)); });
    play.addEventListener("click", function () {
      if (playing) {
        stopSound(); rivto.setProp("playing", false);
      } else {
        startSound();
      }
    });
    window.addEventListener("pagehide", stopSound);
    apply(node); rivto.subscribe(apply);
  });
</script>`;
