import type { BlockInput } from "@chulane/document-model";
import type { DocumentEditorAPI, EditorElementNode } from "@chulane/rivto";
import { separatorBlockFactory } from "@chulane/rivto-react/block-factories";
import {
  createBentoBlockInput,
  TODO_ITEM_BLOCK_TYPE,
  TODO_STORAGE_BLOCK_TYPE,
} from "@chulane/rivto-react";

/** Borrowed operations needed to populate the demo notebook. */
interface JournalSeedEditor {
  /** Creates canvas visuals through registered editor commands. */
  readonly commands: Pick<DocumentEditorAPI["commands"], "execute">;
  /** Inserts blocks at the end of the current root sequence. */
  readonly blocks: Pick<
    DocumentEditorAPI["blocks"],
    "insertBlock" | "getInsertionDestinationAfter"
  >;
  /** Creates canvas cards referencing notebook sections. */
  readonly elements: Pick<DocumentEditorAPI["elements"], "insertElement">;
  /** Groups repeated seed insertions into one history batch. */
  readonly history: Pick<DocumentEditorAPI["history"], "batchUpdates">;
}

/** The notebook sections are ordinary document blocks, separated into canvas cards. */
const JOURNAL_SECTIONS: BlockInput[][] = [
  [
    { type: "paragraph", content: "# A weekend outdoors" },
    {
      type: "paragraph",
      content: "A few plans for slowing down, eating well, and spending time with friends.",
    },
    { type: "paragraph", content: "## A morning with the birds" },
    {
      type: "paragraph",
      content:
        "Take the long path by the water. Bring binoculars and a notebook, and see what is moving among the reeds.",
    },
    {
      type: "paragraph",
      content:
        "The lake is usually quiet before nine. We can stop at the wooden lookout, then follow the trail through the birch trees while the light is still soft.",
    },
    { type: "paragraph", content: "### What to bring" },
    {
      type: "paragraph",
      content: "Look for herons near the shore",
      listProps: { type: "checkbox", checked: false },
    },
    {
      type: "paragraph",
      content: "Listen for woodpeckers in the trees",
      listProps: { type: "checkbox", checked: false },
    },
    {
      type: "paragraph",
      content: "Pack a thermos and an extra layer",
      listProps: { type: "checkbox", checked: true },
    },
    {
      type: "paragraph",
      content:
        "A field guide will help with the birds we don't recognize. No need to identify everything; watching for a while is enough.",
    },
    {
      type: "paragraph",
      content:
        "> Last time we saw a kingfisher flash blue over the water. Let's look for it again.",
    },
    {
      type: "paragraph",
      content:
        "If it rains, the little nature center has a window overlooking the feeders and a good pot of tea.",
    },
  ],
  [
    { type: "paragraph", content: "## Lunch on the grass" },
    {
      type: "paragraph",
      content: "Keep it simple: something crunchy, something fresh, and enough to share.",
    },
    { type: "paragraph", content: "**Sandwiches:** roast vegetables, hummus, greens, and lemon." },
    {
      type: "paragraph",
      content: "**For the basket:** apples, olives, a small loaf, and sparkling water.",
    },
    {
      type: "paragraph",
      content:
        "Roast the peppers and zucchini the night before, then assemble the sandwiches in the morning so the bread stays fresh.",
    },
    { type: "paragraph", content: "### A little something sweet" },
    {
      type: "paragraph",
      content:
        "Bring a jar of berries and a few squares of dark chocolate. If the bakery has cinnamon buns, those can come along too.",
    },
    { type: "paragraph", content: "> Remember a blanket and a bag for bringing everything home." },
    { type: "paragraph", content: "### Before we leave" },
    {
      type: TODO_STORAGE_BLOCK_TYPE,
      content: "",
      children: [
        {
          type: TODO_ITEM_BLOCK_TYPE,
          content: "Pick up fresh bread",
          props: {
            status: "todo",
            description: "Stop by the bakery in the morning.",
            priority: 2,
            project: "Picnic",
          },
        },
        {
          type: TODO_ITEM_BLOCK_TYPE,
          content: "Make the hummus",
          props: {
            status: "doing",
            description: "Add extra lemon and paprika.",
            priority: 3,
            project: "Picnic",
          },
        },
        {
          type: TODO_ITEM_BLOCK_TYPE,
          content: "Find the picnic blanket",
          props: {
            status: "done",
            description: "It is by the front door.",
            priority: 4,
            project: "Picnic",
          },
        },
      ],
    },
    {
      type: "paragraph",
      content:
        "We'll meet by the old oak at noon. There is a shady spot nearby and plenty of space to spread out the blanket.",
    },
  ],
  [
    { type: "paragraph", content: "## Games for a quiet evening" },
    {
      type: "paragraph",
      content:
        "When everyone gets back, put the kettle on and pick a game that leaves room for conversation.",
    },
    {
      type: "paragraph",
      content:
        "Start with something everyone knows, then let the winner choose what comes next. Keep the rules nearby for anyone joining halfway through.",
    },
    { type: "paragraph", content: "### A few ideas" },
    {
      ...createBentoBlockInput(),
      children: [
        {
          type: "paragraph",
          content:
            "**A cooperative puzzle**\nWork together, take turns, and celebrate the small discoveries.",
          props: { bentoWidth: 260 },
        },
        {
          type: "paragraph",
          content:
            "**A quick card game**\nSomething easy to teach, with another round always an option.",
          props: { bentoWidth: 260 },
        },
        {
          type: "paragraph",
          content: "**A jigsaw by the window**\nLeave it out for anyone who wants to add a piece.",
          props: { bentoWidth: 260 },
        },
      ],
    },
    {
      type: "paragraph",
      content:
        "Set out tea, sliced fruit, and whatever is left from lunch. A playlist in the background makes the room feel cozy without competing with the conversation.",
    },
    {
      type: "paragraph",
      content:
        "Ask everyone to bring a favorite game or a puzzle they haven't had a chance to finish.",
      listProps: { type: "checkbox", checked: false },
    },
    {
      type: "paragraph",
      content: "> The best game nights are the ones where nobody minds losing track of the score.",
    },
    {
      type: "paragraph",
      content: "Next time: try a new trail and bring a camera for the early light.",
    },
  ],
];

