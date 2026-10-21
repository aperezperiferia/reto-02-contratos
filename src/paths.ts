import path from "node:path";

/** Rutas relativas bajo la raíz del proyecto (fixtures / out). */
export const FIXTURES_REL = path.join("fixtures", "reto-02");
export const OUT_REL = "out";
export const MAESTRO_FIXTURE_REL = path.join(FIXTURES_REL, "maestro-contratos.csv");
export const MAESTRO_OUT_REL = path.join(OUT_REL, "sharepoint", "maestro-contratos.csv");
export const BUZON_REL = path.join(FIXTURES_REL, "buzon");
export const SHAREPOINT_OUT_REL = path.join(OUT_REL, "sharepoint");
export const CONTRATOS_OUT_REL = path.join(SHAREPOINT_OUT_REL, "Contratos");
export const PROCESADOS_REL = path.join(OUT_REL, "procesados.json");
export const LOG_REL = path.join(OUT_REL, "log.jsonl");
export const HISTORIAL_REL = path.join(SHAREPOINT_OUT_REL, "historial.jsonl");
export const ALERTAS_REL = path.join(OUT_REL, "alertas.md");
export const COMERCIALES_REL = path.join(FIXTURES_REL, "comerciales.json");

export function resolveFromRoot(directory: string, ...segments: string[]): string {
  return path.resolve(directory, ...segments);
}
