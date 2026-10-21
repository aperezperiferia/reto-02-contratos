import fs from "node:fs/promises";
import path from "node:path";
import { BUZON_REL, PROCESADOS_REL, resolveFromRoot } from "../paths.js";
import type { CorreoFixture } from "./contrato-schema.js";

const ADJUNTOS_CONTRATO = new Set(["contrato.txt", "otrosi.txt"]);

export function adjuntoEsContrato(nombre: string): boolean {
  return ADJUNTOS_CONTRATO.has(nombre.toLowerCase());
}

export async function readProcesados(directory: string): Promise<Record<string, string>> {
  const filePath = resolveFromRoot(directory, PROCESADOS_REL);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function markProcesado(
  directory: string,
  mensajeId: string,
): Promise<void> {
  const procesados = await readProcesados(directory);
  procesados[mensajeId] = new Date().toISOString();
  const filePath = resolveFromRoot(directory, PROCESADOS_REL);
  await fs.writeFile(filePath, JSON.stringify(procesados, null, 2) + "\n", "utf8");
}

export async function listBuzonMessageIds(directory: string): Promise<string[]> {
  const buzonPath = resolveFromRoot(directory, BUZON_REL);
  const entries = await fs.readdir(buzonPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("msg-"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function readCorreo(directory: string, mensajeId: string): Promise<CorreoFixture> {
  const filePath = path.join(resolveFromRoot(directory, BUZON_REL), mensajeId, "correo.json");
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as CorreoFixture;
}

export async function readAdjuntoTexto(
  directory: string,
  mensajeId: string,
  nombreAdjunto: string,
): Promise<string> {
  const filePath = path.join(
    resolveFromRoot(directory, BUZON_REL),
    mensajeId,
    nombreAdjunto,
  );
  return fs.readFile(filePath, "utf8");
}

export function primerAdjuntoContrato(correo: CorreoFixture): string | null {
  for (const adj of correo.adjuntos) {
    if (adjuntoEsContrato(adj)) return adj;
  }
  return null;
}
