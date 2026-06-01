import "server-only";

import Anthropic, {
  APIError,
  AuthenticationError,
  RateLimitError,
} from "@anthropic-ai/sdk";
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

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AIError(
      "invalid_key",
      "ANTHROPIC_API_KEY is not configured on the server.",
      401
    );
  }
  client = new Anthropic({ apiKey });
  return client;
}

export async function generate(
  input: GenerateInput
): Promise<GenerateResult> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const system = input._systemPromptOverride ?? buildSystemPrompt(input.instructions, input.script, input.references);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: input.prompt }],
    });

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    if (!raw) {
      throw new AIError(
        "unknown",
        "Anthropic returned an empty response.",
        502
      );
    }
    return parseAIResponse(raw, "claude");
  } catch (err) {
    throw mapAnthropicError(err);
  }
}

export async function generateFeedback(
  input: GenerateInput
): Promise<AIFeedbackResult> {
  const anthropic = getClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const system = buildFeedbackSystemPrompt(input.instructions, input.script);

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: input.prompt }],
    });

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    if (!raw) {
      throw new AIError(
        "unknown",
        "Anthropic returned an empty response.",
        502
      );
    }
    return parseFeedbackResponse(raw, "claude");
  } catch (err) {
    throw mapAnthropicError(err);
  }
}

function mapAnthropicError(err: unknown): AIError {
  if (err instanceof AIError) return err;

  if (err instanceof AuthenticationError) {
    return new AIError("invalid_key", "Anthropic API key is invalid.", 401);
  }
  if (err instanceof RateLimitError) {
    return new AIError(
      "rate_limit",
      "Anthropic rate limit reached. Try again in a moment.",
      429
    );
  }
  if (err instanceof APIError) {
    const status = err.status ?? 500;
    if (/context|too long|token/i.test(err.message ?? "")) {
      return new AIError(
        "context_too_long",
        "Script is too long for the model's context window. Try a shorter script or different model.",
        413
      );
    }
    return new AIError(
      "unknown",
      err.message || "Anthropic request failed.",
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
        "Could not reach Anthropic. Check your network connection.",
        502
      );
    }
    return new AIError("unknown", err.message, 500);
  }

  return new AIError("unknown", "Unknown Anthropic error.", 500);
}
