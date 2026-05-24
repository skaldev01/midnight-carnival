import { NextResponse } from "next/server";
import * as openaiService from "@/services/ai/openaiService";
import * as anthropicService from "@/services/ai/anthropicService";
import { AIError } from "@/services/ai/types";
import type { Provider } from "@/types/chat";
import type { Screenplay } from "@/types/screenplay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  provider?: unknown;
  prompt?: unknown;
  script?: unknown;
  instructions?: unknown;
};

function isProvider(v: unknown): v is Provider {
  return v === "claude" || v === "gpt";
}

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body.", code: "bad_request" },
      { status: 400 }
    );
  }

  const provider = body.provider;
  const prompt = body.prompt;

  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json(
      { error: "Missing or empty prompt.", code: "bad_request" },
      { status: 400 }
    );
  }
  if (!isProvider(provider)) {
    return NextResponse.json(
      { error: "Provider must be 'claude' or 'gpt'.", code: "bad_request" },
      { status: 400 }
    );
  }

  const script = (body.script ?? null) as Screenplay | null;
  const instructions =
    typeof body.instructions === "string" ? body.instructions : "";

  const service = provider === "claude" ? anthropicService : openaiService;

  try {
    const result = await service.generate({ prompt, script, instructions });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status }
      );
    }
    console.error("[/api/ai] unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json(
      { error: message, code: "unknown" },
      { status: 500 }
    );
  }
}
