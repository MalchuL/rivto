/** Document shown when someone places a new HTML element from the toolbar. */
export const HTML_STARTER = `<style>
  html, body { height: 100%; margin: 0; }
  body {
    position: relative;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 30% 20%, #d9ddff, #f7f4ef 55%, #efe7db);
    color: #1c2348;
    font-family: ui-sans-serif, system-ui, sans-serif;
    text-align: center;
  }
  p { margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -0.04em; }
  small { display: block; margin-top: 6px; color: #5c6478; font-size: 12px; }
  .drag-region { position: absolute; inset: 0 0 auto; height: 24px; cursor: grab; }
</style>
<div class="drag-region" data-rivto-drag-handle aria-hidden="true"></div>
<p id="label">HTML<small>Edit to paste markup</small></p>
<script>
  rivto.ready().then(function (node) {
    var label = document.getElementById("label");
    function paint(next) {
      var text = typeof next.props.label === "string" ? next.props.label : "HTML";
      label.firstChild.textContent = text;
    }
    paint(node);
    rivto.subscribe(paint);
  });
</script>`;
