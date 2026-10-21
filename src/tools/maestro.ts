import fs from "node:fs/promises";
import type { MaestroRow } from "./contrato-schema.js";
import { MAESTRO_OUT_REL, resolveFromRoot } from "../paths.js";

const CSV_HEADERS = [
  "id_contrato",
  "cliente",
  "nit_cliente",
  "pais",
  "objeto",
  "valor",
  "moneda",
  "fecha_inicio",
  "fecha_fin",
  "requiere_poliza",
  "tipo_poliza",
  "estado_poliza",
  "comercial",
  "ruta_sharepoint",
  "fecha_registro",
  "fuente",
] as const;

function parseBool(raw: string): boolean {
  return raw.trim().toLowerCase() === "true";
}

function rowFromLine(line: string): MaestroRow {
  const parts = line.split(",");
  if (parts.length < CSV_HEADERS.length) {
    throw new Error(`Fila CSV inválida: ${line}`);
  }
  const [
    id_contrato,
    cliente,
    nit_cliente,
    pais,
    objeto,
    valor,
    moneda,
    fecha_inicio,
    fecha_fin,
    requiere_poliza,
    tipo_poliza,
    estado_poliza,
    comercial,
    ruta_sharepoint,
    fecha_registro,
    fuente,
  ] = parts;
  return {
    id_contrato,
    cliente,
    nit_cliente,
    pais: pais as MaestroRow["pais"],
    objeto,
    valor: Number(valor),
    moneda: moneda as MaestroRow["moneda"],
    fecha_inicio,
    fecha_fin,
    requiere_poliza: parseBool(requiere_poliza),
    tipo_poliza,
    estado_poliza: estado_poliza as MaestroRow["estado_poliza"],
    comercial,
    ruta_sharepoint,
    fecha_registro,
    fuente: fuente as MaestroRow["fuente"],
  };
}

function lineFromRow(row: MaestroRow): string {
  return [
    row.id_contrato,
    row.cliente,
    row.nit_cliente,
    row.pais,
    row.objeto,
    String(row.valor),
    row.moneda,
    row.fecha_inicio,
    row.fecha_fin,
    String(row.requiere_poliza),
    row.tipo_poliza,
    row.estado_poliza,
    row.comercial,
    row.ruta_sharepoint,
    row.fecha_registro,
    row.fuente,
  ].join(",");
}

export async function readMaestro(directory: string): Promise<MaestroRow[]> {
  const path = resolveFromRoot(directory, MAESTRO_OUT_REL);
  const raw = await fs.readFile(path, "utf8");
  const lines = raw.trim().split(/\r?\n/);
  return lines.slice(1).filter(Boolean).map(rowFromLine);
}

export async function writeMaestro(directory: string, rows: MaestroRow[]): Promise<void> {
  const path = resolveFromRoot(directory, MAESTRO_OUT_REL);
  const body = [CSV_HEADERS.join(","), ...rows.map(lineFromRow)].join("\n") + "\n";
  await fs.writeFile(path, body, "utf8");
}

export function findById(rows: MaestroRow[], id: string): MaestroRow | undefined {
  return rows.find((r) => r.id_contrato === id);
}
