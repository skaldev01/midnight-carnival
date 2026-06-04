# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> The note above is load-bearing: this repo pins **Next.js 16.2.6 + React 19**. APIs and conventions differ from older Next.js. Consult `node_modules/next/dist/docs/` before writing framework code, and use the **context7** MCP server for current library docs (TipTap 3, NextAuth 4, googleapis).

## Commands

```bash
npm run dev      # dev server at http://localhost:3000
npm run build    # production build
npm run start    # serve the production build
npm run lint     # eslint (flat config, eslint.config.mjs)
```

- There is **no test runner** configured — no Jest/Vitest, no `test` script. Verify changes via `npm run lint`, `npm run build`, and manual testing in `dev`.
- `postinstall` copies `pdf.worker.min.mjs` from `pdfjs-dist` into `public/`. If PDF parsing breaks with a worker error, re-run `npm install` or copy that file manually.
- Secrets live in `.env.local` (gitignored). Copy `.env.example` and fill in `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, the Google OAuth pair, and `NEXTAUTH_SECRET`. Without Google creds, sign-in and Drive sync are disabled but the editor and AI still work.

## What this app is

Midnight Carnival is a screenwriting editor. A writer uploads a screenplay (PDF/DOCX/TXT) or types one, then collaborates with an AI (Claude or GPT) that returns **inline edit suggestions** the writer accepts or rejects. Projects persist to `localStorage` and optionally sync to the user's Google Drive.

## Architecture — the big picture

### The suggestion pipeline (the heart of the app)

Everything centers on turning AI output into safe, reviewable edits. The invariant that makes this work: **a suggestion's `oldText` must exactly match the `content` of a real screenplay element** so it can be located and replaced deterministically. The pipeline enforces this end to end:

1. **Intent classification** (`services/ai/intentClassifier.ts`, client-side) — regex-classifies a chat prompt as `edit` vs `conversational`, extracts scene/element hints, and **augments** edit prompts with an `[EDIT REQUEST]` directive. False positives are cheap (AI returns `suggestions: []`); false negatives silently drop edits, so the classifier is deliberately permissive.
2. **Request** (`hooks/useChat.ts`) routes to one of two endpoints:
   - `/api/ai` — standard chat; sends the whole script as `TYPE: content` lines.
   - `/api/ai/apply-feedback` — used when references are attached or feedback is applied; builds a **focused, numbered element table** (only candidate elements ±3 neighbours, capped) instead of the full script, because verbatim copying from a 3000-element haystack is unreliable.
3. **AI services** (`services/ai/{anthropic,openai}Service.ts`) — interchangeable modules selected by `provider` (`"claude"` | `"gpt"`). Both implement `generate(input)`, share the system prompt and JSON-envelope parser in `services/ai/types.ts`, and map provider errors to a common `AIError` (codes: `invalid_key`, `rate_limit`, `network`, `context_too_long`, `unknown`). The model is instructed to return a strict JSON envelope `{ content, suggestions[] }`; `parseAIResponse` tolerates fenced/narrated JSON and falls back to plain text.
4. **Validation** (`services/screenplay/suggestionFilter.ts`) — `buildSuggestionsFromRaw` resolves each raw `oldText` to a canonical element: exact match first, then a **fuzzy composite score** (Jaccard 60% + Levenshtein 40%, with substring shortcut) from `feedbackTransformer.ts`. Matches below `MATCH_THRESHOLD` (0.55) are dropped; accepted ones are rewritten to use the canonical content so the applier always finds them.
5. **Apply** (`services/screenplay/suggestionApplier.ts` + `hooks/useSuggestions.ts`) — accept/reject per-suggestion or in bulk. `applySuggestion` replaces the first element whose `content === oldText`. A suggestion whose target was already changed (orphaned) is auto-marked `rejected` rather than misapplied.

When changing prompt text, the JSON envelope shape, or the matching thresholds, keep all five stages consistent — they are coupled by the exact-match invariant.

### Screenplay parsing & the title-page firewall

`services/pdf/pdfParser.ts` extracts text as `col|text` lines (the leading number is the Courier-character column). `services/screenplay/screenplayParser.ts` then:
- **Splits the title page from the body** at the first scene heading (or a cinematic body-start directive like `FADE IN:`). Title-page text is parsed separately into a structured `TitlePage` and **never enters `scenes[]`** — this prevents AI suggestions from targeting title/author lines. Several downstream functions re-slice from the first `scene` element to defend this boundary.
- Runs **two parsers and picks the better**: `fountain-js` (good for clean Fountain/Fade In exports) and a **column-aware heuristic** (for real studio PDFs, using horizontal position as the primary signal with adaptive column bands). The one producing more `scene`+`character` elements wins.

A `Screenplay` is `{ id, titlePage, scenes: ScreenplayElement[] }` where each element is `{ type, content }` over six types: `scene | action | character | dialogue | parenthetical | transition`.

### State, persistence & Drive sync

- **Zustand stores** in `src/store/`. `projectStore.ts` is the source of truth, persisted to `localStorage` under `midnight-carnival.projects` with a **versioned migration chain (currently v5)** — bump the version and add a migration step whenever the `Project`/`Screenplay`/`ProjectReference` shape changes. Other stores: `chatStore` (provider selection), `feedbackStore`, `syncStatusStore`, `toastStore`.
- **`suggestions` are transient**: project-scoped, never synced to Drive, preserved locally across Drive merges. Don't treat them as durable data.
- **Drive sync** (`hooks/useDriveSync.ts` + `services/drive/driveService.ts`): mounted once in `HomeApp`. Pulls on sign-in, then **debounced (2s) push per project on content change**. The push trigger is a `contentHash` that *deliberately excludes* `cloud` and `updatedAt` — including them causes an infinite sync loop. Each project is one JSON file in a "Midnight Carnival" Drive folder, keyed by `appProperties.midnightCarnivalProjectId` (survives renames). There is legacy-layout read support (5-files-per-subfolder) that is migrated and trashed on first new-layout push — keep this until users have all re-synced.

### Auth

`lib/auth.ts` — NextAuth (JWT strategy) with Google. Uses the narrow `drive.file` scope (app only touches files it creates). Access tokens are refreshed in the `jwt` callback with a 60s buffer; the access token is surfaced on `session.accessToken` and read server-side by the Drive routes. Type augmentations are in `types/next-auth.d.ts`.

### UI layout

`app/page.tsx` → `app/home/`. `HomeApp.tsx` composes three columns — `Sidebar` (projects), `ChatPanel` (chat / feedback tabs), `ScriptPanel` (the editor). The editor (`components/ScriptEditor/`) is **TipTap 3**: paragraphs carry an `elementType` attribute, and `services/screenplay/scenesSerializer.ts` converts between `ScreenplayElement[]` and the TipTap doc in both directions. Export to PDF uses `jspdf` via `services/screenplay/pdfExporter.ts`.

## Conventions

- **Path alias `@/*` → `src/*`** (tsconfig). Use it for all internal imports.
- Server-only modules (`services/drive`, `services/ai/*Service`, `lib/auth` consumers) import `"server-only"` to fail loudly if pulled into a client bundle. API routes set `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
- Data flows **client → API route → service**. Routes do shape-validation and error mapping; services hold the logic. Adding an AI capability means touching both `anthropicService` and `openaiService` (they are kept symmetric).
- Heavy use of `console.info` with `[module]` prefixes through the suggestion pipeline — this is the intended debugging surface for "why was my edit dropped?". Preserve it when editing those files.
