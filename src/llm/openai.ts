import type { LlmAdapter, LlmMessage, LlmResponse, LlmToolSpec } from "./adapter.js";

type OpenAiMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAiMessages(mensajes: LlmMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [];
  for (const m of mensajes) {
    if (m.role === "tool") {
      out.push({
        role: "tool",
        tool_call_id: m.toolCallId ?? "",
        content: m.content,
      });
      continue;
    }
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      out.push({
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

export class OpenAiAdapter implements LlmAdapter {
  readonly provider = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: { apiKey: string; model: string; baseUrl?: string }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async enviar(mensajes: LlmMessage[], herramientas: LlmToolSpec[]): Promise<LlmResponse> {
    const tools = herramientas.map((h) => ({
      type: "function" as const,
      function: {
        name: h.name,
        description: h.description,
        parameters: h.parameters,
      },
    }));

    const controller = new AbortController();
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? 90_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: toOpenAiMessages(mensajes),
          tools: tools.length ? tools : undefined,
          tool_choice: tools.length ? "auto" : undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 400)}`);
      }

      const json = (await res.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
      };

      const message = json.choices[0]?.message;
      if (!message) {
        throw new Error("OpenAI devolvió una respuesta vacía");
      }

      return {
        content: message.content,
        toolCalls: message.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments,
        })),
      };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Timeout del proveedor LLM (${timeoutMs}ms)`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
