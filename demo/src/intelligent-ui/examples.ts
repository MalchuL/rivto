/**
 * Seeded OpenUI Lang programs for the journal demo.
 *
 * Each program runs in the page with the Intelligent UI library. State stays in
 * the renderer; the stored content is the source.
 *
 * @module
 */

/** Guest stepper, checklist, and copy button. */
export const INTELLIGENT_UI_SHOPPING_LIST = `root = Card([title, stepper, list, copy])
$guests = 4
$got = []
title = Title("Pasta night for " + @Plural($guests, "guest"), "lg")
stepper = Row([IconButton("minus", @Set($guests, @Clamp($guests - 1, 1, 20)), "Fewer"), Text($guests + "", "lg", null, "semibold"), IconButton("plus", @Set($guests, @Clamp($guests + 1, 1, 20)), "More")], 3)
lines = @Each(base, "i", {name: i.name, qty: @Round(i.qty * $guests / 4) + i.unit})
list = Col(@Each(lines, "l", Pressable([Row([Icon(@Includes($got, l.name) ? "check-circle" : "circle", "sm"), Text(l.qty + " " + l.name, "sm", null, null, false, @Includes($got, l.name))], 2)], @Set($got, @Toggle($got, l.name)), @Includes($got, l.name), 2)), 1)
copy = Button("Copy list", @CopyToClipboard(@Join(@Each(lines, "l", l.qty + " " + l.name), "\\n")), "outline", null, "sm", "copy")
base = [{name: "spaghetti", qty: 400, unit: " g"}, {name: "tomatoes", qty: 6, unit: ""}, {name: "parmesan", qty: 80, unit: " g"}]`;

/** Sliders that recompute a total without another edit. */
export const INTELLIGENT_UI_GDP = `root = Card([Title("What makes up GDP?", "lg"), total, Slider($c, 0, 1200, 10, "Consumer spending"), Slider($i, 0, 600, 10, "Business investment"), Button("Reset economy", @Reset($c, $i), "ghost")])
$c = 600
$i = 200
total = Title("$" + @Round($c + $i) + " billion", "xl")`;

const counterHtml = `<p id="out">Count 0</p><button id="add" type="button">Add</button><script>let n=0;document.getElementById("add").onclick=()=>{n+=1;document.getElementById("out").textContent="Count "+n}</script>`;

/** Sandboxed page. The editor stores the program; the button runs in the frame. */
export const INTELLIGENT_UI_COUNTER_APP = `root = Col([Title("A small app", "md"), Text("The frame below is a sandboxed page from this block's source.", "sm", "muted"), HtmlView(${JSON.stringify(counterHtml)}, 140, "Counter app")])`;

/** Programs inserted into today's journal, in display order. */
export const INTELLIGENT_UI_DEMO_PROGRAMS = [
  INTELLIGENT_UI_SHOPPING_LIST,
  INTELLIGENT_UI_GDP,
  INTELLIGENT_UI_COUNTER_APP,
] as const;
