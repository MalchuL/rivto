/** Interactive animated HTML documents seeded in the demo. */

/** A weekly progress board whose controls persist each completed session. */
export const WEEKLY_PROGRESS_HTML = `<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.4 system-ui, sans-serif; color: #151522; }
  .card { padding: 20px; border: 1px solid #c5c8d5; border-radius: 12px; background: #fff; }
  header { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
  h2, p { margin: 0; } h2 { font-size: 16px; } p { color: #555569; font-size: 12px; }
  .badge { border-radius: 999px; padding: 4px 8px; background: #edeafa; color: #42308e; font-size: 12px; }
  .chart { display: flex; gap: 10px; align-items: end; height: 105px; margin: 20px 0 12px; }
  .day { display: grid; flex: 1; gap: 5px; height: 100%; text-align: center; color: #555569; font-size: 11px; }
  .track { display: flex; align-items: end; border-radius: 6px; background: #e9ebf2; overflow: hidden; }
  .bar { width: 100%; height: var(--height); background: #5038b3; border-radius: 6px; transition: height 350ms ease-out; }
  footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  button { border: 0; border-radius: 8px; padding: 8px 12px; color: white; background: #5038b3; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 3px solid #a89be5; outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
<section class="card" aria-label="Weekly focus progress">
  <header><div><h2>Focus this week</h2><p>Sessions completed each day</p></div><span class="badge" id="total"></span></header>
  <div class="chart" id="chart" aria-label="Daily sessions"></div>
  <footer><p>Build a little momentum every day.</p><button type="button" id="add">Add session</button></footer>
</section>
<script>
  rivto.ready().then(function (node) {
    var chart = document.getElementById('chart');
    var days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    var values = [];
    days.forEach(function (day) {
      var item = document.createElement('div'); item.className = 'day';
      var track = document.createElement('div'); track.className = 'track';
      var bar = document.createElement('div'); bar.className = 'bar';
      track.appendChild(bar); item.appendChild(track);
      var label = document.createElement('span'); label.textContent = day; item.appendChild(label);
      chart.appendChild(item);
    });
    function paint(next) {
      values = Array.isArray(next.props.sessions) ? next.props.sessions : [0,0,0,0,0,0,0];
      var total = 0;
      chart.querySelectorAll('.bar').forEach(function (bar, index) {
        var count = Math.max(0, Math.min(5, Number(values[index]) || 0));
        total += count; bar.style.setProperty('--height', (count * 20) + '%');
        bar.setAttribute('aria-label', count + ' sessions');
      });
      document.getElementById('total').textContent = total + ' sessions';
    }
    document.getElementById('add').addEventListener('click', function () {
      var next = values.slice(0, 7); next[4] = Math.min(5, (Number(next[4]) || 0) + 1);
      rivto.setProp('sessions', next);
    });
    paint(node); rivto.subscribe(paint);
  });
</script>`;

/** A responsive orbit with an editable, persisted motion state. */
export const ORBIT_HTML = `<style>
  * { box-sizing: border-box; } html, body { width: 100%; height: 100%; margin: 0; }
  body { display: grid; place-items: center; font: 14px system-ui, sans-serif; color: #151522; background: #edeafa; }
  .scene { position: relative; display: grid; place-items: center; width: 100%; height: 100%; overflow: hidden; }
  .orbit { position: absolute; width: 72%; aspect-ratio: 1; border: 1px solid #a89be5; border-radius: 50%; animation: orbit 9s linear infinite; }
  .orbit::before, .orbit::after { content: ''; position: absolute; width: 10%; aspect-ratio: 1; border-radius: 50%; background: #5038b3; }
  .orbit::before { top: 8%; left: 10%; } .orbit::after { bottom: 8%; right: 10%; background: #a89be5; }
  .paused .orbit { animation-play-state: paused; }
  .center { display: grid; place-items: center; width: 44%; aspect-ratio: 1; border-radius: 50%; background: #fff; text-align: center; }
  strong { font-size: clamp(14px, 6cqw, 24px); } small { display: block; color: #555569; }
  button { position: absolute; bottom: 8%; border: 1px solid #c5c8d5; border-radius: 8px; background: #fff; color: #151522; padding: 5px 10px; cursor: pointer; }
  button:focus-visible { outline: 3px solid #a89be5; outline-offset: 2px; }
  @keyframes orbit { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .orbit { animation: none; } }
</style>
<section class="scene" aria-label="Animated focus orbit">
  <div class="orbit" aria-hidden="true"></div><div class="center"><div><strong>Focus</strong><small id="status"></small></div></div>
  <button type="button" id="toggle"></button>
</section>
<script>
  rivto.ready().then(function (node) {
    var running = true; var scene = document.querySelector('.scene'); var button = document.getElementById('toggle');
    function paint(next) {
      running = next.props.running !== false; scene.classList.toggle('paused', !running);
      button.textContent = running ? 'Pause orbit' : 'Resume orbit';
      document.getElementById('status').textContent = running ? 'In motion' : 'Paused';
    }
    button.addEventListener('click', function () { rivto.setProp('running', !running); });
    paint(node); rivto.subscribe(paint);
  });
</script>`;
