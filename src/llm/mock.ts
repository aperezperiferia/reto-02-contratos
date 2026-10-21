import type { LlmAdapter, LlmMessage, LlmResponse } from "./adapter.js";

type ExecutedTool = {
  name: string;
  arguments: Record<string, unknown>;
  result: { ok: boolean; data?: unknown; error?: string };
};

let callSeq = 0;

function nextToolCallId(): string {
  callSeq += 1;
  return `mock-call-${callSeq}`;
}

function parseToolResult(content: string): ExecutedTool["result"] {
  try {
    return JSON.parse(content) as ExecutedTool["result"];
  } catch {
    return { ok: false, error: "JSON inválido" };
  }
}

function collectExecutedTools(messages: LlmMessage[]): ExecutedTool[] {
  const out: ExecutedTool[] = [];
  for (let i = 0; i < messages.length; i += 1) {
    const m = messages[i];
    if (m.role !== "assistant" || !m.toolCalls?.length) continue;
    for (const tc of m.toolCalls) {
      const toolMsg = messages
        .slice(i + 1)
        .find((x) => x.role === "tool" && x.toolCallId === tc.id);
      if (!toolMsg) continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }
      out.push({
        name: tc.name,
        arguments: args,
        result: parseToolResult(toolMsg.content),
      });
    }
  }
  return out;
}

