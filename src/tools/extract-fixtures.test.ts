import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { camposEnRevision } from "./contrato-schema.js";
import { extraerDesdeTexto } from "./extract.js";

async function loadAdjunto(mensajeId: string): Promise<{ nombre: string; texto: string }> {
  const dir = path.join(process.cwd(), "fixtures/reto-02/buzon", mensajeId);
  const files = await fs.readdir(dir);
  const nombre = files.find((f) => f.endsWith(".txt"));
  assert.ok(nombre, `sin adjunto txt en ${mensajeId}`);
  const texto = await fs.readFile(path.join(dir, nombre), "utf8");
  return { nombre, texto };
}

test("msg-001 contrato completo con póliza", async () => {
  const { nombre, texto } = await loadAdjunto("msg-001");
  const c = extraerDesdeTexto(texto, nombre);
  assert.equal(c.id_contrato.valor, "CT-2026-015");
  assert.equal(c.nit_cliente.valor, "890900111");
  assert.equal(c.pais.valor, "CO");
  assert.equal(c.valor.valor, 265_000_000);
  assert.equal(c.moneda.valor, "COP");
  assert.equal(c.fecha_inicio.valor, "2026-08-01");
  assert.equal(c.fecha_fin.valor, "2027-07-31");
  assert.equal(c.requiere_poliza.valor, true);
  assert.equal(c.tipo_poliza.valor, "cumplimiento");
  assert.deepEqual(camposEnRevision(c), []);
});

test("msg-002 Ecuador USD sin póliza", async () => {
  const { nombre, texto } = await loadAdjunto("msg-002");
  const c = extraerDesdeTexto(texto, nombre);
  assert.equal(c.id_contrato.valor, "CT-2026-016");
  assert.equal(c.pais.valor, "EC");
  assert.equal(c.valor.valor, 120_000);
  assert.equal(c.moneda.valor, "USD");
  assert.equal(c.fecha_inicio.valor, "2026-08-15");
  assert.equal(c.fecha_fin.valor, "2027-08-14");
  assert.equal(c.requiere_poliza.valor, false);
  assert.deepEqual(camposEnRevision(c), []);
});

test("msg-003 otrosí CT-2026-011", async () => {
  const { nombre, texto } = await loadAdjunto("msg-003");
  const c = extraerDesdeTexto(texto, nombre);
  assert.equal(c.es_otrosi, true);
  assert.equal(c.id_contrato.valor, "CT-2026-011");
  assert.equal(c.pais.valor, "PE");
  assert.equal(c.valor.valor, 520_000);
  assert.equal(c.moneda.valor, "PEN");
  assert.equal(c.fecha_fin.valor, "2027-11-01");
  assert.equal(c.requiere_poliza.valor, false);
  assert.deepEqual(camposEnRevision(c), []);
});

test("msg-004 coincide con maestro CT-2026-012", async () => {
  const { nombre, texto } = await loadAdjunto("msg-004");
  const c = extraerDesdeTexto(texto, nombre);
  assert.equal(c.id_contrato.valor, "CT-2026-012");
  assert.equal(c.valor.valor, 210_000_000);
  assert.equal(c.fecha_inicio.valor, "2026-05-15");
  assert.equal(c.fecha_fin.valor, "2026-11-14");
  assert.deepEqual(camposEnRevision(c), []);
});

test("msg-006 marco valor indeterminado requiere revisión", async () => {
  const { nombre, texto } = await loadAdjunto("msg-006");
  const c = extraerDesdeTexto(texto, nombre);
  assert.equal(c.id_contrato.valor, "CM-2026-03");
  assert.equal(c.valor_indeterminado.valor, true);
  assert.equal(c.valor.valor, 0);
  assert.equal(c.fecha_fin.valor, "2027-08-31");
  const rev = camposEnRevision(c);
  assert.ok(rev.includes("valor"));
  assert.ok(rev.includes("fecha_fin"));
  assert.ok(rev.includes("fecha_inicio"));
});

test("cotización no parece contrato", async () => {
  const { nombre, texto } = await loadAdjunto("msg-005");
  const { textoPareceContrato } = await import("./extract.js");
  assert.equal(textoPareceContrato(texto), false);
  assert.match(nombre, /cotizacion/i);
});
