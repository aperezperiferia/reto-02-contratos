import type { LlmAdapter } from "./adapter.js";
import { MockAdapter } from "./mock.js";
import { OpenAiAdapter } from "./openai.js";

export function createLlmAdapter(): LlmAdapter {
  const provider = (process.env.LLM_PROVIDER ?? "openai").toLowerCase();

  if (provider === "mock") {
    return new MockAdapter();
  }

  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return new MockAdapter();
    }
    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const baseUrl = process.env.OPENAI_BASE_URL;
    return new OpenAiAdapter({ apiKey, model, baseUrl });
  }

  throw new Error(`Proveedor LLM no soportado: ${provider}. Usa openai o mock.`);
}

export function tryCreateLlmAdapter(): LlmAdapter | null {
  try {
    return createLlmAdapter();
  } catch {
    return null;
  }
}

export function isUsingMockAdapter(adapter: LlmAdapter): boolean {
  return adapter.provider === "mock";
}