function lastUserMessage(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

function extractHoy(text: string): string {
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const m = text.match(/hoy\s+(\d{4}-\d{2}-\d{2})/i);
  if (m) return m[1];
  return "2026-09-03";
}

function shouldProcessBuzon(text: string): boolean {
  return /procesa|procesar|buz[oó]n|contratos/i.test(text);
}

function userConfirms(text: string): boolean {
  return /\bconfirmo\b/i.test(text) || /\bconfirmar\b/i.test(text);
}

type BuzonMsg = {
  id: string;
  tiene_contrato: boolean;
};

function getBuzonMensajes(executed: ExecutedTool[]): BuzonMsg[] {
  const hit = executed.find((e) => e.name === "contratos_leer_buzon");
  if (!hit?.result.ok || !hit.result.data) return [];
  const data = hit.result.data as { mensajes?: BuzonMsg[] };
  return data.mensajes ?? [];
}

function toolsForMessage(msgId: string, executed: ExecutedTool[]): ExecutedTool[] {
  return executed.filter((e) => String(e.arguments.mensaje_id ?? "") === msgId);
}

function getExtraerContrato(msgTools: ExecutedTool[]): unknown {
  const ext = msgTools.find((e) => e.name === "contratos_extraer");
  return ext?.result.ok ? ext.result.data : null;
}

function getValidacion(msgTools: ExecutedTool[]): {
  clasificacion?: string;
  requiere_revision?: string[];
  comercial?: string;
} | null {
  const val = msgTools.find((e) => e.name === "contratos_validar");
  if (!val?.result.ok || !val.result.data) return null;
  return val.result.data as {
    clasificacion?: string;
    requiere_revision?: string[];
    comercial?: string;
  };
}

function registrarDone(msgTools: ExecutedTool[]): boolean {
  return msgTools.some(
    (e) => e.name === "contratos_registrar" && e.result.ok,
  );
}

function buildSummary(executed: ExecutedTool[], hoy: string): string {
  const lines: string[] = [
    `Resumen del procesamiento (mock determinista, fecha ${hoy}):`,
    "",
  ];
  for (const id of ["msg-001", "msg-002", "msg-003", "msg-004", "msg-005", "msg-006"]) {
    const msgTools = toolsForMessage(id, executed);
    const val = getValidacion(msgTools);
    const reg = msgTools.find((e) => e.name === "contratos_registrar");
    if (!val && msgTools.length === 0) continue;
    const cls = val?.clasificacion ?? "—";
    const rev = val?.requiere_revision?.length
      ? ` · revisión: ${val.requiere_revision.join(", ")}`
      : "";
    let accion = "—";
    if (reg?.result.ok) {
      const d = reg.result.data as { accion?: string; id_contrato?: string };
      accion = `${d.accion ?? "ok"} ${d.id_contrato ?? ""}`.trim();
    } else if (reg && !reg.result.ok) {
      accion = reg.result.error ?? "pendiente";
    } else if (val?.requiere_revision?.length) {
      accion = "omitido (espera confirmación)";
    }
    lines.push(`- **${id}**: ${cls}${rev} → ${accion}`);
  }
  const alertas = executed.find((e) => e.name === "contratos_alertas");
  if (alertas?.result.ok) {
    const d = alertas.result.data as { ruta?: string };
    lines.push("", `Reporte: \`${d.ruta ?? "out/alertas.md"}\``);
  }
  lines.push(
    "",
    "_(Adaptador mock: mismo flujo de herramientas que demo.ts, sin costo de API.)_",
  );
  return lines.join("\n");
}

function planNext(messages: LlmMessage[]): LlmResponse {
  const lastUser = lastUserMessage(messages);
  const hoy = extractHoy(lastUser);
  const executed = collectExecutedTools(messages);

  if (userConfirms(lastUser)) {
    const msgTools = toolsForMessage("msg-006", executed);
    if (!registrarDone(msgTools)) {
      const contrato = getExtraerContrato(msgTools);
      const val = getValidacion(msgTools);
      if (contrato && val) {
        return {
          content: null,
          toolCalls: [
            {
              id: nextToolCallId(),
              name: "contratos_registrar",
              arguments: JSON.stringify({
                mensaje_id: "msg-006",
                contrato,
                confirmado: true,
                clasificacion: val.clasificacion ?? "nuevo",
                comercial: val.comercial,
                fecha_registro: hoy,
              }),
            },
          ],
        };
      }
    }
    return {
      content:
        "Registro confirmado (mock). Si aún falta algo, indica qué mensaje revisar.",
    };
  }

  if (!shouldProcessBuzon(lastUser) && !executed.length) {
    return {
      content:
        'Soy el agente mock (sin API de OpenAI). Escribe por ejemplo: "Procesa el buzón con fecha de hoy 2026-09-03…" o usa el botón de demo en la interfaz.',
    };
  }

  if (!executed.some((e) => e.name === "contratos_leer_buzon")) {
    return {
      content: "Consulto el buzón pendiente…",
      toolCalls: [
        {
          id: nextToolCallId(),
          name: "contratos_leer_buzon",
          arguments: "{}",
        },
      ],
    };
  }

  const mensajes = getBuzonMensajes(executed);
  for (const msg of mensajes) {
    const msgTools = toolsForMessage(msg.id, executed);
    if (registrarDone(msgTools)) continue;

    const val = getValidacion(msgTools);

    if (msg.tiene_contrato && !msgTools.some((e) => e.name === "contratos_extraer")) {
      return {
        content: null,
        toolCalls: [
          {
            id: nextToolCallId(),
            name: "contratos_extraer",
            arguments: JSON.stringify({ mensaje_id: msg.id }),
          },
        ],
      };
    }

    if (!msgTools.some((e) => e.name === "contratos_validar")) {
      const contrato = msg.tiene_contrato ? getExtraerContrato(msgTools) : {};
      return {
        content: null,
        toolCalls: [
          {
            id: nextToolCallId(),
            name: "contratos_validar",
            arguments: JSON.stringify({ mensaje_id: msg.id, contrato: contrato ?? {} }),
          },
        ],
      };
    }

    if (val?.requiere_revision?.length) {
      continue;
    }

    if (!msgTools.some((e) => e.name === "contratos_registrar")) {
      const contrato = getExtraerContrato(msgTools) ?? {};
      return {
        content: null,
        toolCalls: [
          {
            id: nextToolCallId(),
            name: "contratos_registrar",
            arguments: JSON.stringify({
              mensaje_id: msg.id,
              contrato,
              clasificacion: val?.clasificacion ?? "rechazado",
              comercial: val?.comercial,
              fecha_registro: hoy,
            }),
          },
        ],
      };
    }
  }

  if (!executed.some((e) => e.name === "contratos_alertas")) {
    return {
      content: null,
      toolCalls: [
        {
          id: nextToolCallId(),
          name: "contratos_alertas",
          arguments: JSON.stringify({ hoy }),
        },
      ],
    };
  }

  const pending = getValidacion(toolsForMessage("msg-006", executed));
  let summary = buildSummary(executed, hoy);
  if (pending?.requiere_revision?.length) {
    summary +=
      "\n\n**msg-006** requiere tu confirmación antes de registrar. Responde por ejemplo: \"Confirmo el valor 0 y la fecha fin 2027-08-31\".";
  }
  return { content: summary };
}

/** Agente simulado: planifica llamadas a herramientas como en demo.ts (sin API externa). */
export class MockAdapter implements LlmAdapter {
  readonly provider = "mock";
  readonly model = process.env.MOCK_MODEL ?? "deterministic-v1";

  async enviar(mensajes: LlmMessage[], _herramientas: unknown[]): Promise<LlmResponse> {
    await Promise.resolve();
    return planNext(mensajes);
  }
}
