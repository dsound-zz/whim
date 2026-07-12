/**
 * Together AI chat-completions client.
 *
 * Together exposes an OpenAI-compatible REST API, so this uses plain `fetch`
 * rather than pulling in an SDK — consistent with how the rest of the codebase
 * calls external APIs (Mapbox, Ticketmaster, Eventbrite all use raw fetch).
 *
 * Used by the LLM venue-extraction pipeline (src/lib/llmExtraction/) to parse
 * structured events out of a venue's own events page — the source tier for
 * venues that sell no tickets and so are invisible to every platform API.
 */

const TOGETHER_API_URL = 'https://api.together.xyz/v1/chat/completions';
const DEFAULT_MODEL = 'MiniMaxAI/MiniMax-M3';

export interface TogetherChatOptions {
  /** Model name. Defaults to MiniMaxAI/MiniMax-M3. */
  model?: string;
  /** System instruction for the model. */
  systemInstruction?: string;
  /** The user-turn content (page text + task instructions). */
  userContent: string;
  /** Temperature (0-2). Defaults to 0 for deterministic extraction. */
  temperature?: number;
  /** Max tokens in the response. */
  maxTokens?: number;
}

export interface TogetherChatResult {
  /** Raw text content of the model's response. */
  content: string;
}

/**
 * Sends a single chat completion request to Together AI, requesting JSON-mode
 * output. Returns the raw response text — callers are responsible for parsing
 * it as JSON (Together's json_object support varies by model, so callers
 * should be defensive rather than assume a clean parse).
 */
export async function callTogetherChat(options: TogetherChatOptions): Promise<TogetherChatResult> {
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error('TOGETHER_API_KEY environment variable is not set');
  }

  const {
    model = DEFAULT_MODEL,
    systemInstruction,
    userContent,
    temperature = 0,
    maxTokens = 4096,
  } = options;

  const messages: Array<{ role: string; content: string }> = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await fetch(TOGETHER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Together AI error: HTTP ${response.status} ${errorBody.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('Together AI response missing choices[0].message.content');
  }

  return { content };
}

/**
 * Extracts the first top-level JSON object from a model response, tolerating
 * markdown code fences (```json ... ```) that some models wrap output in
 * despite json_object mode being requested.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  return JSON.parse(candidate.trim());
}
