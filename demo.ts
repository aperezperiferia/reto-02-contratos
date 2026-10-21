import { createToolContext } from "./src/context.js";
import { initOutDirectory } from "./src/init-out.js";
import {
  alertas,
  extraer,
  leer_buzon,
  parseToolResult,
  registrar,
  validar,
} from "./src/tools/contratos.js";
import type { Clasificacion, ContratoExtraido } from "./src/tools/contrato-schema.js";

const HOY = "2026-09-03";
const FECHA_REGISTRO = HOY;

type ValidacionData = {
  clasificacion: Clasificacion;
  requiere_revision: string[];
  comercial?: string;
  motivo?: string;
};

async function main(): Promise<void> {
  const ctx = createToolContext("demo");
  await initOutDirectory(ctx.directory);

  console.log("=== Demo reto-02 — procesamiento del buzón ===\n");
  console.log(`Fecha referencia: ${HOY}\n`);

  const pendientesConfirmacion: Array<{
    mensaje_id: string;
    contrato: ContratoExtraido;
    validacion: ValidacionData;
  }> = [];

  const buzonRaw = await leer_buzon.execute({}, ctx);
  const buzon = parseToolResult(buzonRaw);
  if (!buzon.ok || !buzon.data) {
    console.error("Error leyendo buzón:", buzon.error);
    process.exit(1);
  }

  const mensajes = (buzon.data as { mensajes: Array<{ id: string; tiene_contrato: boolean }> })
    .mensajes;

  for (const msg of mensajes) {
    console.log(`--- ${msg.id} ---`);

    let contrato: ContratoExtraido | null = null;
    if (msg.tiene_contrato) {
      const extRaw = await extraer.execute({ mensaje_id: msg.id }, ctx);
      const ext = parseToolResult(extRaw);
      if (!ext.ok) {
        console.log(`  extraer: ERROR — ${ext.error}`);
        continue;
      }
      contrato = ext.data as ContratoExtraido;
      console.log(
        `  extraer: id=${contrato.id_contrato.valor} valor=${contrato.valor.valor} fin=${contrato.fecha_fin.valor}`,
      );
    }

    const valRaw = await validar.execute(
      { mensaje_id: msg.id, contrato: contrato ?? {} },
      ctx,
    );
    const val = parseToolResult(valRaw);
    if (!val.ok || !val.data) {
      console.log(`  validar: ERROR — ${val.error}`);
      continue;
    }
    const validacion = val.data as ValidacionData;
    console.log(`  validar: ${validacion.clasificacion}`);
    if (validacion.motivo) console.log(`           motivo: ${validacion.motivo}`);
    if (validacion.requiere_revision.length) {
      console.log(`           revisión: ${validacion.requiere_revision.join(", ")}`);
    }

    if (
      validacion.clasificacion === "nuevo" ||
      validacion.clasificacion === "actualizacion"
    ) {
      if (validacion.requiere_revision.length > 0) {
        console.log("  registrar: omitido (requiere confirmación humana)");
        if (contrato) {
          pendientesConfirmacion.push({ mensaje_id: msg.id, contrato, validacion });
        }
        console.log("");
        continue;
      }
    }

    const regRaw = await registrar.execute(
      {
        mensaje_id: msg.id,
        contrato: contrato ?? {},
        clasificacion: validacion.clasificacion,
        comercial: validacion.comercial,
        fecha_registro: FECHA_REGISTRO,
      },
      ctx,
    );
    const reg = parseToolResult(regRaw);
    if (!reg.ok) {
      console.log(`  registrar: ERROR — ${reg.error}`);
    } else {
      const data = reg.data as { accion: string; id_contrato: string | null; ruta_archivo: string | null };
      console.log(`  registrar: ${data.accion} ${data.id_contrato ?? ""} ${data.ruta_archivo ?? ""}`.trim());
    }
    console.log("");
  }

  if (pendientesConfirmacion.length > 0) {
    const pending = pendientesConfirmacion[0];
    console.log("=== Segunda pasada (confirmado=true) ===\n");
    console.log(`Confirmando ${pending.mensaje_id}…\n`);

    const regRaw = await registrar.execute(
      {
        mensaje_id: pending.mensaje_id,
        contrato: pending.contrato,
        confirmado: true,
        clasificacion: pending.validacion.clasificacion,
        comercial: pending.validacion.comercial,
        fecha_registro: FECHA_REGISTRO,
      },
      ctx,
    );
    const reg = parseToolResult(regRaw);
    if (!reg.ok) {
      console.log(`  registrar: ERROR — ${reg.error}`);
    } else {
      const data = reg.data as { accion: string; id_contrato: string; ruta_archivo: string };
      console.log(`  registrar: ${data.accion} ${data.id_contrato} → ${data.ruta_archivo}`);
    }
    console.log("");
  }

  const alertRaw = await alertas.execute({ hoy: HOY }, ctx);
  const alertRes = parseToolResult(alertRaw);
  if (alertRes.ok && alertRes.data) {
    const data = alertRes.data as { ruta: string; vencen: unknown[]; polizas_pendientes: unknown[] };
    console.log(`=== Alertas ===`);
    console.log(`Generado: ${data.ruta}`);
    console.log(`  vencen ≤60d: ${data.vencen.length}`);
    console.log(`  pólizas pendientes: ${data.polizas_pendientes.length}`);
  }

  console.log("\nDemo finalizada.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
