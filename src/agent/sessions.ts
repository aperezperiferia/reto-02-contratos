import type { ExecutedToolCall } from "../tools/registry.js";

export type ConfirmationPending = {
  mensaje_id: string;
  campos: string[];
  clasificacion: string;
  comercial?: string;
};

export type ChatTurnToolCall = {
  name: string;
  arguments: Record<string, unknown>;
  resultSummary: string;
  ok: boolean;
};

export type SessionEntry =
  | { role: "user"; content: string; at: string }
  | {
      role: "assistant";
      content: string;
      at: string;
      toolCalls?: ChatTurnToolCall[];
    };

export type Session = {
  id: string;
  createdAt: string;
  updatedAt: string;
  entries: SessionEntry[];
  llmHistory: Array<{
    role: "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
    toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  }>;
  pendingConfirmation?: ConfirmationPending;
  estimatedTokens: number;
};

const sessions = new Map<string, Session>();

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function createSession(id?: string): Session {
  const sessionId = id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const session: Session = {
    id: sessionId,
    createdAt: now,
    updatedAt: now,
    entries: [],
    llmHistory: [],
    estimatedTokens: 0,
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function getOrCreateSession(id?: string): Session {
  if (id) {
    const existing = getSession(id);
    if (existing) return existing;
    return createSession(id);
  }
  return createSession();
}

export function appendUserMessage(session: Session, content: string): void {
  session.entries.push({ role: "user", content, at: new Date().toISOString() });
  session.llmHistory.push({ role: "user", content });
  session.estimatedTokens += estimateTokens(content);
  session.updatedAt = new Date().toISOString();
}

export function appendAssistantTurn(
  session: Session,
  content: string,
  toolCalls: ExecutedToolCall[],
): void {
  const mapped: ChatTurnToolCall[] = toolCalls.map((tc) => ({
    name: tc.name,
    arguments: tc.arguments,
    resultSummary: tc.resultSummary,
    ok: tc.ok,
  }));
  session.entries.push({
    role: "assistant",
    content,
    at: new Date().toISOString(),
    toolCalls: mapped.length ? mapped : undefined,
  });

  if (toolCalls.length > 0) {
    session.llmHistory.push({
      role: "assistant",
      content: content || "",
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      })),
    });
    for (const tc of toolCalls) {
      session.llmHistory.push({
        role: "tool",
        content: tc.resultRaw,
        toolCallId: tc.id,
      });
      session.estimatedTokens += estimateTokens(tc.resultRaw);
    }
  } else {
    session.llmHistory.push({ role: "assistant", content });
  }

  session.estimatedTokens += estimateTokens(content);
  session.updatedAt = new Date().toISOString();
}

export function sessionPublicView(session: Session): {
  id: string;
  createdAt: string;
  updatedAt: string;
  entries: SessionEntry[];
  pendingConfirmation?: ConfirmationPending;
} {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    entries: session.entries,
    pendingConfirmation: session.pendingConfirmation,
  };
}
