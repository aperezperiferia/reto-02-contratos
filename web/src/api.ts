export type ToolCallView = {
  name: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
  ok: boolean;
};

export type ConfirmationPending = {
  mensaje_id: string;
  campos: string[];
  clasificacion: string;
  comercial?: string;
};

export type ChatResponse = {
  sessionId: string;
  reply: string;
  toolCalls: ToolCallView[];
  needsConfirmation: boolean;
  confirmation?: ConfirmationPending;
};

export type HealthResponse = {
  ok: boolean;
  provider: string;
  model: string;
  llmReady: boolean;
  mock?: boolean;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error("Health check failed");
  return res.json() as Promise<HealthResponse>;
}

export type SessionView = {
  id: string;
  entries: Array<{
    role: "user" | "assistant";
    content: string;
    toolCalls?: ToolCallView[];
  }>;
  pendingConfirmation?: ConfirmationPending;
};

export async function fetchSession(sessionId: string): Promise<SessionView | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("No se pudo cargar la sesión");
  const data = (await res.json()) as { ok: boolean; session: SessionView };
  return data.session;
}

export async function resetOutDirectory(): Promise<void> {
  const res = await fetch("/api/demo/reset-out", { method: "POST" });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok) throw new Error(data.error ?? "Reset falló");
}

export async function sendChatMessage(
  message: string,
  sessionId: string | null,
): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId: sessionId ?? undefined }),
  });
  const data = (await res.json()) as ChatResponse & { error?: string; ok?: boolean };
  if (!res.ok) {
    throw new Error(data.error ?? `Error HTTP ${res.status}`);
  }
  return data;
}
