import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  type ChatResponse,
  type ConfirmationPending,
  type ToolCallView,
  fetchHealth,
  fetchSession,
  resetOutDirectory,
  sendChatMessage,
} from "./api";
import { ToolCallsList } from "./ToolCallsList";

type ChatEntry =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string;
      toolCalls?: ToolCallView[];
    };

const SESSION_KEY = "reto02-session-id";

const DEMO_PROMPT = `Procesa el buzón de contratos con fecha de hoy 2026-09-03. Registra lo que esté limpio, muéstrame lo que requiere revisión campo por campo y termina con el reporte de alertas. No registres nada dudoso sin preguntarme.`;

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(() =>
    localStorage.getItem(SESSION_KEY),
  );
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<string>("…");
  const [confirmation, setConfirmation] = useState<ConfirmationPending | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => {
        setHealth(
          h.mock
            ? `mock · ${h.model} (sin API key)`
            : h.llmReady
              ? `${h.provider} · ${h.model}`
              : "LLM no configurado",
        );
      })
      .catch(() => setHealth("Backend no disponible"));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetchSession(sessionId)
      .then((s) => {
        if (!s) return;
        setEntries(
          s.entries.map((e) =>
            e.role === "assistant"
              ? { role: "assistant" as const, content: e.content, toolCalls: e.toolCalls }
              : { role: "user" as const, content: e.content },
          ),
        );
        setConfirmation(s.pendingConfirmation ?? null);
      })
      .catch(() => {
        /* sesión expirada en memoria del servidor */
      });
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, loading]);

  const applyResponse = useCallback((data: ChatResponse) => {
    setSessionId(data.sessionId);
    localStorage.setItem(SESSION_KEY, data.sessionId);
    setConfirmation(data.needsConfirmation ? data.confirmation ?? null : null);
    setEntries((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.reply,
        toolCalls: data.toolCalls,
      },
    ]);
  }, []);

  async function submitMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setError(null);
    setEntries((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);

    try {
      const data = await sendChatMessage(trimmed, sessionId);
      applyResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submitMessage(input);
  }

  function newSession() {
    localStorage.removeItem(SESSION_KEY);
    setSessionId(null);
    setEntries([]);
    setConfirmation(null);
    setError(null);
  }

  async function resetBuzon() {
    setError(null);
    try {
      await resetOutDirectory();
      newSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="layout">
      <header className="header">
        <div>
          <h1>Registro de contratos vigentes</h1>
          <p className="subtitle">Agente administrativo · Periferia IT Group</p>
        </div>
        <div className="header-meta">
          <span className="badge">{health}</span>
          <button type="button" className="btn-secondary" onClick={newSession}>
            Nueva sesión
          </button>
          <button type="button" className="btn-secondary" onClick={() => void resetBuzon()}>
            Resetear buzón
          </button>
        </div>
      </header>

      {confirmation && (
        <div className="confirmation-banner" role="status">
          <strong>Confirmación requerida</strong>
          <span>
            Mensaje <code>{confirmation.mensaje_id}</code> — revisar:{" "}
            {confirmation.campos.join(", ")}
          </span>
        </div>
      )}

      <main className="chat">
        {entries.length === 0 && (
          <div className="empty">
            <p>Escribe un mensaje o usa la demo del PRD. Si el buzón ya fue procesado, pulsa <strong>Resetear buzón</strong>.</p>
            <button type="button" className="btn-primary" onClick={() => void submitMessage(DEMO_PROMPT)}>
              Ejecutar demo del buzón
            </button>
          </div>
        )}

        {entries.map((entry, i) => (
          <article
            key={i}
            className={`bubble ${entry.role}${entry.role === "assistant" && confirmation && i === entries.length - 1 ? " needs-confirm" : ""}`}
          >
            <div className="bubble-label">{entry.role === "user" ? "Tú" : "Agente"}</div>
            <div className="bubble-body">{entry.content}</div>
            {entry.role === "assistant" && entry.toolCalls && (
              <ToolCallsList toolCalls={entry.toolCalls} />
            )}
          </article>
        ))}

        {loading && (
          <div className="thinking" aria-live="polite">
            <span className="dot-pulse" />
            Pensando…
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        <div ref={bottomRef} />
      </main>

      <form className="composer" onSubmit={onSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe tu mensaje… (Enter para enviar, Shift+Enter nueva línea)"
          rows={2}
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submitMessage(input);
            }
          }}
        />
        <button type="submit" className="btn-primary" disabled={loading || !input.trim()}>
          Enviar
        </button>
      </form>
    </div>
  );
}
