import fs from "node:fs/promises";
import path from "node:path";
import { camposEnRevision } from "../src/tools/contrato-schema.js";
import { extraerDesdeTexto } from "../src/tools/extract.js";

const root = process.cwd();
const ids = ["msg-001", "msg-002", "msg-003", "msg-004", "msg-006"];

for (const id of ids) {
  const dir = path.join(root, "fixtures/reto-02/buzon", id);
  const files = await fs.readdir(dir);
  const adj = files.find((f) => f.endsWith(".txt"));
  if (!adj) continue;
  const t = await fs.readFile(path.join(dir, adj), "utf8");
  const c = extraerDesdeTexto(t, adj);
  console.log(`=== ${id} (${adj}) ===`);
  const fields = [
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
  ] as const;
  for (const f of fields) {
    const x = c[f];
    const val =
      f === "objeto" && typeof x.valor === "string"
        ? x.valor.slice(0, 60) + (x.valor.length > 60 ? "…" : "")
        : x.valor;
    console.log(`  ${f}: ${JSON.stringify(val)} (conf ${x.confianza})`);
  }
  console.log(`  valor_indeterminado: ${c.valor_indeterminado.valor}`);
  console.log(`  revisión: ${camposEnRevision(c).join(", ") || "—"}`);
  console.log("");
}
