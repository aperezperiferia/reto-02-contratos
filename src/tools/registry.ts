import { z } from "zod";
import type { ToolContext } from "../context.js";
import type { LlmToolSpec } from "../llm/adapter.js";
import { contratosTools, type ContratosToolName } from "./contratos.js";
import { zodArgsToJsonSchema } from "./zod-json-schema.js";

const PREFIX = "contratos_";

export type ExecutedToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  resultRaw: string;
  resultSummary: string;
  ok: boolean;
};

function toolPublicName(key: string): string {
  return `${PREFIX}${key}`;
}

function buildZodObject(args: Record<string, z.ZodType>): z.ZodObject<z.ZodRawShape> {
  return z.object(args as z.ZodRawShape);
}

export function listLlmToolSpecs(): LlmToolSpec[] {
  return (Object.keys(contratosTools) as ContratosToolName[]).map((key) => {
    const tool = contratosTools[key];
    return {
      name: toolPublicName(key),
      description: tool.description,
      parameters: zodArgsToJsonSchema(tool.args as Record<string, z.ZodType>),
    };
  });
}

function summarizeResult(name: string, raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { ok: boolean; data?: unknown; error?: string };
    if (!parsed.ok) return parsed.error ?? "error";
    const data = parsed.data;
    if (name === "contratos_leer_buzon" && data && typeof data === "object" && "mensajes" in data) {
      const n = (data as { mensajes: unknown[] }).mensajes.length;
      return `${n} mensaje(s) pendiente(s)`;
    }
    if (typeof data === "object" && data !== null) {
      return JSON.stringify(data).slice(0, 280);
    }
    return "ok";
  } catch {
    return raw.slice(0, 200);
  }
}

export async function executeToolByName(
  name: string,
  argsRaw: unknown,
  ctx: ToolContext,
  toolCallId: string,
): Promise<ExecutedToolCall> {
  if (!name.startsWith(PREFIX)) {
    const resultRaw = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
    return {
      id: toolCallId,
      name,
      arguments: {},
      resultRaw,
      resultSummary: resultRaw,
      ok: false,
    };
  }

  const key = name.slice(PREFIX.length) as ContratosToolName;
  const tool = contratosTools[key];
  if (!tool) {
    const resultRaw = JSON.stringify({ ok: false, error: `Herramienta desconocida: ${name}` });
    return {
      id: toolCallId,
      name,
      arguments: {},
      resultRaw,
      resultSummary: resultRaw,
      ok: false,
    };
  }

  const schema = buildZodObject(tool.args as Record<string, z.ZodType>);
  const parsed = schema.safeParse(argsRaw ?? {});
  if (!parsed.success) {
    const resultRaw = JSON.stringify({
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    });
    return {
      id: toolCallId,
      name,
      arguments: (argsRaw as Record<string, unknown>) ?? {},
      resultRaw,
      resultSummary: resultRaw,
      ok: false,
    };
  }

  const resultRaw = await tool.execute(parsed.data as never, ctx);
  const ok = (JSON.parse(resultRaw) as { ok: boolean }).ok;
  return {
    id: toolCallId,
    name,
    arguments: parsed.data as Record<string, unknown>,
    resultRaw,
    resultSummary: summarizeResult(name, resultRaw),
    ok,
  };
}
