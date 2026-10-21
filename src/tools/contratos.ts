import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { ToolContext } from "../context.js";
import {
  ALERTAS_REL,
  BUZON_REL,
  HISTORIAL_REL,
  SHAREPOINT_OUT_REL,
  resolveFromRoot,
} from "../paths.js";
import {
  adjuntoEsContrato,
  listBuzonMessageIds,
  markProcesado,
  primerAdjuntoContrato,
  readAdjuntoTexto,
  readCorreo,
  readProcesados,
} from "./buzon-io.js";
import { resolverComercial } from "./comerciales.js";
import {
  camposEnRevision,
  flattenContrato,
  type Clasificacion,
  type ContratoExtraido,
  type ContratoPlano,
  type MaestroRow,
} from "./contrato-schema.js";
import { extraerDesdeTexto, textoPareceContrato } from "./extract.js";
import { findById, readMaestro, writeMaestro } from "./maestro.js";
import { appendToolLog } from "./tool-log.js";
import { toolJson, type ToolDefinition } from "./types.js";

function slugifyCliente(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function similitudTexto(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const wa = new Set(na.split(/\s+/));
  const wb = new Set(nb.split(/\s+/));
  let inter = 0;
  for (const w of wa) {
    if (wb.has(w)) inter += 1;
  }
  return inter / Math.max(wa.size, wb.size);
}

function parseContratoArg(raw: unknown): ContratoExtraido | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as ContratoExtraido;
}

function rowMatchesDuplicate(row: MaestroRow, plano: Partial<ContratoPlano>): boolean {
  return (
    row.valor === plano.valor &&
    row.fecha_inicio === plano.fecha_inicio &&
    row.fecha_fin === plano.fecha_fin
  );
}

async function appendHistorial(
  directory: string,
  entry: {
    id_contrato: string;
    accion: string;
    cambios: Record<string, { antes: unknown; despues: unknown }>;
    mensaje_id: string;
  },
): Promise<void> {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  await fs.appendFile(resolveFromRoot(directory, HISTORIAL_REL), line + "\n", "utf8");
}

function mergeParaRegistro(
  extraido: ContratoExtraido,
  existente: MaestroRow | undefined,
  comercial: string,
  fechaRegistro: string,
): ContratoPlano | null {
  const base = flattenContrato(extraido);
  if (extraido.es_otrosi && existente) {
    return {
      ...existente,
      valor: base.valor ?? existente.valor,
      moneda: base.moneda ?? existente.moneda,
      fecha_fin: base.fecha_fin ?? existente.fecha_fin,
      fecha_registro: fechaRegistro,
      fuente: existente.fuente === "migracion" ? existente.fuente : "buzon",
      comercial: comercial || existente.comercial,
    };
  }

  const id = base.id_contrato;
  const cliente = base.cliente;
  const nit = base.nit_cliente;
  const pais = base.pais;
  const objeto = base.objeto;
  const moneda = base.moneda;
  const fechaInicio = base.fecha_inicio;
  const fechaFin = base.fecha_fin;
  if (!id || !cliente || !nit || !pais || !objeto || !moneda || !fechaInicio || !fechaFin) {
    return null;
  }

  const requierePoliza = base.requiere_poliza ?? false;
  const estadoPoliza = requierePoliza ? "pendiente" : "no_aplica";

  return {
    id_contrato: id,
    cliente,
    nit_cliente: nit,
    pais,
    objeto,
    valor: base.valor ?? 0,
    moneda,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    requiere_poliza: requierePoliza,
    tipo_poliza: base.tipo_poliza ?? "",
    estado_poliza: estadoPoliza,
    comercial,
    ruta_sharepoint: "",
    fecha_registro: fechaRegistro,
    fuente: "buzon",
  };
}

export const leer_buzon: ToolDefinition<Record<string, never>> = {
  description: "Lista mensajes del buzón no procesados con metadatos y adjuntos.",
  args: {},
  async execute(_args, ctx: ToolContext) {
    try {
      const procesados = await readProcesados(ctx.directory);
      const ids = await listBuzonMessageIds(ctx.directory);
      const mensajes = [];
      for (const id of ids) {
        if (procesados[id]) continue;
        const correo = await readCorreo(ctx.directory, id);
        const adjuntos = correo.adjuntos;
        const tiene_contrato = adjuntos.some((a) => adjuntoEsContrato(a));
        mensajes.push({
          id: correo.id,
          de: correo.de,
          asunto: correo.asunto,
          fecha: correo.fecha,
          adjuntos,
          tiene_contrato,
        });
      }
      await appendToolLog(ctx.directory, {
        herramienta: "contratos_leer_buzon",
        ok: true,
        resumen: `${mensajes.length} mensaje(s) pendiente(s)`,
      });
      return toolJson({ ok: true, data: { mensajes } });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await appendToolLog(ctx.directory, {
        herramienta: "contratos_leer_buzon",
        ok: false,
        resumen: error,
      });
      return toolJson({ ok: false, error });
    }
  },
};

