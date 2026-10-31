# Design: Rivto

The editor and demo use a minimal, high-contrast system with consistent light surfaces. Preserve the editor's established interaction and geometry contracts.

## System

- Light, cool surroundings frame opaque writing surfaces; a single neutral treatment unifies the chrome and containers.
- Keep large surfaces flat and free of decorative gradients; use contrast and spacing to establish hierarchy.
- Periwinkle marks active controls; deep violet marks focus and selection. Use dark neutral text on light surfaces.
- Use the native system sans-serif stack. Keep typography and control sizes suitable for dense editor work.

## Surfaces and controls

The shared `--rivto-*` tokens in `packages/react-rivto-editor/src/styles/tokens.css` define colors and focus. Hosts may override them. Use flat fills and restrained borders for large surfaces; keep detail and brief motion on small controls. Functional patterns such as the canvas grid and transparency checker remain distinct from decorative gradients.

Kanban lanes, Bento tiles and TODO cards use a light surface hierarchy with restrained borders. Preserve the shared selection fill on every nested surface; priority colors remain distinguishable without tinting the text.

Prefer an icon-first button when a recognizable icon can communicate its action. Give icon-only buttons an accessible name and a descriptive title; use a visible text label when the icon alone would be ambiguous. Reuse the application's existing icon set. Give every interactive control a visible keyboard focus and keep state distinguishable without color alone.

## Scannable interfaces

For dense interfaces, first identify what the user needs to find, compare or change, along with the entities, attributes and actions that support that task. Make those answers easy to locate without reading the entire screen.

- Use a few consistent alignment anchors. Align row labels to a shared left edge and values or actions to a shared right edge; stack related content on existing edges. Use columns, rows or section boundaries when a new anchor is needed.
- Give repeated items a predictable order and group them by meaningful attributes such as status or due date. Use headings, row structure and compact metadata to distinguish groups; retain useful actions rather than hiding them or adding whitespace to disguise density.
- Use visuals when their meaning is immediately recognizable in context: for example, avatars for relevant identities, familiar state indicators and chips for categories. Keep a short visible label when an icon would require guessing or a tooltip.
- Keep default and inactive states quiet. Reserve stronger color, fill and weight for selected, changed, actionable or exceptional information, and never communicate state through color alone.
- Prefer shared column edges, row separators and section groups over nested cards and repeated borders when the surrounding layout already provides structure. Use a card when its boundary separates a distinct object or interaction.

Check the whole layout by asking someone to find a target item, identify its status and locate its next action without reading every row. Revise the structure if they must hunt through uniform text or guess at controls. When proposing or reviewing a design, explain the scanning goal, alignment and grouping, visual and text choices, emphasis rules, and the change from the previous layout. These are heuristics; accessibility and task clarity take precedence.

## Motion

Motion communicates state and remains restrained on small controls. Animate color, transforms and opacity rather than layout dimensions, and provide a reduced-motion alternative. Content must remain available without animation.

## Implementation

The editor and demo use the existing `--rivto-*` tokens. Embedded editors inherit their host typography; the demo uses system fonts without a remote font request. Preserve functional states when applying the system elsewhere.

## Editor layout dependencies

- Page and canvas block rows share `--rivto-block-padding`, `--rivto-block-gap`, `--rivto-block-indent`, control sizes and slot gaps. Perimeter slots are positioned against their owner; start and end slots participate in row layout. Changes to these values affect alignment, hit areas and nested content, not just appearance.
- The block handle fits the 24px outline indent. The demo's block numbers offset each nested level by `--rivto-block-indent` to remain aligned in the gutter. Embedded editors reserve their own handle gutter and remove the normal editor-end spacer.
- Container padding and the drop wrappers define visible spacing around child layouts; drop target thickness is a separate hit-geometry token. Bento tile widths include insertion strips, and table cell widths and borders participate in its grid. Test drag placement, nesting and resizing when changing these dimensions.
- The journal stack supplies its own page padding, borders and clipping; edgeless mode changes that clipping so canvas controls and gestures can extend beyond the paper. Preserve these relationships when styling the demo.
- The demo toolbar and date precede the writing surface in normal flow. Their height and the loaded font can change wrapping and the position of blocks in the viewport; browser tests should locate current bounds instead of assuming fixed coordinates. Markdown's editing layer and preview must continue to share font metrics.
- Drag feedback uses a 4px accent line or outline and a light target tint. These are paint-only tokens; target regions and canonical drop placement remain owned by Page.
