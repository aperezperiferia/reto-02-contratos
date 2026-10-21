import type { ContratoExtraido, Moneda, Pais } from "./contrato-schema.js";
import { campo } from "./contrato-schema.js";

const MESES: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

/** Parte introductoria: solo el contratante (cliente), antes de Periferia. */
export function bloqueContratante(texto: string): string {
  const parts = texto.split(/PERIFERIA IT GROUP/i);
  return (parts[0] ?? texto).trim();
}

function inferPaisDesdeBloque(bloque: string, nit: string | null): { pais: Pais | null; confianza: number } {
  const t = bloque.toLowerCase();

  if (t.includes("ecuador") || t.includes("quito")) {
    return { pais: "EC", confianza: 0.94 };
  }
  if (t.includes("perú") || t.includes("peru") || t.includes("lima")) {
    return { pais: "PE", confianza: 0.94 };
  }
  if (t.includes("panamá") || t.includes("panama")) {
    return { pais: "PA", confianza: 0.92 };
  }
  if (t.includes("honduras")) {
    return { pais: "HN", confianza: 0.92 };
  }
  if (/\bnit\b/i.test(bloque) || t.includes("colombia") || t.includes("bogotá") || t.includes("medellín") || t.includes("barranquilla")) {
    return { pais: "CO", confianza: 0.9 };
  }
  if (nit && /^\d{11,13}$/.test(nit) && /\bruc\b/i.test(bloque)) {
    return { pais: "EC", confianza: 0.75 };
  }
  if (nit && /^\d{11}$/.test(nit) && /\bruc\b/i.test(bloque)) {
    return { pais: "PE", confianza: 0.75 };
  }
  return { pais: null, confianza: 0 };
}

function parseNumeroMoneda(texto: string): { valor: number | null; moneda: Moneda | null } {
  const cop = texto.match(/COP\s*\$?\s*([\d.,]+)/i);
  if (cop) {
    const n = Number(cop[1].replace(/\./g, "").replace(",", "."));
    return { valor: Number.isFinite(n) ? n : null, moneda: "COP" };
  }
  const usd = texto.match(/USD\s*([\d,]+(?:\.\d+)?)/i);
  if (usd) {
    const n = Number(usd[1].replace(/,/g, ""));
    return { valor: Number.isFinite(n) ? n : null, moneda: "USD" };
  }
  const pen = texto.match(/PEN\s*([\d,]+(?:\.\d+)?)/i);
  if (pen) {
    const n = Number(pen[1].replace(/,/g, ""));
    return { valor: Number.isFinite(n) ? n : null, moneda: "PEN" };
  }
  return { valor: null, moneda: null };
}

