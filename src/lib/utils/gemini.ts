/**
 * Shared Gemini SDK factory.
 *
 * Standardizes LLM access across the codebase. Previously categorizeEvent.ts
 * used the raw REST API (targeting gemini-2.0-flash) while verifyEventIntegrity.ts
 * used the @google/generative-ai SDK (targeting gemini-2.5-flash).
 *
 * This factory ensures consistent model version, temperature, and error handling.
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';

// Singleton client instance
let geminiClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

export interface GeminiModelOptions {
  /** Model name. Defaults to 'gemini-2.5-flash'. */
  model?: string;
  /** System instruction for the model. */
  systemInstruction?: string;
  /** Temperature (0-2). Defaults to 0 for deterministic output. */
  temperature?: number;
  /** Response MIME type. Defaults to 'application/json'. */
  responseMimeType?: string;
  /** Optional response schema for constrained JSON output. */
  responseSchema?: object;
}

/**
 * Returns a configured GenerativeModel instance from the Gemini SDK.
 */
export function getGeminiModel(options: GeminiModelOptions = {}): GenerativeModel {
  const {
    model = 'gemini-2.5-flash',
    systemInstruction,
    temperature = 0,
    responseMimeType = 'application/json',
    responseSchema,
  } = options;

  const client = getClient();

  const generationConfig: Record<string, unknown> = {
    temperature,
    responseMimeType,
  };

  if (responseSchema) {
    generationConfig.responseSchema = responseSchema;
  }

  return client.getGenerativeModel({
    model,
    systemInstruction,
    generationConfig,
  });
}
