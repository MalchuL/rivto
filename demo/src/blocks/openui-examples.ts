/**
 * Seeded OpenUI Lang programs for the journal demo.
 *
 * These follow the stock `openuiLibrary` examples: a table, a chart, and a
 * form. Each one is a complete `root = Stack(...)` program.
 *
 * @module
 */

/** Read-only language table. */
export const OPENUI_TABLE_EXAMPLE = `root = Stack([title, tbl])
title = TextContent("Top Languages", "large-heavy")
tbl = Table([Col("Language", langs), Col("Users (M)", users), Col("Year", years)])
langs = ["Python", "JavaScript", "Java", "TypeScript", "Go"]
users = [15.7, 14.2, 12.1, 8.5, 5.2]
years = [1991, 1995, 1995, 2012, 2009]`;

/** Grouped bar chart. */
export const OPENUI_CHART_EXAMPLE = `root = Stack([title, chart])
title = TextContent("Q4 Revenue", "large-heavy")
chart = BarChart(labels, [s1, s2], "grouped")
labels = ["Oct", "Nov", "Dec"]
s1 = Series("Product A", [120, 150, 180])
s2 = Series("Product B", [90, 110, 140])`;

/** Contact form with validation and two actions. */
export const OPENUI_FORM_EXAMPLE = `root = Stack([title, form])
title = TextContent("Contact Us", "large-heavy")
form = Form("contact", btns, [nameField, emailField, countryField, msgField])
nameField = FormControl("Name", Input("name", "Your name", "text", { required: true, minLength: 2 }))
emailField = FormControl("Email", Input("email", "you@example.com", "email", { required: true, email: true }))
countryField = FormControl("Country", Select("country", countryOpts, "Select...", { required: true }))
msgField = FormControl("Message", TextArea("message", "Tell us more...", 4, { required: true, minLength: 10 }))
countryOpts = [SelectItem("us", "United States"), SelectItem("uk", "United Kingdom"), SelectItem("de", "Germany")]
btns = Buttons([Button("Submit", Action([@ToAssistant("Submit")]), "primary"), Button("Cancel", Action([@ToAssistant("Cancel")]), "secondary")])`;

/** Programs inserted into today's journal, in display order. */
export const OPENUI_DEMO_EXAMPLES = [
  OPENUI_TABLE_EXAMPLE,
  OPENUI_CHART_EXAMPLE,
  OPENUI_FORM_EXAMPLE,
] as const;
