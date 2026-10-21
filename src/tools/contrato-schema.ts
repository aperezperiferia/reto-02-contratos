export type Pais = "CO" | "EC" | "PE" | "PA" | "HN";
export type Moneda = "COP" | "USD" | "PEN" | "PAB" | "HNL";
export type EstadoPoliza = "vigente" | "pendiente" | "vencida" | "no_aplica";
export type Clasificacion = "nuevo" | "actualizacion" | "duplicado" | "rechazado";

export type Campo<T> = {
  valor: T;
  confianza: number;
};

export type ContratoExtraido = {
  id_contrato: Campo<string | null>;
  cliente: Campo<string | null>;
  nit_cliente: Campo<string | null>;
  pais: Campo<Pais | null>;
  objeto: Campo<string | null>;
  valor: Campo<number | null>;
  valor_indeterminado: Campo<boolean>;
  moneda: Campo<Moneda | null>;
  fecha_inicio: Campo<string | null>;
  fecha_fin: Campo<string | null>;
  requiere_poliza: Campo<boolean>;
  tipo_poliza: Campo<string | null>;
  es_otrosi: boolean;
  texto_adjunto: string;
  adjunto_nombre: string | null;
};

export type ContratoPlano = {
  id_contrato: string;
  cliente: string;
  nit_cliente: string;
  pais: Pais;
  objeto: string;
  valor: number;
  moneda: Moneda;
  fecha_inicio: string;
  fecha_fin: string;
  requiere_poliza: boolean;
  tipo_poliza: string;
  estado_poliza: EstadoPoliza;
  comercial: string;
  ruta_sharepoint: string;
  fecha_registro: string;
  fuente: "buzon" | "manual" | "migracion";
};

export type MaestroRow = ContratoPlano;

export type CorreoFixture = {
  id: string;
  de: string;
  para: string;
  asunto: string;
  fecha: string;
  cuerpo: string;
  adjuntos: string[];
};

export const CONFIANZA_REVISION = 0.8;

export function campo<T>(valor: T, confianza: number): Campo<T> {
  return { valor, confianza: Math.max(0, Math.min(1, confianza)) };
}

export function flattenContrato(
  c: ContratoExtraido,
  overrides: Partial<ContratoPlano> = {},
): Partial<ContratoPlano> {
  const valor = c.valor_indeterminado.valor ? 0 : (c.valor.valor ?? 0);
  return {
    id_contrato: c.id_contrato.valor ?? undefined,
    cliente: c.cliente.valor ?? undefined,
    nit_cliente: c.nit_cliente.valor ?? undefined,
    pais: c.pais.valor ?? undefined,
    objeto: c.objeto.valor ? c.objeto.valor.slice(0, 200) : undefined,
    valor,
    moneda: c.moneda.valor ?? undefined,
    fecha_inicio: c.fecha_inicio.valor ?? undefined,
    fecha_fin: c.fecha_fin.valor ?? undefined,
    requiere_poliza: c.requiere_poliza.valor,
    tipo_poliza: c.tipo_poliza.valor ?? "",
    ...overrides,
  };
}

export function camposEnRevision(c: ContratoExtraido): string[] {
  const skipIfOtrosi = new Set([
    "objeto",
    "fecha_inicio",
    "cliente",
    "nit_cliente",
    "pais",
    "moneda",
  ]);
  const entries: Array<[string, Campo<unknown>]> = [
    ["id_contrato", c.id_contrato],
    ["cliente", c.cliente],
    ["nit_cliente", c.nit_cliente],
    ["pais", c.pais],
    ["objeto", c.objeto],
    ["valor", c.valor],
    ["moneda", c.moneda],
    ["fecha_inicio", c.fecha_inicio],
    ["fecha_fin", c.fecha_fin],
    ["requiere_poliza", c.requiere_poliza],
    ["tipo_poliza", c.tipo_poliza],
  ];
  const out: string[] = [];
  for (const [name, field] of entries) {
    if (c.es_otrosi && skipIfOtrosi.has(name)) continue;
    if (field.confianza < CONFIANZA_REVISION) {
      out.push(name);
    }
  }
  return out;
}
