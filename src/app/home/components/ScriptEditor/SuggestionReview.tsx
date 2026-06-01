"use client";

import { Fragment } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import type { SuggestionNavigatorHandle } from "@/hooks/useSuggestionNavigator";
import type { ScreenplayElement } from "@/types/screenplay";
import type { Suggestion } from "@/types/suggestion";
import { CheckIcon, CloseIcon } from "../icons";

// ─────────────────────────────────────────────────────────────────────────────
// Static element renderer
// ─────────────────────────────────────────────────────────────────────────────

function renderElement(el: ScreenplayElement, key: string) {
  switch (el.type) {
    case "scene":
      return (
        <div key={key} className="scene-heading">
          {el.content}
        </div>
      );
    case "action":
      return (
        <div key={key} className="action">
          {el.content}
        </div>
      );
    case "transition":
      return (
        <div key={key} className="scene-heading" style={{ textAlign: "right" }}>
          {el.content}
        </div>
      );
    case "character":
      return (
        <div key={key} className="dialogue-block">
          <div className="character">{el.content}</div>
        </div>
      );
    case "parenthetical":
      return (
        <div key={key} className="dialogue-block">
          <div className="parenthetical">{el.content}</div>
        </div>
      );
    case "dialogue":
      return (
        <div key={key} className="dialogue-block">
          <div className="dialogue">{el.content}</div>
        </div>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline suggestion block
// ─────────────────────────────────────────────────────────────────────────────

type InlineProps = {
  suggestion: Suggestion;
  isFocused: boolean;
  onAccept: () => void;
  onReject: () => void;
};

function InlineSuggestion({ suggestion, isFocused, onAccept, onReject }: InlineProps) {
  const source =
    suggestion.source === "claude"
      ? "Claude"
      : suggestion.source === "gpt"
        ? "ChatGPT"
        : "AI";

  return (
    <div
      className={`suggestion-block${isFocused ? " suggestion-block--focused" : ""}`}
      data-suggestion-id={suggestion.id}
    >
      <div className="suggestion-meta">
        <span className="suggestion-tag">AI Suggestion · Rewrite</span>
        <span className="suggestion-source">{source}</span>
      </div>
      <div className="action suggestion-content">
        <span className="deletion">{suggestion.oldText}</span>
        <span className="insertion">{suggestion.newText}</span>
      </div>
      <div className="suggestion-actions">
        <button type="button" className="action-btn reject" onClick={onReject}>
          <CloseIcon width={11} height={11} />
          Reject
        </button>
        <button type="button" className="action-btn accept" onClick={onAccept}>
          <CheckIcon width={11} height={11} />
          Accept
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SuggestionReview
// nav is owned by ScriptPanel so the navigator pill can live outside the
// overflow scroll container where sticky positioning works correctly.
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  pending: Suggestion[];
  nav: SuggestionNavigatorHandle;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
};

export default function SuggestionReview({ pending, nav, onAccept, onReject }: Props) {
  const project = useCurrentProject();

  if (!project?.script) return null;

  const titlePage = project.script.titlePage;
  const usedSuggestionIds = new Set<string>();

  return (
    <>
      {titlePage && (
        <div className="script-page title-page-readonly">
          <div className="title-page-label">Title Page</div>
          {titlePage.title && (
            <div className="title-page-ro-title">{titlePage.title}</div>
          )}
          <div className="title-page-written-by">Written by</div>
          {titlePage.authors.map((a, i) => (
            <div key={i} className="title-page-ro-author">{a}</div>
          ))}
          {titlePage.draft && (
            <div className="title-page-ro-draft">{titlePage.draft}</div>
          )}
          {titlePage.contact && (
            <div className="title-page-ro-contact">{titlePage.contact}</div>
          )}
        </div>
      )}

      <div className="script-page">
        <div className="page-number">1.</div>
        {project.script.scenes.map((el, idx) => {
          const match = pending.find(
            (s) => s.oldText === el.content && !usedSuggestionIds.has(s.id)
          );
          if (match) {
            usedSuggestionIds.add(match.id);
            const isFocused = nav.focusedId === match.id;
            return (
              <Fragment key={`s-${match.id}`}>
                <InlineSuggestion
                  suggestion={match}
                  isFocused={isFocused}
                  onAccept={() => {
                    nav.jumpAfterResolve(match.id, "next");
                    onAccept(match.id);
                  }}
                  onReject={() => {
                    nav.jumpAfterResolve(match.id, "next");
                    onReject(match.id);
                  }}
                />
              </Fragment>
            );
          }
          return renderElement(el, `el-${idx}`);
        })}
      </div>
    </>
  );
}
