"use client";

import { Fragment } from "react";
import { useCurrentProject } from "@/hooks/useProjects";
import { useSuggestions } from "@/hooks/useSuggestions";
import type { ScreenplayElement } from "@/types/screenplay";
import type { Suggestion } from "@/types/suggestion";
import { CheckIcon, CloseIcon } from "../icons";

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
        <div
          key={key}
          className="scene-heading"
          style={{ textAlign: "right" }}
        >
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
          <div className="dialogue">{el.content}</div>
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

type InlineProps = {
  suggestion: Suggestion;
  onAccept: () => void;
  onReject: () => void;
};

function InlineSuggestion({ suggestion, onAccept, onReject }: InlineProps) {
  const source =
    suggestion.source === "claude"
      ? "Claude"
      : suggestion.source === "gpt"
        ? "ChatGPT"
        : "AI";
  return (
    <div className="suggestion-block">
      <div className="suggestion-meta">
        <span className="suggestion-tag">AI Suggestion · Rewrite</span>
        <span className="suggestion-source">{source}</span>
      </div>
      <div className="action suggestion-content">
        <span className="deletion">{suggestion.oldText}</span>
        <span className="insertion">{suggestion.newText}</span>
      </div>
      <div className="suggestion-actions">
        <button
          type="button"
          className="action-btn reject"
          onClick={onReject}
        >
          <CloseIcon width={11} height={11} />
          Reject
        </button>
        <button
          type="button"
          className="action-btn accept"
          onClick={onAccept}
        >
          <CheckIcon width={11} height={11} />
          Accept
        </button>
      </div>
    </div>
  );
}

export default function SuggestionReview() {
  const project = useCurrentProject();
  const { pending, accept, reject } = useSuggestions();

  if (!project?.script) return null;

  // First-match wins: each element gets at most one inline suggestion.
  // (If multiple pending suggestions share the same oldText, the rest
  // stay pending in the store and would surface again after the first
  // resolves.)
  const usedSuggestionIds = new Set<string>();

  return (
    <div className="script-page">
      <div className="page-number">1.</div>
      {project.script.scenes.map((el, idx) => {
        const match = pending.find(
          (s) => s.oldText === el.content && !usedSuggestionIds.has(s.id)
        );
        if (match) {
          usedSuggestionIds.add(match.id);
          return (
            <Fragment key={`s-${match.id}`}>
              <InlineSuggestion
                suggestion={match}
                onAccept={() => accept(match.id)}
                onReject={() => reject(match.id)}
              />
            </Fragment>
          );
        }
        return renderElement(el, `el-${idx}`);
      })}
    </div>
  );
}