/**
 * Seeds a readable weekend notebook, matching canvas cards, and a weekend plan.
 *
 * Separators preserve the same document boundaries used by the editor. Extra
 * copies repeat the final section for large-document exploration.
 *
 * @param editor - Initialized editor whose empty document receives the notebook.
 * @param repeatCount - Number of additional copies of the final section.
 * @returns The notebook, separators, canvas cards, and plan have been inserted.
 * @throws If a delegated block or element operation fails.
 */
export function seedJournalDemo(editor: JournalSeedEditor, repeatCount: number): void {
  let afterId: string | undefined;
  for (const [index, section] of JOURNAL_SECTIONS.entries()) {
    if (index > 0) {
      afterId = editor.blocks.insertBlock(
        separatorBlockFactory.createEmptyBlock(),
        editor.blocks.getInsertionDestinationAfter(afterId),
      ).id;
    }
    const ids = section.map((block) => {
      const created = editor.blocks.insertBlock(
        block,
        editor.blocks.getInsertionDestinationAfter(afterId),
      );
      afterId = created.id;
      return created.id;
    });
    editor.elements.insertElement({
      type: "block",
      frame: { x: 60 + index * 770, y: 370, width: 500, height: 360 },
      zIndex: index,
      props: { startBlockId: ids[0], endBlockId: ids.at(-1) },
    });
  }
  const template = JOURNAL_SECTIONS.at(-1)!;
  editor.history.batchUpdates(() => {
    for (let index = 0; index < repeatCount; index += 1) {
      afterId = editor.blocks.insertBlock(
        separatorBlockFactory.createEmptyBlock(),
        editor.blocks.getInsertionDestinationAfter(afterId),
      ).id;
      let firstId: string | undefined;
      for (const block of template) {
        afterId = editor.blocks.insertBlock(
          block,
          editor.blocks.getInsertionDestinationAfter(afterId),
        ).id;
        firstId ??= afterId;
      }
      editor.elements.insertElement({
        type: "block",
        frame: { x: 2370 + index * 540, y: 370, width: 500, height: 360 },
        zIndex: index + 3,
        props: { startBlockId: firstId, endBlockId: afterId },
      });
    }
  });
  seedCanvasPlans(editor);
}