export const extraer: ToolDefinition<{ mensaje_id: string }> = {
  description: "Extrae datos estructurados del contrato adjunto a un mensaje.",
  args: {
    mensaje_id: z.string().describe("Identificador del mensaje, p. ej. msg-001"),
  },
  async execute(args, ctx: ToolContext) {
    try {
      const adj = primerAdjuntoContrato(await readCorreo(ctx.directory, args.mensaje_id));
      if (!adj) {
        return toolJson({ ok: false, error: "No hay adjunto de contrato en el mensaje" });
      }
      const texto = await readAdjuntoTexto(ctx.directory, args.mensaje_id, adj);
      if (!texto.trim()) {
        return toolJson({ ok: false, error: "Texto del adjunto vacío" });
      }
      const contrato = extraerDesdeTexto(texto, adj);
      await appendToolLog(ctx.directory, {
        herramienta: "contratos_extraer",
        mensaje_id: args.mensaje_id,
        ok: true,
        resumen: contrato.id_contrato.valor ?? "sin id",
      });
      return toolJson({ ok: true, data: contrato });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await appendToolLog(ctx.directory, {
        herramienta: "contratos_extraer",
        mensaje_id: args.mensaje_id,
        ok: false,
        resumen: error,
      });
      return toolJson({ ok: false, error });
    }
  },
};

