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
  const set = useCallback(
    <K extends keyof TitlePage>(key: K, value: TitlePage[K]) => {
      onChange({ ...titlePage, [key]: value });
    },
    [titlePage, onChange]
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
          value={titlePage.title}
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
          value={titlePage.authors.join("\n")}
          onChange={(e) => setAuthors(e.target.value)}
          placeholder="Author Name"
          rows={titlePage.authors.length > 1 ? titlePage.authors.length + 1 : 2}
          aria-label="Authors"
          spellCheck
        />
      </div>

      <div className="title-page-field">
        <input
          className="title-page-input title-page-draft-input"
          type="text"
          value={titlePage.draft}
          onChange={(e) => set("draft", e.target.value)}
          placeholder="Draft information (optional)"
          aria-label="Draft"
        />
      </div>

      <div className="title-page-contact-section">
        <textarea
          className="title-page-input title-page-contact-input"
          value={titlePage.contact}
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