/**
 * Creates the diagrams, notes, and drawings with no initial canvas selection.
 *
 * @param editor - Editor whose registered visual commands create the plans.
 * @returns Canvas content has been inserted and the selection cleared.
 * @throws If a registered canvas command fails.
 */
function seedCanvasPlans(editor: JournalSeedEditor): void {
  const morning = seedWeekendPlan(editor);
  seedRainPlan(editor, morning);
  seedPicnicPlan(editor);
  seedCanvasNotes(editor);
  seedAnimalDrawings(editor);
  editor.commands.execute("edgeless.selection.clear");
}

/**
 * Creates a connected weekend plan above the notebook's canvas cards.
 *
 * The shapes are independent editable elements and their connectors attach to
 * their edges so the links follow the stages when moved.
 *
 * @param editor - Editor whose registered visual commands create the plan.
 * @returns The morning stage after inserting the plan's title, stages, connectors, and note.
 * @throws If a registered canvas command fails.
 */
function seedWeekendPlan(editor: JournalSeedEditor): EditorElementNode {
  editor.commands.execute("edgeless.visual.create", {
    kind: "text",
    text: "A little plan for the weekend",
    frame: { x: 60, y: 40, width: 500, height: 40 },
    fontSize: 22,
    color: "#151522",
  });
  const stages = [
    { x: 60, text: "Morning\nBirdwatching", fill: "#eeeafa" },
    { x: 360, text: "Midday\nPicnic by the lake", fill: "#edf3e9" },
    { x: 660, text: "Evening\nGames & tea", fill: "#fbf0df" },
  ].map(
    ({ x, text, fill }) =>
      editor.commands.execute("edgeless.visual.create", {
        kind: "rectangle",
        frame: { x, y: 110, width: 220, height: 100 },
        text,
        fill,
        stroke: "#b8b2d3",
      }) as EditorElementNode,
  );
  for (let index = 0; index < stages.length - 1; index += 1) {
    const x = 60 + index * 300;
    editor.commands.execute("edgeless.visual.create", {
      kind: "connector",
      source: {
        elementId: stages[index].id,
        anchor: { x: 1, y: 0.5 },
        position: { x: x + 220, y: 160 },
      },
      target: {
        elementId: stages[index + 1].id,
        anchor: { x: 0, y: 0.5 },
        position: { x: x + 300, y: 160 },
      },
      route: "straight",
      stroke: "#7568ad",
      endStyle: "arrow",
    });
  }
  editor.commands.execute("edgeless.visual.create", {
    kind: "sticker",
    text: "Leave room for a little spontaneity.",
    frame: { x: 970, y: 90, width: 180, height: 140 },
    fill: "#eeeafa",
    color: "#42308e",
  });
  return stages[0];
}

/**
 * Adds an indoor alternative to the morning walk.
 *
 * @param editor - Editor whose visual commands create the branch.
 * @param morning - The morning stage to which the weather branch attaches.
 * @returns The weather and indoor stages and their connectors have been inserted.
 * @throws If a registered canvas command fails.
 */
