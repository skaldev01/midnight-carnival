"use client";

import { useCallback } from "react";
import type { TitlePage } from "@/types/screenplay";

type Props = {
  titlePage: TitlePage;
  onChange: (updated: TitlePage) => void;
};

/**
 * Inline editor for screenplay title page fields.
 * Rendered above page 1 inside the script scroll area.
 * Uses the existing .script-page surface so it looks like a separate page.
 */
export default function TitlePageEditor({ titlePage, onChange }: Props) {
  // Older/persisted projects may carry a partial title page (e.g. missing
  // `authors`). Coalesce every field to a safe default so the editor can't
  // crash on `.join`/`.length` against undefined.
  const tp: TitlePage = {
    title: titlePage?.title ?? "",
    authors: titlePage?.authors ?? [],
    contact: titlePage?.contact ?? "",
    draft: titlePage?.draft ?? "",
    extra: titlePage?.extra ?? [],
  };

  const set = useCallback(
    <K extends keyof TitlePage>(key: K, value: TitlePage[K]) => {
      onChange({ ...tp, [key]: value });
    },
    [tp, onChange]
  );

  const setAuthors = useCallback(
    (raw: string) => {
      // Authors textarea: one name per line.
      set("authors", raw.split("\n").map((l) => l.trim()).filter(Boolean));
    },
    [set]
  );

  return (
    <div className="script-page title-page-editor" aria-label="Title page">
      <div className="title-page-label">Title Page</div>

      <div className="title-page-field title-page-field--title">
        <textarea
          className="title-page-input title-page-title-input"
          value={tp.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="SCREENPLAY TITLE"
          rows={2}
          aria-label="Title"
          spellCheck
        />
      </div>

      <div className="title-page-written-by">Written by</div>

      <div className="title-page-field">
        <textarea
          className="title-page-input"
          value={tp.authors.join("\n")}
          onChange={(e) => setAuthors(e.target.value)}
          placeholder="Author Name"
          rows={tp.authors.length > 1 ? tp.authors.length + 1 : 2}
          aria-label="Authors"
          spellCheck
        />
      </div>

      <div className="title-page-field">
        <input
          className="title-page-input title-page-draft-input"
          type="text"
          value={tp.draft}
          onChange={(e) => set("draft", e.target.value)}
          placeholder="Draft information (optional)"
          aria-label="Draft"
        />
      </div>

      <div className="title-page-contact-section">
        <textarea
          className="title-page-input title-page-contact-input"
          value={tp.contact}
          onChange={(e) => set("contact", e.target.value)}
          placeholder={"Contact information (optional)\nname@example.com"}
          rows={3}
          aria-label="Contact"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
