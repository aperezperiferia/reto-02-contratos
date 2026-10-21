---
name: registro-contratos
description: Proceso de registro de contratos vigentes desde buzón, maestro CSV y alertas (reto Periferia 02)
---

# Skill — Registro de contratos

Consulta este conocimiento al procesar el buzón o explicar reglas al usuario.

## Fuentes

- Buzón: `fixtures/reto-02/buzon/<msg-id>/`
- Maestro de trabajo: `out/sharepoint/maestro-contratos.csv`
- Comerciales: `fixtures/reto-02/comerciales.json`

## Flujo

`contratos_leer_buzon` → `contratos_extraer` → `contratos_validar` → `contratos_registrar` → `contratos_alertas`.

## Clasificaciones

nuevo | actualización | duplicado | rechazado (RN1–RN4).

## Revisión humana

Confianza &lt; 0.8 → no registrar sin `confirmado: true`.

## Gobierno

Canal único `contratos@periferia-ficticia.com`; comercial envía PDF firmado en 5 días hábiles; acuse en 24 h. Detalle en `SOLUCION.md` sección 6.

Para texto extendido ver `src/knowledge/registro-contratos.md` en el repositorio.