export const validar: ToolDefinition<{ mensaje_id: string; contrato: unknown }> = {
  description: "Valida el contrato extraído y clasifica como nuevo, actualización, duplicado o rechazado.",
  args: {
    mensaje_id: z.string().describe("Identificador del mensaje"),
    contrato: z.unknown().describe("Objeto Contrato devuelto por contratos_extraer"),
  },
  async execute(args, ctx: ToolContext) {
    try {
      const correo = await readCorreo(ctx.directory, args.mensaje_id);
      const adjContrato = primerAdjuntoContrato(correo);
      const advertencias: string[] = [];
      const comercialInfo = await resolverComercial(ctx.directory, correo.de);
      if (!comercialInfo.conocido) {
        advertencias.push(`Remitente no registrado en comerciales.json: ${correo.de}`);
      }

      if (!adjContrato) {
        await appendToolLog(ctx.directory, {
          herramienta: "contratos_validar",
          mensaje_id: args.mensaje_id,
          ok: true,
          resumen: "rechazado: sin contrato",
        });
        return toolJson({
          ok: true,
          data: {
            clasificacion: "rechazado" as Clasificacion,
            motivo: "Sin adjunto de contrato (cotización u otro documento)",
            requiere_revision: [] as string[],
            advertencias,
          },
        });
      }

      const extraido = parseContratoArg(args.contrato);
      if (!extraido || !textoPareceContrato(extraido.texto_adjunto)) {
        return toolJson({
          ok: true,
          data: {
            clasificacion: "rechazado" as Clasificacion,
            motivo: "Texto sin partes u objeto identificables",
            requiere_revision: [] as string[],
            advertencias,
          },
        });
      }

      const rows = await readMaestro(ctx.directory);
      const plano = flattenContrato(extraido);
      const id = plano.id_contrato;
      let clasificacion: Clasificacion = "nuevo";
      let id_contrato_existente: string | undefined;
      const diferencias: Record<string, { maestro: unknown; propuesto: unknown }> = {};

      const byId = id ? findById(rows, id) : undefined;

      if (extraido.es_otrosi && byId) {
        clasificacion = "actualizacion";
        id_contrato_existente = byId.id_contrato;
        if (byId.valor !== plano.valor) {
          diferencias.valor = { maestro: byId.valor, propuesto: plano.valor };
        }
        if (byId.fecha_fin !== plano.fecha_fin) {
          diferencias.fecha_fin = { maestro: byId.fecha_fin, propuesto: plano.fecha_fin };
        }
      } else if (byId && rowMatchesDuplicate(byId, plano)) {
        clasificacion = "duplicado";
        id_contrato_existente = byId.id_contrato;
      } else if (byId) {
        clasificacion = "actualizacion";
        id_contrato_existente = byId.id_contrato;
        for (const key of ["valor", "fecha_inicio", "fecha_fin", "objeto"] as const) {
          const m = byId[key];
          const p = plano[key];
          if (p != null && m !== p) {
            diferencias[key] = { maestro: m, propuesto: p };
          }
        }
      } else if (id) {
        for (const row of rows) {
          if (
            row.nit_cliente === plano.nit_cliente &&
            plano.objeto &&
            similitudTexto(row.objeto, plano.objeto) >= 0.9
          ) {
            clasificacion = "actualizacion";
            id_contrato_existente = row.id_contrato;
            break;
          }
        }
      }

      const requiere_revision =
        clasificacion === "duplicado" ? [] : camposEnRevision(extraido);

      await appendToolLog(ctx.directory, {
        herramienta: "contratos_validar",
        mensaje_id: args.mensaje_id,
        ok: true,
        resumen: `${clasificacion}; revision=${requiere_revision.join(",") || "ninguna"}`,
      });

      return toolJson({
        ok: true,
        data: {
          clasificacion,
          id_contrato_existente,
          requiere_revision,
          diferencias: Object.keys(diferencias).length ? diferencias : undefined,
          advertencias,
          comercial: comercialInfo.nombre,
        },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return toolJson({ ok: false, error });
    }
  },
};

export const registrar: ToolDefinition<{
  mensaje_id: string;
  contrato: unknown;
  confirmado?: boolean;
  clasificacion?: Clasificacion;
  comercial?: string;
  fecha_registro?: string;
}> = {
  description: "Registra o actualiza el contrato en el maestro y archiva el documento.",
  args: {
    mensaje_id: z.string().describe("Identificador del mensaje"),
    contrato: z.unknown().describe("Contrato validado a registrar"),
    confirmado: z
      .boolean()
      .optional()
      .describe("true si el analista confirmó campos en revisión"),
    clasificacion: z
      .enum(["nuevo", "actualizacion", "duplicado", "rechazado"])
      .optional()
      .describe("Clasificación devuelta por contratos_validar"),
    comercial: z.string().optional().describe("Nombre del comercial resuelto"),
    fecha_registro: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Fecha de registro YYYY-MM-DD"),
  },
  async execute(args, ctx: ToolContext) {
    try {
      const clasificacion = args.clasificacion;
      const fechaRegistro = args.fecha_registro ?? new Date().toISOString().slice(0, 10);

      if (clasificacion === "rechazado" || clasificacion === "duplicado") {
        await markProcesado(ctx.directory, args.mensaje_id);
        await appendToolLog(ctx.directory, {
          herramienta: "contratos_registrar",
          mensaje_id: args.mensaje_id,
          ok: true,
          resumen: clasificacion,
        });
        const parsed = parseContratoArg(args.contrato);
        return toolJson({
          ok: true,
          data: {
            id_contrato: parsed?.id_contrato?.valor ?? null,
            accion: clasificacion,
            ruta_archivo: null,
          },
        });
      }

      const extraido = parseContratoArg(args.contrato);
      if (!extraido) {
        return toolJson({ ok: false, error: "Contrato inválido" });
      }

      const revision = camposEnRevision(extraido);
      if (revision.length > 0 && !args.confirmado) {
        return toolJson({
          ok: false,
          error: `requiere revisión: ${revision.join(", ")}`,
        });
      }

      const rows = await readMaestro(ctx.directory);
      const correo = await readCorreo(ctx.directory, args.mensaje_id);
      const comercialInfo = args.comercial
        ? { nombre: args.comercial, conocido: true }
        : await resolverComercial(ctx.directory, correo.de);

      const id = extraido.id_contrato.valor;
      const existente = id ? findById(rows, id) : undefined;
      const merged = mergeParaRegistro(
        extraido,
        existente,
        comercialInfo.nombre,
        fechaRegistro,
      );
      if (!merged) {
        return toolJson({ ok: false, error: "Faltan campos obligatorios para registrar" });
      }

      const anio = merged.fecha_inicio.slice(0, 4);
      const ext = path.extname(extraido.adjunto_nombre ?? "contrato.txt") || ".txt";
      const relArchivo = path.posix.join(
        "Contratos",
        anio,
        slugifyCliente(merged.cliente),
        `${merged.id_contrato}${ext}`,
      );
      const absArchivo = resolveFromRoot(ctx.directory, SHAREPOINT_OUT_REL, relArchivo);
      await fs.mkdir(path.dirname(absArchivo), { recursive: true });
      const adj = extraido.adjunto_nombre ?? "contrato.txt";
      const src = path.join(resolveFromRoot(ctx.directory, BUZON_REL), args.mensaje_id, adj);
      await fs.copyFile(src, absArchivo);
      merged.ruta_sharepoint = relArchivo.replace(/\\/g, "/");

      let accion: "insertado" | "actualizado" = "insertado";
      const cambios: Record<string, { antes: unknown; despues: unknown }> = {};

      if (clasificacion === "actualizacion" && existente) {
        accion = "actualizado";
        for (const key of Object.keys(merged) as (keyof MaestroRow)[]) {
          if (existente[key] !== merged[key]) {
            cambios[key] = { antes: existente[key], despues: merged[key] };
          }
        }
        const idx = rows.findIndex((r) => r.id_contrato === existente.id_contrato);
        if (idx >= 0) rows[idx] = merged;
      } else {
        rows.push(merged);
      }

      await writeMaestro(ctx.directory, rows);
      await appendHistorial(ctx.directory, {
        id_contrato: merged.id_contrato,
        accion,
        cambios,
        mensaje_id: args.mensaje_id,
      });
      await markProcesado(ctx.directory, args.mensaje_id);

      await appendToolLog(ctx.directory, {
        herramienta: "contratos_registrar",
        mensaje_id: args.mensaje_id,
        ok: true,
        resumen: `${accion} ${merged.id_contrato}`,
      });

      return toolJson({
        ok: true,
        data: {
          id_contrato: merged.id_contrato,
          accion,
          ruta_archivo: merged.ruta_sharepoint,
        },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return toolJson({ ok: false, error });
    }
  },
};

function daysBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z").getTime();
  const db = new Date(b + "T00:00:00Z").getTime();
  return Math.round((db - da) / 86400000);
}

export const alertas: ToolDefinition<{ hoy: string }> = {
  description: "Genera reporte de vencimientos, pólizas pendientes y contratos post-corte.",
  args: {
    hoy: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe("Fecha de referencia YYYY-MM-DD"),
  },
  async execute(args, ctx: ToolContext) {
    try {
      const rows = await readMaestro(ctx.directory);
      const vencen = rows.filter((r) => {
        const d = daysBetween(args.hoy, r.fecha_fin);
        return d >= 0 && d <= 60;
      });
      const polizas_pendientes = rows.filter(
        (r) => r.requiere_poliza && r.estado_poliza !== "vigente",
      );
      const corte = "2026-05-30";
      const registrados_desde_corte = rows.filter((r) => r.fecha_registro >= corte);

      const md = [
        "# Alertas de contratos",
        "",
        `Fecha de referencia: **${args.hoy}**`,
        "",
        "## Vencen en ≤ 60 días",
        "",
        ...vencen.map(
          (r) =>
            `- ${r.id_contrato} · ${r.cliente} · fin ${r.fecha_fin} · ${r.comercial}`,
        ),
        "",
        "## Pólizas requeridas no vigentes",
        "",
        ...polizas_pendientes.map(
          (r) =>
            `- ${r.id_contrato} · ${r.cliente} · estado ${r.estado_poliza} · ${r.tipo_poliza}`,
        ),
        "",
        "## Registrados desde 2026-05-30 (gap)",
        "",
        ...registrados_desde_corte.map(
          (r) =>
            `- ${r.id_contrato} · registro ${r.fecha_registro} · fuente ${r.fuente}`,
        ),
        "",
      ].join("\n");

      const ruta = resolveFromRoot(ctx.directory, ALERTAS_REL);
      await fs.writeFile(ruta, md, "utf8");

      await appendToolLog(ctx.directory, {
        herramienta: "contratos_alertas",
        ok: true,
        resumen: `${vencen.length} vencimientos, ${polizas_pendientes.length} pólizas`,
      });

      return toolJson({
        ok: true,
        data: {
          ruta: ALERTAS_REL.replace(/\\/g, "/"),
          vencen,
          polizas_pendientes,
          registrados_desde_corte,
        },
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return toolJson({ ok: false, error });
    }
  },
};

export const contratosTools = {
  leer_buzon,
  extraer,
  validar,
  registrar,
  alertas,
} as const;

export type ContratosToolName = keyof typeof contratosTools;

export function parseToolResult(raw: string): { ok: boolean; data?: unknown; error?: string } {
  return JSON.parse(raw) as { ok: boolean; data?: unknown; error?: string };
}
