# SOLUCION.md — Reto 02 · Registro de contratos vigentes

## 1. Problema en una frase

El maestro de contratos de Periferia está congelado y los comerciales solo envían una fracción de los contratos firmados; **duele a Administración y Gerencia** porque no hay visibilidad de vigencias, pólizas ni registro único.

## 2. Arquitectura

```
┌─────────────┐     /api      ┌──────────────────────────────────────┐
│ web/ (Vite) │ ◄──────────► │ src/server.ts                         │
│ React chat  │              │  · POST /api/chat                     │
└─────────────┘              │  · src/agent/cycle.ts (bucle agente)  │
                             │  · src/llm/* (OpenAI | mock)          │
                             └──────────────┬───────────────────────────┘
                                            │
                             ┌──────────────▼───────────────────────────┐
                             │ src/tools/contratos.ts (+ extract, etc.) │
                             └──────────────┬───────────────────────────┘
                    fixtures/ (RO)         │         out/ (RW)
```

| Capa | Ubicación |
|------|-----------|
| **Comportamiento (prompt)** | `agent/prompt.md` |
| **Conocimiento** | `src/knowledge/registro-contratos.md` |
| **Ejecución / reglas** | `src/tools/*.ts` |
| **Demo sin LLM** | `demo.ts` |
| **Adaptador mock (defensa sin API key)** | `src/llm/mock.ts` |

## 3. Ciclo del agente

- Entrada: `POST /api/chat` con `{ sessionId?, message }`.
- `runAgentTurn` (`src/agent/cycle.ts`): hasta **25** iteraciones (`AGENT_MAX_ITERATIONS`); en cada vuelta el adaptador puede devolver tool calls → se validan con Zod (`src/tools/registry.ts`) → se ejecutan → resultados como mensajes `tool` al modelo.
- **Confirmación (CA3)**: si `contratos_validar` devuelve `requiere_revision` o `contratos_registrar` responde `requiere revisión`, la sesión guarda `pendingConfirmation` y el turno termina con pregunta explícita; el front muestra banner. Tras mensaje con “confirmo…”, el mock/OpenAI puede llamar `registrar` con `confirmado: true`.
- **Límites de costo**: `AGENT_MAX_TOKENS_PER_SESSION` (estimación por caracteres) y timeout LLM (`LLM_TIMEOUT_MS`).
- **Log CA4**: cada herramienta escribe en `out/log.jsonl` vía `appendToolLog`.

## 4. Elección del modelo

| Modo | Cuándo | Costo estimado |
|------|--------|----------------|
| **mock** (`LLM_PROVIDER=mock` o sin `OPENAI_API_KEY`) | Desarrollo y defensa sin clave | $0 |
| **OpenAI** `gpt-4o-mini` | Producción / demo con razonamiento libre | ~$0.01–0.05 por lote de 6 mensajes (depende de iteraciones) |

El mock **no** sustituye razonamiento natural del modelo; replica el flujo de `demo.ts` llamando herramientas en orden. OpenAI sigue disponible cambiando env.

## 5. Estrategia de extracción

- **P0 determinista** en `src/tools/extract.ts`: regex sobre `contrato.txt` / `otrosi.txt` (ID, NIT/RUC, objeto, montos COP/USD/PEN, plazos, cláusula GARANTÍAS).
- **Confianza**: explícito en texto → ≥0.9; plazo derivado de “12 meses + mes de firma” → ~0.68 (`msg-006`); valor indeterminado → valor 0 con confianza baja en monto.
- **El LLM no escribe el maestro**: solo orquesta; valores registrables salen de herramientas (`contratos_extraer` → `validar` → `registrar`).
- Tests: `src/tools/extract-fixtures.test.ts`, `npm run extract:report`.

## 6. Regla de gobierno