function parseFechaExplicita(d: number, mes: string, anio: number): string | null {
  const m = MESES[mes.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")];
  if (!m || d < 1 || d > 31) return null;
  return `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function ultimoDiaMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

function addMonths(anio: number, mes: number, delta: number): { anio: number; mes: number } {
  const idx = anio * 12 + (mes - 1) + delta;
  return { anio: Math.floor(idx / 12), mes: (idx % 12) + 1 };
}

function extraerId(texto: string): { id: string | null; confianza: number } {
  if (/OTROSÍ/i.test(texto)) {
    const ref =
      texto.match(/CONTRATO[^N]*No\.\s*(CT-\d{4}-\d+)/i) ??
      texto.match(/contrato No\.\s*(CT-\d{4}-\d+)/i);
    if (ref) return { id: ref[1].toUpperCase(), confianza: 0.96 };
  }
  const m = texto.match(/No\.\s*(CM-\d{4}-\d+|CT-\d{4}-\d+)/i);
  if (m) return { id: m[1].toUpperCase(), confianza: 0.96 };
  return { id: null, confianza: 0 };
}

function extraerCliente(bloque: string): { cliente: string | null; confianza: number } {
  const entre = bloque.match(
    /Entre(?: los suscritos,)?\s+([^,]+?),\s*(?:identificada|identificado|NIT|RUC)/is,
  );
  if (entre) {
    return { cliente: entre[1].trim().replace(/\s+/g, " "), confianza: 0.93 };
  }
  return { cliente: null, confianza: 0 };
}

function extraerNit(bloque: string): { nit: string | null; confianza: number } {
  const nit = bloque.match(/NIT\s*([\d.\s-]+)/i);
  if (nit) {
    let s = nit[1].replace(/\s/g, "");
    if (s.includes("-")) s = s.split("-")[0] ?? s;
    else s = s.replace(/\./g, "");
    const digits = s.replace(/\D/g, "");
    return { nit: digits || null, confianza: 0.92 };
  }
  const ruc = bloque.match(/RUC\s*(\d+)/i);
  if (ruc) return { nit: ruc[1], confianza: 0.92 };
  return { nit: null, confianza: 0 };
}

function limpiarObjeto(raw: string): string {
  let o = raw.trim().replace(/\s+/g, " ");
  o = o.replace(/^EL CONTRATISTA\s+(se obliga a|prestará|prestara)\s+/i, "");
  o = o.replace(/^Establecer las condiciones generales bajo las cuales EL CONTRATISTA\s+/i, "Condiciones marco: ");
  return o.slice(0, 200);
}

function extraerObjeto(texto: string, esOtrosi: boolean): { objeto: string | null; confianza: number } {
  if (esOtrosi) {
    return { objeto: null, confianza: 0 };
  }
  const m = texto.match(/PRIMERA\.\s*OBJETO\.\s*(.+?)(?=\n\n|\nSEGUNDA)/is);
  if (m) return { objeto: limpiarObjeto(m[1]), confianza: 0.94 };
  return { objeto: null, confianza: 0 };
}

function extraerValorYMoneda(texto: string, esOtrosi: boolean): {
  valor: number | null;
  moneda: Moneda | null;
  indeterminado: boolean;
  confianzaValor: number;
  confianzaMoneda: number;
} {
  if (/no tiene un valor determinado/i.test(texto)) {
    return {
      valor: 0,
      moneda: "COP",
      indeterminado: true,
      /** Texto claro sobre indeterminación; el 0 es convención RN, no un monto leído. */
      confianzaValor: 0.62,
      confianzaMoneda: 0.9,
    };
  }
  if (esOtrosi) {
    const valClause = texto.match(/cláusula SEGUNDA\s*\(VALOR\)[^"]*"([^"]+)"/is);
    if (valClause) {
      const parsed = parseNumeroMoneda(valClause[1]);
      return {
        valor: parsed.valor,
        moneda: parsed.moneda,
        indeterminado: false,
        confianzaValor: parsed.valor != null ? 0.94 : 0,
        confianzaMoneda: parsed.moneda ? 0.94 : 0,
      };
    }
  }
  const valSec = texto.match(/SEGUNDA\.\s*VALOR\.\s*(.+?)(?=\n\n|\nTERCERA)/is);
  if (valSec) {
    const parsed = parseNumeroMoneda(valSec[1]);
    return {
      valor: parsed.valor,
      moneda: parsed.moneda,
      indeterminado: false,
      confianzaValor: parsed.valor != null ? 0.95 : 0,
      confianzaMoneda: parsed.moneda ? 0.95 : 0,
    };
  }
  return {
    valor: null,
    moneda: null,
    indeterminado: false,
    confianzaValor: 0,
    confianzaMoneda: 0,
  };
}

function extraerRangoPlazo(texto: string): {
  inicio: string | null;
  fin: string | null;
  confInicio: number;
  confFin: number;
} | null {
  const rango = texto.match(
    /desde el .+?\((\d+)\)\s*de\s+(\w+)\s+de\s+(\d{4})\s+hasta el .+?\((\d+)\)\s*de\s+(\w+)\s+de\s+(\d{4})/i,
  );
  if (!rango) return null;
  const inicio = parseFechaExplicita(Number(rango[1]), rango[2], Number(rango[3]));
  const fin = parseFechaExplicita(Number(rango[4]), rango[5], Number(rango[6]));
  if (!inicio || !fin) return null;
  return { inicio, fin, confInicio: 0.96, confFin: 0.96 };
}

function extraerPlazoMarcoMeses(texto: string): {
  inicio: string | null;
  fin: string | null;
  confInicio: number;
  confFin: number;
} | null {
  const mesesDuracion = texto.match(/duración de (\w+|\d+) \((\d+)\) meses/i);
  const firmaMes = texto.match(/(?:mes de|en el mes de)\s+(\w+)\s+de\s+(\d{4})/i);
  const inicioExplicito = texto.match(
    /contados a partir de la fecha de su firma|a partir de la fecha de su firma/i,
  );
  if (!mesesDuracion || !firmaMes) return null;

  const nMeses = Number(mesesDuracion[2]);
  const mes = MESES[firmaMes[1].toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")];
  const anio = Number(firmaMes[2]);
  if (!mes) return null;

  /** Sin día de firma explícito: primer día del mes como ancla conservadora. */
  const inicio = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const finPoint = addMonths(anio, mes, nMeses);
  const fin = `${finPoint.anio}-${String(finPoint.mes).padStart(2, "0")}-${String(
    ultimoDiaMes(finPoint.anio, finPoint.mes),
  ).padStart(2, "0")}`;

  const conf = inicioExplicito ? 0.68 : 0.72;
  return { inicio, fin, confInicio: conf, confFin: conf };
}

function extraerPlazo(
  texto: string,
  esOtrosi: boolean,
): {
  inicio: string | null;
  fin: string | null;
  confInicio: number;
  confFin: number;
} {
  if (esOtrosi) {
    const plazo = texto.match(/cláusula TERCERA\s*\(PLAZO\)[^"]*"([^"]+)"/is);
    if (plazo) {
      const ext = plazo[1].match(/hasta el primero \(1\) de (\w+) de (\d{4})/i);
      if (ext) {
        const fin = parseFechaExplicita(1, ext[1], Number(ext[2]));
        return { inicio: null, fin, confInicio: 0, confFin: fin ? 0.95 : 0 };
      }
    }
  }

  const rango = extraerRangoPlazo(texto);
  if (rango) return rango;

  const marco = extraerPlazoMarcoMeses(texto);
  if (marco) return marco;

  return { inicio: null, fin: null, confInicio: 0, confFin: 0 };
}

function extraerPoliza(texto: string, esOtrosi: boolean): {
  requiere: boolean;
  tipos: string | null;
  confianza: number;
} {
  if (esOtrosi) {
    const modificaGarantias = /Modificar la cláusula.*(?:GARANT|SEXTA)/i.test(texto);
    if (!modificaGarantias) {
      return { requiere: false, tipos: "", confianza: 0.93 };
    }
  }

  const lower = texto.toLowerCase();
  if (/no tiene un valor determinado/i.test(texto) && /para cada orden/i.test(lower)) {
    return { requiere: false, tipos: "", confianza: 0.9 };
  }

  const clausulaGarantias = texto.match(
    /(?:SEXTA|QUINTA|CUARTA)\.\s*GARANTÍAS\.\s*(.+?)(?=\n\n|\nSÉPTIMA|\nSEXTA|\nQUINTA|$)/is,
  );
  const bloquePoliza = clausulaGarantias?.[1] ?? "";
  const mencionaPoliza =
    /póliza|poliza/i.test(bloquePoliza) ||
    (/GARANTÍAS/i.test(texto) && /póliza|poliza|constituirá/i.test(texto) && !esOtrosi);

  if (!mencionaPoliza) {
    return { requiere: false, tipos: "", confianza: 0.93 };
  }

  const tipos: string[] = [];
  const scan = clausulaGarantias?.[1] ?? texto;
  if (/cumplimiento/i.test(scan)) tipos.push("cumplimiento");
  if (/calidad/i.test(scan)) tipos.push("calidad");
  if (/salarios/i.test(scan)) tipos.push("salarios_prestaciones");
  if (/responsabilidad civil/i.test(scan)) tipos.push("responsabilidad_civil");

  return {
    requiere: true,
    tipos: tipos.length ? tipos.join(";") : "cumplimiento",
    confianza: clausulaGarantias ? 0.94 : 0.82,
  };
}

export function extraerDesdeTexto(texto: string, adjuntoNombre: string | null): ContratoExtraido {
  const trimmed = texto.trim();
  if (!trimmed) {
    return emptyContrato("", adjuntoNombre);
  }

  const esOtrosi = /OTROSÍ/i.test(trimmed);
  const bloque = bloqueContratante(trimmed);
  const id = extraerId(trimmed);
  const cliente = extraerCliente(bloque);
  const nitRaw = extraerNit(bloque);
  const paisInfo = inferPaisDesdeBloque(bloque, nitRaw.nit);

  const objeto = extraerObjeto(trimmed, esOtrosi);
  const valorInfo = extraerValorYMoneda(trimmed, esOtrosi);
  const plazo = extraerPlazo(trimmed, esOtrosi);
  const poliza = extraerPoliza(trimmed, esOtrosi);

  return {
    id_contrato: campo(id.id, id.confianza),
    cliente: campo(cliente.cliente, cliente.confianza),
    nit_cliente: campo(nitRaw.nit, nitRaw.confianza),
    pais: campo(paisInfo.pais, paisInfo.confianza),
    objeto: campo(objeto.objeto, objeto.confianza),
    valor: campo(valorInfo.valor, valorInfo.confianzaValor),
    valor_indeterminado: campo(valorInfo.indeterminado, valorInfo.indeterminado ? 0.96 : 0.98),
    moneda: campo(valorInfo.moneda, valorInfo.confianzaMoneda),
    fecha_inicio: campo(plazo.inicio, plazo.confInicio),
    fecha_fin: campo(plazo.fin, plazo.confFin),
    requiere_poliza: campo(poliza.requiere, poliza.confianza),
    tipo_poliza: campo(poliza.tipos, poliza.requiere ? poliza.confianza : 0.96),
    es_otrosi: esOtrosi,
    texto_adjunto: trimmed,
    adjunto_nombre: adjuntoNombre,
  };
}

function emptyContrato(texto: string, adjunto: string | null): ContratoExtraido {
  return {
    id_contrato: campo(null, 0),
    cliente: campo(null, 0),
    nit_cliente: campo(null, 0),
    pais: campo(null, 0),
    objeto: campo(null, 0),
    valor: campo(null, 0),
    valor_indeterminado: campo(false, 0),
    moneda: campo(null, 0),
    fecha_inicio: campo(null, 0),
    fecha_fin: campo(null, 0),
    requiere_poliza: campo(false, 0),
    tipo_poliza: campo(null, 0),
    es_otrosi: false,
    texto_adjunto: texto,
    adjunto_nombre: adjunto,
  };
}

export function textoPareceContrato(texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (/^COTIZACIÓN/i.test(t)) return false;
  return /(CONTRATO|OTROSÍ)/i.test(t) && /(OBJETO|PRIMERA|cláusula)/i.test(t);
}
