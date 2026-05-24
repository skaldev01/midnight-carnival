"use client";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { GoogleGIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SignInOverlay({ open, onClose }: Props) {
  const { status } = useSession();

  // Auto-close once the user is signed in.
  useEffect(() => {
    if (open && status === "authenticated") onClose();
  }, [open, status, onClose]);

  const handleSignIn = () => {
    signIn("google");
  };

  return (
    <div
      className={`signin-overlay${open ? " active" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="signin-card">
        <div className="signin-mark">M</div>
        <div className="signin-title">Welcome to Midnight Carnival</div>
        <div className="signin-subtitle">
          Sign in with Google to save your projects to your Drive and access them
          from any computer.
        </div>
        <button
          type="button"
          className="google-signin-btn"
          onClick={handleSignIn}
          disabled={status === "loading"}
        >
          <GoogleGIcon className="google-g" />
          {status === "loading" ? "Loading…" : "Sign in with Google"}
        </button>
        <div className="signin-permissions">
          The app will create a &quot;Midnight Carnival&quot; folder in your Drive. It
          only reads and writes inside that folder — nothing else.
        </div>
      </div>
    </div>
  );
}
