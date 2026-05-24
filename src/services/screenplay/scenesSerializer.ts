import type { JSONContent } from "@tiptap/core";
import type {
  ScreenplayElement,
  ScreenplayElementType,
} from "@/types/screenplay";

const VALID_TYPES: ScreenplayElementType[] = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "transition",
];

function isValidType(t: unknown): t is ScreenplayElementType {
  return typeof t === "string" && VALID_TYPES.includes(t as ScreenplayElementType);
}

/**
 * Convert stored screenplay elements into a Tiptap document. Each element
 * becomes a paragraph carrying an `elementType` attribute (rendered as
 * `data-element="..."`). An empty content array is omitted so Tiptap treats
 * the paragraph as truly empty.
 */
export function scenesToTiptapDoc(scenes: ScreenplayElement[]): JSONContent {
  const content: JSONContent[] =
    scenes.length > 0
      ? scenes.map(toParagraph)
      : [{ type: "paragraph", attrs: { elementType: "action" } }];

  return { type: "doc", content };
}

function toParagraph(el: ScreenplayElement): JSONContent {
  const node: JSONContent = {
    type: "paragraph",
    attrs: { elementType: el.type },
  };
  if (el.content) {
    node.content = [{ type: "text", text: el.content }];
  }
  return node;
}

/**
 * Walk the Tiptap doc and emit the canonical ScreenplayElement[] shape.
 * Non-paragraph nodes are skipped (we only allow paragraphs in the
 * schema-effective sense). Inline marks/hard-breaks collapse to text.
 */
export function tiptapDocToScenes(doc: JSONContent): ScreenplayElement[] {
  const out: ScreenplayElement[] = [];
  for (const node of doc.content ?? []) {
    if (node.type !== "paragraph") continue;
    const type = isValidType(node.attrs?.elementType)
      ? (node.attrs!.elementType as ScreenplayElementType)
      : "action";
    out.push({ type, content: extractText(node) });
  }
  return out;
}

function extractText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (!node.content) return "";
  return node.content.map(extractText).join("");
}
