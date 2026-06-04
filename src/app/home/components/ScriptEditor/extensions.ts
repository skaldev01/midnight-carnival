import { Extension } from "@tiptap/core";
import type { ScreenplayElementType } from "@/types/screenplay";

// Cycle order matches the format bar visual order.
const CYCLE_ORDER: ScreenplayElementType[] = [
  "scene",
  "action",
  "character",
  "parenthetical",
  "dialogue",
  "transition",
];

function currentType(state: {
  selection: { $from: { parent: { attrs: Record<string, unknown> } } };
}): ScreenplayElementType {
  const t = state.selection.$from.parent.attrs.elementType;
  return typeof t === "string" ? (t as ScreenplayElementType) : "action";
}

function cycle(from: ScreenplayElementType, dir: 1 | -1): ScreenplayElementType {
  const idx = CYCLE_ORDER.indexOf(from);
  const start = idx >= 0 ? idx : 0;
  const len = CYCLE_ORDER.length;
  return CYCLE_ORDER[(start + dir + len) % len];
}

// Auto-flow when the user hits Enter: which element type comes next?
function nextOnEnter(from: ScreenplayElementType): ScreenplayElementType {
  switch (from) {
    case "scene":
      return "action";
    case "character":
      return "dialogue";
    case "parenthetical":
      return "dialogue";
    case "dialogue":
      return "action";
    case "transition":
      return "scene";
    default:
      return "action";
  }
}

/**
 * Adds an `elementType` global attribute to every paragraph, plus the
 * screenplay-specific keyboard shortcuts (Tab cycle, Enter transitions).
 * Designed to be composed with @tiptap/starter-kit.
 */
export const ScreenplayElement = Extension.create({
  name: "screenplayElement",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          elementType: {
            default: "action" as ScreenplayElementType,
            parseHTML: (el: HTMLElement) =>
              el.getAttribute("data-element") || "action",
            renderHTML: (attrs: { elementType?: string }) => {
              if (!attrs.elementType) return {};
              return { "data-element": attrs.elementType };
            },
          },
          // Marks an element that starts a new page in the source PDF.
          // Rendered as a visual page break (see globals.css).
          pageBreakBefore: {
            default: false,
            parseHTML: (el: HTMLElement) =>
              el.getAttribute("data-page-break") === "true",
            renderHTML: (attrs: { pageBreakBefore?: boolean }) => {
              if (!attrs.pageBreakBefore) return {};
              return { "data-page-break": "true" };
            },
          },
        },
      },
    ];
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const next = cycle(currentType(editor.state), 1);
        return editor
          .chain()
          .focus()
          .updateAttributes("paragraph", { elementType: next })
          .run();
      },
      "Shift-Tab": ({ editor }) => {
        const prev = cycle(currentType(editor.state), -1);
        return editor
          .chain()
          .focus()
          .updateAttributes("paragraph", { elementType: prev })
          .run();
      },
      Enter: ({ editor }) => {
        const next = nextOnEnter(currentType(editor.state));
        return editor
          .chain()
          .splitBlock()
          .updateAttributes("paragraph", { elementType: next })
          .run();
      },
    };
  },
});