function seedRainPlan(editor: JournalSeedEditor, morning: EditorElementNode): void {
  const weather = editor.commands.execute("edgeless.visual.create", {
    kind: "ellipse",
    frame: { x: 60, y: 250, width: 220, height: 80 },
    text: "If it rains",
    fill: "#e9f0f6",
    stroke: "#a6bacc",
  }) as EditorElementNode;
  const indoors = editor.commands.execute("edgeless.visual.create", {
    kind: "rectangle",
    frame: { x: 360, y: 250, width: 220, height: 80 },
    text: "Nature center\nTea & bird feeders",
    fill: "#eeeafa",
    stroke: "#b8b2d3",
  }) as EditorElementNode;
  connectPlanStages(editor, morning, weather, "down");
  connectPlanStages(editor, weather, indoors, "right");
}

/**
 * Creates a separate diagram for preparing and sharing picnic food.
 *
 * @param editor - Editor whose visual commands create the diagram.
 * @returns The picnic stages, title, and connectors have been inserted.
 * @throws If a registered canvas command fails.
 */
function seedPicnicPlan(editor: JournalSeedEditor): void {
  editor.commands.execute("edgeless.visual.create", {
    kind: "text",
    text: "Picnic preparation",
    frame: { x: 1320, y: 40, width: 360, height: 40 },
    fontSize: 22,
    color: "#151522",
  });
  const stages = [
    { x: 1320, text: "The night before\nRoast vegetables", fill: "#edf3e9" },
    { x: 1600, text: "In the morning\nPack the basket", fill: "#fbf0df" },
    { x: 1880, text: "At the lake\nShare lunch", fill: "#eeeafa" },
  ].map(
    ({ x, text, fill }) =>
      editor.commands.execute("edgeless.visual.create", {
        kind: "rectangle",
        frame: { x, y: 110, width: 210, height: 100 },
        text,
        fill,
        stroke: "#b8b2d3",
      }) as EditorElementNode,
  );
  connectPlanStages(editor, stages[0], stages[1], "right");
  connectPlanStages(editor, stages[1], stages[2], "right");
  const dessert = editor.commands.execute("edgeless.visual.create", {
    kind: "ellipse",
    frame: { x: 1600, y: 250, width: 210, height: 80 },
    text: "Add berries\n& chocolate",
    fill: "#fbf0df",
    stroke: "#d4b79b",
  }) as EditorElementNode;
  connectPlanStages(editor, stages[1], dessert, "down");
}

/**
 * Connects two plan stages at their facing edges.
 *
 * @param editor - Editor whose visual command creates the connector.
 * @param source - Stage where the arrow begins.
 * @param target - Stage where the arrow ends.
 * @param direction - Whether the target lies to the right or below the source.
 * @returns The attached arrow has been inserted.
 * @throws If the registered connector command fails.
 */
function connectPlanStages(
  editor: JournalSeedEditor,
  source: EditorElementNode,
  target: EditorElementNode,
  direction: "right" | "down",
): void {
  const sourceAnchor = direction === "right" ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 };
  const targetAnchor = direction === "right" ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 };
  editor.commands.execute("edgeless.visual.create", {
    kind: "connector",
    source: {
      elementId: source.id,
      anchor: sourceAnchor,
      position: {
        x: source.frame.x + source.frame.width * sourceAnchor.x,
        y: source.frame.y + source.frame.height * sourceAnchor.y,
      },
    },
    target: {
      elementId: target.id,
      anchor: targetAnchor,
      position: {
        x: target.frame.x + target.frame.width * targetAnchor.x,
        y: target.frame.y + target.frame.height * targetAnchor.y,
      },
    },
    route: "straight",
    stroke: "#7568ad",
    endStyle: "arrow",
  });
}

/**
 * Places short reminders and captions beside the related document cards.
 *
 * @param editor - Editor whose visual commands create the notes and labels.
 * @returns The notes and labels have been inserted on the canvas.
 * @throws If a registered canvas command fails.
 */
