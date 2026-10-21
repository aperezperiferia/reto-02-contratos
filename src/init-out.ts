import fs from "node:fs/promises";
import path from "node:path";
import {
  CONTRATOS_OUT_REL,
  HISTORIAL_REL,
  MAESTRO_FIXTURE_REL,
  MAESTRO_OUT_REL,
  OUT_REL,
  PROCESADOS_REL,
  resolveFromRoot,
} from "./paths.js";

/**
 * Prepara out/ para una ejecución determinista: recrea la carpeta, copia el maestro
 * desde fixtures (RN6) e inicializa archivos de estado vacíos.
 */
export async function initOutDirectory(directory: string): Promise<void> {
  const outPath = resolveFromRoot(directory, OUT_REL);
  await fs.rm(outPath, { recursive: true, force: true });
  await fs.mkdir(resolveFromRoot(directory, CONTRATOS_OUT_REL), { recursive: true });

  const maestroSrc = resolveFromRoot(directory, MAESTRO_FIXTURE_REL);
  const maestroDst = resolveFromRoot(directory, MAESTRO_OUT_REL);
  await fs.mkdir(path.dirname(maestroDst), { recursive: true });
  await fs.copyFile(maestroSrc, maestroDst);

  await fs.writeFile(resolveFromRoot(directory, PROCESADOS_REL), "{}\n", "utf8");
  await fs.writeFile(resolveFromRoot(directory, HISTORIAL_REL), "", "utf8");
}

export async function ensureSharepointMaestro(directory: string): Promise<void> {
  const maestroDst = resolveFromRoot(directory, MAESTRO_OUT_REL);
  try {
    await fs.access(maestroDst);
  } catch {
    await initOutDirectory(directory);
  }
}
