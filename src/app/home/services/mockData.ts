// Seed data used by the project store to bootstrap the demo "Midnight
// Carnival" project on first load. Nothing here is rendered directly in
// the UI — once seeded into a real project, the content lives in the
// Zustand store like any other.

export type ScriptItem =
  | { kind: "scene"; text: string }
  | { kind: "action"; text: string; faded?: boolean }
  | { kind: "dialogue"; character: string; line: string; faded?: boolean }
  | {
      kind: "suggestion";
      id: string;
      tag: string;
      source: string;
      deletion: string;
      insertion: string;
    };

export const scriptItems: ScriptItem[] = [
  { kind: "scene", text: "1   INT. GROUP HOME - KITCHEN - MORNING" },
  {
    kind: "action",
    text: "A long table buckles under mismatched chairs. The wall clock crawls past 7:14. A chore chart curls at the corner.",
  },
  {
    kind: "action",
    text: 'MALIK "JUNE" BENNET, 17, skinny and bright, drums his knuckles against the formica and slurps the last of his cereal. He clocks the doorway before YOSEF, 20, Black, lean and tightly wound, ducks through it.',
  },
  { kind: "dialogue", character: "JUNE", line: "There he go." },
  { kind: "dialogue", character: "YOSEF", line: "Morning to you too." },
  { kind: "dialogue", character: "JUNE", line: "I been waiting." },
  { kind: "dialogue", character: "YOSEF", line: "For what?" },
  {
    kind: "dialogue",
    character: "JUNE",
    line: "For somebody smart enough to save me from that back page.",
  },
  { kind: "dialogue", character: "YOSEF", line: "Math." },
  { kind: "dialogue", character: "JUNE", line: "That sheet evil." },
  {
    kind: "suggestion",
    id: "suggestion-1",
    tag: "AI Suggestion · Action line",
    source: "Claude",
    deletion:
      "Yosef drops into the chair across from him and pulls the worksheet toward his bowl. He squints down at it.",
    insertion:
      "Yosef takes the chair across from him without ceremony, drags the worksheet over, and squints down at it like it owes him an answer.",
  },
  {
    kind: "dialogue",
    character: "YOSEF",
    line: "Class started. Sit up. Pencil up. Look out that window one more time and you fail.",
  },
  { kind: "action", text: "June barks a laugh." },
  { kind: "dialogue", character: "JUNE", line: "You always doing too much." },
  {
    kind: "dialogue",
    character: "YOSEF",
    line: "And you always need a miracle before first bell.",
  },
  {
    kind: "action",
    text: "He taps the first problem with the spoon handle. He lifts his chin.",
    faded: true,
  },
  {
    kind: "dialogue",
    character: "YOSEF",
    line: "What's nine times six?",
    faded: true,
  },
];
