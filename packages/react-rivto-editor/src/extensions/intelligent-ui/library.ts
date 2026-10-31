/**
 * Intelligent UI component library adapted from
 * https://github.com/thesysdev/open-intelligent-ui (MIT).
 *
 * The model, or a person, writes an OpenUI Lang 1.0 program. This library is
 * the set of primitives the renderer runs in the page. Street maps are omitted
 * because they need a map runtime and a routing server. Photo lookup uses the
 * public Wikipedia APIs directly.
 *
 * @module
 */
import { createLibrary } from "@openuidev/react-lang";
import { actions } from "./vendor/actions";
import { Chart } from "./vendor/components/chart";
import {
  Button,
  Checkbox,
  DatePicker,
  IconButton,
  Input,
  Pressable,
  RadioGroup,
  SegmentedControl,
  Select,
  Slider,
  TextArea,
  Timer,
} from "./vendor/components/controls";
import {
  Carousel,
  Celebration,
  Code,
  Flashcard,
  MathBlock,
  Popover,
  Quote,
  YouTube,
} from "./vendor/components/extra";
import { HtmlView } from "./vendor/components/html-view";
import { Box, Card, Col, Divider, Form, Grid, Row, Spacer } from "./vendor/components/layout";
import { Icon, Image, SearchImage } from "./vendor/components/media";
import { svgComponents } from "./vendor/components/svg";
import { Table } from "./vendor/components/table";
import {
  Badge,
  Caption,
  Label,
  Link,
  List,
  ListItem,
  Markdown,
  Text,
  Title,
} from "./vendor/components/text";
import { functions } from "./vendor/functions";

const components = [
  Col,
  Row,
  Box,
  Grid,
  Card,
  Carousel,
  Popover,
  Divider,
  Spacer,
  Title,
  Text,
  Caption,
  Label,
  Badge,
  Link,
  List,
  ListItem,
  Markdown,
  Quote,
  Code,
  MathBlock,
  Button,
  IconButton,
  Pressable,
  Input,
  TextArea,
  Select,
  SegmentedControl,
  Slider,
  Checkbox,
  RadioGroup,
  DatePicker,
  Timer,
  Form,
  SearchImage,
  Image,
  Icon,
  Table,
  Chart,
  YouTube,
  Flashcard,
  Celebration,
  ...svgComponents,
  HtmlView,
];

const componentGroups = [
  {
    name: "Layout",
    components: ["Col", "Row", "Box", "Grid", "Card", "Carousel", "Popover", "Divider", "Spacer"],
    notes: [
      '- gap and padding count 4px steps. Length is px or a CSS length like "50%". Radius is "sm", "md", "lg", "xl", "full" or px.',
      '- Color is "ink", "muted", "faint", "surface", "info", "success", "warning", "danger", "purple", "pink", "chart1" to "chart6", or a CSS color. As a background, status colors are soft tints.',
    ],
  },
  {
    name: "Text",
    components: [
      "Title",
      "Text",
      "Caption",
      "Label",
      "Badge",
      "Link",
      "List",
      "ListItem",
      "Markdown",
      "Quote",
      "Code",
      "Math",
    ],
  },
  {
    name: "Inputs",
    components: [
      "Button",
      "IconButton",
      "Pressable",
      "Input",
      "TextArea",
      "Select",
      "SegmentedControl",
      "Slider",
      "Checkbox",
      "RadioGroup",
      "DatePicker",
      "Timer",
      "Form",
    ],
    notes: [
      "- An input's first argument is its value, usually a $variable that other statements read.",
      '- Every input either changes something shown on the page, or sits in a Form whose submit Button sends a short first-person @ToAssistant ("Help me choose a bike"); the form values go with it. No dead inputs.',
    ],
  },
  {
    name: "Media and data",
    components: ["SearchImage", "Image", "Icon", "Table", "Chart", "YouTube"],
  },
  { name: "Play", components: ["Flashcard", "Celebration"] },
  {
    name: "Drawing",
    components: [
      "Svg",
      "G",
      "Circle",
      "Ellipse",
      "Rect",
      "Line",
      "Path",
      "Polyline",
      "Polygon",
      "SvgText",
      "HtmlView",
    ],
  },
];

/**
 * Component library used to run Intelligent UI programs inside a block.
 *
 * Layout is not fixed here. `$variables`, `@functions`, and actions run in the
 * renderer after the program is stored, without another model call. `HtmlView`
 * runs a sandboxed HTML page for a game or canvas that needs its own script.
 */
export const intelligentUiLibrary = createLibrary({
  root: "Col",
  components,
  functions,
  actions,
  componentGroups,
});
