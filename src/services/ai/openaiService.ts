import "server-only";

import OpenAI, { APIError } from "openai";
import {
  AIError,
  buildSystemPrompt,
  parseAIResponse,
  type GenerateInput,
  type GenerateResult,
} from "./types";
import {
  buildFeedbackSystemPrompt,
  parseFeedbackResponse,
  type AIFeedbackResult,
} from "./feedbackTypes";

const DEFAULT_MODEL = "gpt-4o";
const MAX_TOKENS = 2048;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AIError(
      "invalid_key",
      "OPENAI_API_KEY is not configured on the server.",
      401
    );
  }
  client = new OpenAI({ apiKey });
  return client;
}

export async function generate(
  input: GenerateInput
): Promise<GenerateResult> {
  const openai = getClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const system = buildSystemPrompt(input.instructions, input.script);

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: input.prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      throw new AIError(
        "unknown",
        "OpenAI returned an empty response.",
        502
      );
    }
    return parseAIResponse(raw, "gpt");
  } catch (err) {
    throw mapOpenAIError(err);
  }
}

export async function generateFeedback(
  input: GenerateInput
): Promise<AIFeedbackResult> {
  const openai = getClient();
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const system = buildFeedbackSystemPrompt(input.instructions, input.script);

  try {
    const completion = await openai.chat.completions.create({
      model,
      max_tokens: MAX_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: input.prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!raw) {
      throw new AIError(
        "unknown",
        "OpenAI returned an empty response.",
        502
      );
    }
    return parseFeedbackResponse(raw, "gpt");
  } catch (err) {
    throw mapOpenAIError(err);
  }
}

function mapOpenAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;

  if (err instanceof APIError) {
    const status = err.status ?? 500;
    if (status === 401) {
      return new AIError("invalid_key", "OpenAI API key is invalid.", 401);
    }
    if (status === 429) {
      return new AIError(
        "rate_limit",
        "OpenAI rate limit reached. Try again in a moment.",
        429
      );
    }
    if (status === 413 || /context length|too long/i.test(err.message ?? "")) {
      return new AIError(
        "context_too_long",
        "Script is too long for the model's context window. Try a shorter script or different model.",
        413
      );
    }
    return new AIError(
      "unknown",
      err.message || "OpenAI request failed.",
      status >= 400 ? status : 502
    );
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      /fetch failed|enotfound|econnrefused|network|getaddrinfo/i.test(msg)
    ) {
      return new AIError(
        "network",
        "Could not reach OpenAI. Check your network connection.",
        502
      );
    }
    return new AIError("unknown", err.message, 500);
  }

  return new AIError("unknown", "Unknown OpenAI error.", 500);
}
