/** Mensaje del ciclo del agente (implementación concreta en el proveedor elegido). */
export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
};

export type LlmToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmResponse = {
  content: string | null;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
};

export interface LlmAdapter {
  readonly provider: string;
  readonly model: string;
  enviar(mensajes: LlmMessage[], herramientas: LlmToolSpec[]): Promise<LlmResponse>;
}
