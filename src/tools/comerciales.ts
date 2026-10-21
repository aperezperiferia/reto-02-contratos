import fs from "node:fs/promises";
import { COMERCIALES_REL, resolveFromRoot } from "../paths.js";

type Comercial = { email: string; nombre: string; region: string };

export async function resolverComercial(
  directory: string,
  email: string,
): Promise<{ nombre: string; conocido: boolean }> {
  const raw = await fs.readFile(resolveFromRoot(directory, COMERCIALES_REL), "utf8");
  const list = JSON.parse(raw) as Comercial[];
  const found = list.find((c) => c.email.toLowerCase() === email.toLowerCase());
  if (found) return { nombre: found.nombre, conocido: true };
  return { nombre: email, conocido: false };
}
