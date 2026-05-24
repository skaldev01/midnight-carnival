"use client";

import { CheckIcon, CloseIcon } from "./icons";

export type SuggestionStatus = "pending" | "accepted" | "rejected";

type Props = {
  tag: string;
  source: string;
  deletion: string;
  insertion: string;
  status: SuggestionStatus;
  onAccept: () => void;
  onReject: () => void;
};

export default function SuggestionBlock({
  tag,
  source,
  deletion,
  insertion,
  status,
  onAccept,
  onReject,
}: Props) {
  if (status === "accepted") {
    return <div className="action accepted-fade">{insertion}</div>;
  }
  if (status === "rejected") {
    return <div className="action accepted-fade">{deletion}</div>;
  }

  return (
    <div className="suggestion-block">
      <div className="suggestion-meta">
        <span className="suggestion-tag">{tag}</span>
        <span className="suggestion-source">{source}</span>
      </div>
      <div className="action suggestion-content">
        <span className="deletion">{deletion}</span>
        <span className="insertion">{insertion}</span>
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
