import type { ToolContext } from "../context.js";
import type { LlmAdapter, LlmMessage } from "../llm/adapter.js";
import { executeToolByName, listLlmToolSpecs, type ExecutedToolCall } from "../tools/registry.js";
import type { ConfirmationPending, Session } from "./sessions.js";

export type AgentTurnResult = {
  reply: string;
  toolCalls: ExecutedToolCall[];
  needsConfirmation: boolean;
  confirmation?: ConfirmationPending;
};

function parseToolArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function detectConfirmation(
  toolCalls: ExecutedToolCall[],
  session: Session,
): ConfirmationPending | undefined {
  for (const tc of toolCalls) {
    if (tc.name !== "contratos_validar") continue;
    try {
      const body = JSON.parse(tc.resultRaw) as {
        ok: boolean;
        data?: {
          clasificacion?: string;
          requiere_revision?: string[];
          comercial?: string;
        };
      };
      if (!body.ok || !body.data) continue;
      const rev = body.data.requiere_revision ?? [];
      if (rev.length === 0) continue;
      const mensajeId = String(tc.arguments.mensaje_id ?? "");
      return {
        mensaje_id: mensajeId,
        campos: rev,
        clasificacion: body.data.clasificacion ?? "nuevo",
        comercial: body.data.comercial,
      };
    } catch {
      continue;
    }
  }

  for (const tc of toolCalls) {
    if (tc.name !== "contratos_registrar") continue;
    try {
      const body = JSON.parse(tc.resultRaw) as { ok: boolean; error?: string };
      if (body.ok) continue;
      const match = body.error?.match(/requiere revisión:\s*(.+)/i);
      if (match) {
        const campos = match[1].split(",").map((s) => s.trim());
        const mensajeId = String(tc.arguments.mensaje_id ?? "");
        return {
          mensaje_id: mensajeId,
          campos,
          clasificacion: String(tc.arguments.clasificacion ?? "nuevo"),
          comercial: tc.arguments.comercial as string | undefined,
        };
      }
    } catch {
      continue;
    }
  }

  if (session.pendingConfirmation) {
    return session.pendingConfirmation;
  }
  return undefined;
}

function userConfirms(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /\bconfirmo\b/.test(t) ||
    /\bconfirmar\b/.test(t) ||
    /\bsí, registra\b/.test(t) ||
    /\bsi, registra\b/.test(t)
  );
}

export async function runAgentTurn(
  adapter: LlmAdapter,
  session: Session,
  systemPrompt: string,
  ctx: ToolContext,
  userMessage: string,
): Promise<AgentTurnResult> {
  const maxIterations = Number(process.env.AGENT_MAX_ITERATIONS ?? 25);
  const maxTokens = Number(process.env.AGENT_MAX_TOKENS_PER_SESSION ?? 100_000);

  if (session.estimatedTokens > maxTokens) {
    return {
      reply:
        "Se alcanzó el límite de tokens de esta sesión. Abre una sesión nueva para continuar.",
      toolCalls: [],
      needsConfirmation: Boolean(session.pendingConfirmation),
      confirmation: session.pendingConfirmation,
    };
  }

  const tools = listLlmToolSpecs();
  const turnToolCalls: ExecutedToolCall[] = [];

  if (session.pendingConfirmation && userConfirms(userMessage)) {
    systemPrompt += `\n\n[El usuario acaba de confirmar campos en revisión. Si corresponde, llama contratos_registrar con confirmado=true, la misma clasificacion/comercial y fecha_registro acordada para mensaje ${session.pendingConfirmation.mensaje_id}.]`;
  }

  const messages: LlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...session.llmHistory.map((h) => ({
      role: h.role,
      content: h.content,
      toolCallId: h.toolCallId,
      toolCalls: h.toolCalls,
    })),
  ];

  let iterations = 0;
  let finalContent = "";

  while (iterations < maxIterations) {
    iterations += 1;
    let response;
    try {
      response = await adapter.enviar(messages, tools);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      finalContent = `No pude contactar al modelo de lenguaje: ${msg}`;
      break;
    }

    const toolCalls = response.toolCalls ?? [];
    if (toolCalls.length === 0) {
      finalContent = response.content?.trim() || "Listo.";
      break;
    }

    const batchResults: ExecutedToolCall[] = [];
    for (const tc of toolCalls) {
      const args = parseToolArgs(tc.arguments);
      const executed = await executeToolByName(tc.name, args, ctx, tc.id);
      batchResults.push(executed);
      turnToolCalls.push(executed);
    }

    finalContent = response.content?.trim() ?? "";

    messages.push({
      role: "assistant",
      content: finalContent,
      toolCalls: toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      })),
    });
    for (const ex of batchResults) {
      messages.push({
        role: "tool",
        toolCallId: ex.id,
        content: ex.resultRaw,
      });
    }
  }

  if (iterations >= maxIterations && !finalContent) {
    finalContent =
      "Alcancé el tope de iteraciones del agente. Resumo lo ejecutado hasta ahora; indica si continúo con un mensaje más específico.";
  }

  const confirmation = detectConfirmation(turnToolCalls, session);
  if (confirmation) {
    session.pendingConfirmation = confirmation;
  } else if (userConfirms(userMessage)) {
    const registered = turnToolCalls.some(
      (tc) => tc.name === "contratos_registrar" && tc.ok,
    );
    if (registered) session.pendingConfirmation = undefined;
  }

  const needsConfirmation = Boolean(session.pendingConfirmation);
  if (needsConfirmation && !/\?\s*$/.test(finalContent)) {
    const p = session.pendingConfirmation!;
    finalContent +=
      (finalContent ? "\n\n" : "") +
      `Antes de registrar **${p.mensaje_id}**, confirma los campos en revisión (${p.campos.join(", ")}). ¿Confirmas los valores propuestos?`;
  }

  return {
    reply: finalContent,
    toolCalls: turnToolCalls,
    needsConfirmation,
    confirmation: session.pendingConfirmation,
  };
}