function seedCanvasNotes(editor: JournalSeedEditor): void {
  const notes = [
    { x: 590, text: "Bring binoculars\nand take the long way home.", fill: "#f8efd8" },
    { x: 1360, text: "Save a shady spot\nfor lunch by the lake.", fill: "#e8f0e5" },
    { x: 2130, text: "Ask everyone to bring\na favorite game.", fill: "#eeeafa" },
  ];
  for (const note of notes) {
    editor.commands.execute("edgeless.visual.create", {
      kind: "sticker",
      frame: { x: note.x, y: 420, width: 185, height: 150 },
      text: note.text,
      fill: note.fill,
      color: "#38334a",
      fontSize: 16,
    });
  }
  for (const label of [
    { x: 590, text: "A quiet morning companion" },
    { x: 1360, text: "Ready for a walk" },
    { x: 2130, text: "A few ideas for later" },
  ]) {
    editor.commands.execute("edgeless.visual.create", {
      kind: "text",
      frame: { x: label.x, y: 590, width: 190, height: 48 },
      text: label.text,
      color: "#555569",
      fontSize: 14,
    });
  }
}

/** Pencil strokes for the cat and dog, in a shared 180 by 150 local canvas. */
const ANIMAL_STROKES: readonly (readonly (readonly [number, number])[])[][] = [
  [
    [
      [30, 62],
      [28, 40],
      [33, 8],
      [58, 28],
      [86, 26],
      [116, 8],
      [121, 40],
      [128, 64],
      [121, 91],
      [98, 111],
      [72, 116],
      [42, 109],
      [25, 90],
      [23, 74],
      [30, 62],
    ],
    [
      [52, 57],
      [54, 65],
    ],
    [
      [96, 57],
      [94, 65],
    ],
    [
      [67, 76],
      [75, 81],
      [83, 76],
    ],
    [
      [75, 81],
      [75, 88],
      [68, 93],
    ],
    [
      [75, 88],
      [82, 93],
    ],
    [
      [40, 76],
      [12, 70],
    ],
    [
      [40, 85],
      [10, 88],
    ],
    [
      [108, 76],
      [139, 70],
    ],
    [
      [108, 85],
      [141, 88],
    ],
  ],
  [
    [
      [43, 38],
      [58, 23],
      [87, 20],
      [111, 31],
      [120, 52],
      [120, 79],
      [110, 103],
      [88, 116],
      [61, 113],
      [40, 100],
      [33, 78],
      [34, 55],
      [43, 38],
    ],
    [
      [44, 36],
      [24, 31],
      [14, 49],
      [13, 76],
      [22, 88],
      [35, 79],
    ],
    [
      [110, 32],
      [128, 30],
      [141, 47],
      [143, 72],
      [135, 85],
      [120, 77],
    ],
    [
      [57, 59],
      [58, 66],
    ],
    [
      [97, 59],
      [96, 66],
    ],
    [
      [67, 80],
      [78, 75],
      [88, 80],
      [84, 89],
      [78, 93],
      [70, 89],
      [67, 80],
    ],
    [
      [78, 93],
      [78, 101],
      [70, 106],
    ],
    [
      [78, 101],
      [86, 106],
    ],
  ],
];

/**
 * Adds small pencil sketches of a cat and dog beside the notebook cards.
 *
 * Each animal is a group of editable pencil strokes in local coordinates.
 *
 * @param editor - Editor whose visual command creates each pencil stroke.
 * @returns Both groups of animal strokes have been inserted.
 * @throws If a registered drawing or grouping command fails.
 */
function seedAnimalDrawings(editor: JournalSeedEditor): void {
  for (const [index, strokes] of ANIMAL_STROKES.entries()) {
    const ids = strokes.map((stroke) => {
      const drawing = editor.commands.execute("edgeless.visual.create", {
        kind: "drawing",
        brush: "pencil",
        frame: { x: 590 + index * 770, y: 635, width: 180, height: 150 },
        points: stroke.map(([x, y]) => ({ x, y })),
        stroke: "#66598d",
        strokeWidth: 2,
      }) as EditorElementNode;
      return drawing.id;
    });
    editor.commands.execute("edgeless.selection.set", ids);
    editor.commands.execute("edgeless.selection.group");
  }
}
