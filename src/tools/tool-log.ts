import fs from "node:fs/promises";
import { LOG_REL, resolveFromRoot } from "../paths.js";

export async function appendToolLog(
  directory: string,
  entry: {
    herramienta: string;
    mensaje_id?: string;
    ok: boolean;
    resumen: string;
  },
): Promise<void> {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  const path = resolveFromRoot(directory, LOG_REL);
  await fs.mkdir(resolveFromRoot(directory, "out"), { recursive: true });
  await fs.appendFile(path, line + "\n", "utf8");
}