1. **Canal único**: `contratos@periferia-ficticia.com`, buzón administrado por **Analista de Contratos** (Administración), backup el líder de Administración.
2. **Obligación comercial**: enviar PDF firmado (o otrosí / acta de terminación) en **5 días hábiles** desde la firma; asunto `[CONTRATO] <Cliente> — <ID o referencia>`; copia al comercial en CC opcional.
3. **Acuse automático**: respuesta en **24 h** con id de mensaje, clasificación preliminar y, si aplica, “pendiente de revisión de campos X”.
4. **Excepciones**: sin firma → devolución al comercial; sin valor/plazo claro → registro bloqueado (`requiere_revision`) y escalamiento a **Controller Financiero**; remitente desconocido → se registra con advertencia, no bloquea.
5. **Cierre gap jun–ago 2026**: campaña única de 4 semanas — comerciales reenvían contratos firmados en el periodo; mesa de soporte con plantilla; meta ≥90 % de filas con evidencia en buzón.
6. **Indicador mensual**: **% contratos facturados en ERP que existen en el maestro** (meta ≥95 %); secundario: % mensajes procesados en &lt;48 h.

## 7. Decisiones y trade-offs

| Decisión | Alternativa descartada | Por qué |
|----------|------------------------|---------|
| Extracción regex P0 | LLM extrae campos directo | PRD exige determinismo y evitar alucinaciones en montos/fechas |
| Adaptador **mock** | Solo OpenAI | Permite demo del chat sin clave en la defensa |
| Sesiones en memoria | Persistencia en disco | Suficiente para el reto; API `GET /api/sessions/:id` para recuperar |
| Node + Vite (no Bun) | Bun en PRD | Entorno Windows del candidato con Node 22; scripts equivalentes |
| `registrar` con args extra (`clasificacion`, `fecha_registro`) | Re-validar siempre dentro de registrar | Facilita mock y trazabilidad; el prompt instruye al LLM a pasar salida de `validar` |

## 8. Supuestos

- Adjuntos llegan como `.txt` en fixtures (PDF con texto extraído); OCR fuera de alcance.
- Un solo tenant; sin auth (PRD).
- Fecha “hoy” la proporciona el usuario en el chat para alertas deterministas.
- El maestro fixture no se modifica; copia en `out/` (RN6).

## 9. Cobertura de historias de usuario

| HU | Estado | Notas |
|----|--------|-------|
| HU-1 Leer buzón | Hecho | `contratos_leer_buzon` + `procesados.json` |
| HU-2 Extraer | Hecho | `extract.ts` + confianza por campo |
| HU-3 Validar | Hecho | RN1–RN4, comerciales, revisión |
| HU-4 Registrar | Hecho | CSV, archivo, historial, procesados |
| HU-5 Alertas | Hecho | `out/alertas.md` |
| HU-6 Errores | Hecho | `{ ok: false, error }`, lote continúa |
| Chat + tool UI | Hecho | `web/` |
| Ciclo agente CA1–CA5 | Hecho | Parcial streaming (no implementado, opcional PRD) |
| `contratos_leer_pdf` P1 | No hecho | Opcional |
| Link público | Listo para deploy | `DEPLOY.md`, `Dockerfile`, `render.yaml` |

## 10. Uso de IA (construcción)

| Herramienta | Uso |
|-------------|-----|
| **Cursor (Claude)** | Implementación del reto, extracción, mock LLM, front, documentación |

Se descartó delegar extracción al LLM en runtime por alineación con RN5 y tests deterministas.

## 11. Riesgos en producción y mitigación

| Riesgo | Mitigación |
|--------|------------|
| PDF escaneados | OCR + cola de revisión humana |
| Buzón real (Exchange) | Conector IMAP/Graph; misma capa de herramientas |
| Mock en prod por error | Health expone `mock: true`; exigir `OPENAI_API_KEY` en prod |
| Gasto API | Topes de iteración/tokens ya configurables |
| Duplicados por nombre cliente | Priorizar `nit_cliente` (RN2) |

---

**Demo local**: `npm run demo` · Chat: `npm run dev` → http://localhost:5173 · Reset buzón: `npm run reset:out` o botón en UI.
