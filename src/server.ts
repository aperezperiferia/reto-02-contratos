import "dotenv/config";
import http from "node:http";
import { runAgentTurn } from "./agent/cycle.js";
import { loadSystemPrompt } from "./agent/prompt-loader.js";
import {
  appendAssistantTurn,
  appendUserMessage,
  getOrCreateSession,
  getSession,
  sessionPublicView,
} from "./agent/sessions.js";
import { createToolContext } from "./context.js";
import { ensureSharepointMaestro, initOutDirectory } from "./init-out.js";
import {
  createLlmAdapter,
  isUsingMockAdapter,
  tryCreateLlmAdapter,
} from "./llm/factory.js";
import { hasStaticBuild, tryServeStatic } from "./static.js";

const PORT = Number(process.env.PORT ?? 3000);
const directory = process.cwd();

let cachedSystemPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = await loadSystemPrompt(directory);
  }
  return cachedSystemPrompt;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {} as T;
  return JSON.parse(raw) as T;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    const adapter = tryCreateLlmAdapter();
    sendJson(res, 200, {
      ok: true,
      provider: adapter?.provider ?? process.env.LLM_PROVIDER ?? "none",
      model: adapter?.model ?? process.env.OPENAI_MODEL ?? "none",
      llmReady: Boolean(adapter),
      mock: adapter ? isUsingMockAdapter(adapter) : false,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/demo/reset-out") {
    if (process.env.ALLOW_DEMO_RESET !== "true" && process.env.NODE_ENV === "production") {
      sendJson(res, 403, { ok: false, error: "Reset deshabilitado en producción" });
      return;
    }
    try {
      await initOutDirectory(directory);
      sendJson(res, 200, { ok: true, message: "out/ reiniciado" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { ok: false, error });
    }
    return;
  }

  if (await tryServeStatic(req, res, url)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Reto 02 — POST /api/chat · GET /api/sessions/:id · GET /api/health\n");
    return;
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === "GET" && sessionMatch) {
    const session = getSession(decodeURIComponent(sessionMatch[1]));
    if (!session) {
      sendJson(res, 404, { ok: false, error: "Sesión no encontrada" });
      return;
    }
    sendJson(res, 200, { ok: true, session: sessionPublicView(session) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await readJsonBody<{ sessionId?: string; message?: string }>(req);
      const message = body.message?.trim();
      if (!message) {
        sendJson(res, 400, { ok: false, error: "message es requerido" });
        return;
      }

      const adapter = createLlmAdapter();
      await ensureSharepointMaestro(directory);

      const session = getOrCreateSession(body.sessionId);
      const ctx = createToolContext(session.id);
      appendUserMessage(session, message);

      const result = await runAgentTurn(
        adapter,
        session,
        await getSystemPrompt(),
        ctx,
        message,
      );

      appendAssistantTurn(session, result.reply, result.toolCalls);

      sendJson(res, 200, {
        sessionId: session.id,
        reply: result.reply,
        toolCalls: result.toolCalls.map((tc) => ({
          name: tc.name,
          arguments: tc.arguments,
          resultSummary: tc.resultSummary,
          ok: tc.ok,
        })),
        needsConfirmation: result.needsConfirmation,
        confirmation: result.confirmation,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      sendJson(res, 500, { ok: false, error });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "not found" });
});

await ensureSharepointMaestro(directory);

server.listen(PORT, async () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  if (await hasStaticBuild()) {
    console.log("Sirviendo front estático desde dist/web");
  }
  const adapter = tryCreateLlmAdapter();
  if (!adapter) {
    console.warn("LLM no disponible");
  } else if (isUsingMockAdapter(adapter)) {
    console.log(`LLM: mock / ${adapter.model} (sin OPENAI_API_KEY — chat determinista)`);
  } else {
    console.log(`LLM: ${adapter.provider} / ${adapter.model}`);
  }
});
