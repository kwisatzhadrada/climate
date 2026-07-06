import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface ImageInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateOptions {
  system: string;
  prompt: string;
  image?: ImageInput;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
  provider: "anthropic" | "openai";
  usage: TokenUsage | null;
}

/**
 * Thin provider abstraction so the rest of the app doesn't care whether we're
 * calling Anthropic, OpenAI, or an OpenAI-compatible endpoint (Grok, a local
 * Ollama server, etc. via OPENAI_BASE_URL). AI_PROVIDER picks the primary;
 * on failure we automatically retry with the other provider if configured.
 *
 * This is a low-level transport only — request-level concerns (timeouts,
 * usage/cost logging, retries) live in lib/ai/service.ts, which is the
 * entry point the rest of the app should call.
 */
export async function generateStructuredText(options: GenerateOptions): Promise<GenerateResult> {
  const primary = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
  const order = primary === "openai" ? ["openai", "anthropic"] : ["anthropic", "openai"];

  let lastError: unknown;

  for (const provider of order) {
    try {
      if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
        return await callAnthropic(options);
      }
      if (provider === "openai" && process.env.OPENAI_API_KEY) {
        return await callOpenAI(options);
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `AI generation failed on all configured providers. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

async function callAnthropic({
  system,
  prompt,
  image,
  signal,
}: GenerateOptions): Promise<GenerateResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

  const content: Anthropic.MessageParam["content"] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  }
  content.push({ type: "text", text: prompt });

  const message = await client.messages.create(
    {
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content }],
    },
    { signal }
  );

  const textBlock = message.content.find((block) => block.type === "text");
  return {
    text: textBlock && "text" in textBlock ? textBlock.text : "",
    model,
    provider: "anthropic",
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    },
  };
}

async function callOpenAI({
  system,
  prompt,
  image,
  signal,
}: GenerateOptions): Promise<GenerateResult> {
  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: "text", text: prompt }];
  if (image) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${image.mediaType};base64,${image.base64}` },
    });
  }

  const completion = await client.chat.completions.create(
    {
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
    },
    { signal }
  );

  const usage = completion.usage;

  return {
    text: completion.choices[0]?.message?.content ?? "",
    model,
    provider: "openai",
    usage: usage
      ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
      : null,
  };
}
