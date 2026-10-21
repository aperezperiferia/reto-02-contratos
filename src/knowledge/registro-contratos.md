# Registro de contratos vigentes — conocimiento operativo

## Fuentes de datos

| Recurso | Ruta | Uso |
|---------|------|-----|
| Buzón (solo lectura) | `fixtures/reto-02/buzon/<msg-id>/` | `correo.json` + adjuntos `.txt` |
| Maestro congelado | `fixtures/reto-02/maestro-contratos.csv` | Copiado a `out/sharepoint/` al iniciar |
| Maestro de trabajo | `out/sharepoint/maestro-contratos.csv` | Única tabla que se escribe |
| Comerciales | `fixtures/reto-02/comerciales.json` | Resolver remitente del correo |
| Procesados | `out/procesados.json` | Mensajes ya atendidos |
| Historial | `out/sharepoint/historial.jsonl` | Cambios por actualización |
| Log herramientas | `out/log.jsonl` | Auditoría CA4 |
| Alertas | `out/alertas.md` | Reporte gerencial |

## Flujo estándar por mensaje

1. `contratos_leer_buzon` — lista pendientes (`tiene_contrato` según adjunto `contrato.txt` u `otrosi.txt`).
2. `contratos_extraer` — regex/heurísticas sobre el `.txt`; confianza por campo.
3. `contratos_validar` — RN1–RN4, `requiere_revision` si confianza &lt; 0.8.
4. `contratos_registrar` — escribe solo si no hay revisión pendiente o `confirmado: true`.
5. Tras el lote: `contratos_alertas` con `{ hoy: "YYYY-MM-DD" }`.

## Clasificaciones (RN1–RN4)

- **nuevo**: sin coincidencia en maestro.
- **actualización**: mismo `id_contrato`, otrosí, o NIT+objeto muy similar.
- **duplicado**: mismo id y mismos valor, fecha_inicio, fecha_fin.
- **rechazado**: sin contrato (p. ej. cotización) o texto ilegible.

## Revisión humana (RN5)

Campos con confianza &lt; 0.8 → `requiere_revision`. El agente **pregunta** antes de `confirmado: true`. Caso típico: contrato marco sin valor fijo y plazo inferido (`msg-006`).

## Gobierno (resumen)

Canal único **contratos@periferia-ficticia.com**, administrado por Analista de Contratos (Administración). Comerciales deben enviar PDF firmado u otrosí en **5 días hábiles** con asunto `[CONTRATO] Cliente — ID`. Acuse automático en **24 h**. Detalle completo en `SOLUCION.md` §6.

## Adaptador mock

Si no hay `OPENAI_API_KEY`, el backend usa **mock** (`src/llm/mock.ts`): mismo flujo de herramientas que `demo.ts`, útil para defensa sin costo de API.
