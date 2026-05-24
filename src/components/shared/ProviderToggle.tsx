"use client";

import type { Provider } from "@/types/chat";

export type { Provider };

type Props = {
  value: Provider;
  onChange: (provider: Provider) => void;
};

const options: { id: Provider; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "gpt", label: "ChatGPT" },
];

export default function ProviderToggle({ value, onChange }: Props) {
  return (
    <div className="provider-toggle">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`provider${value === opt.id ? " active" : ""}`}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
