# Reto 02 — Agente de registro de contratos vigentes

Solución del reto técnico Periferia IT Group (Perxia 2.0). Especificación: `PRD.md`. Documentación de entrega: **`SOLUCION.md`**.

## Requisitos

- Node.js 20+
- Windows: si PowerShell bloquea `npm`, usa **`npm.cmd run dev`** o `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

## Arranque rápido (desarrollo)

```bash
cp .env.example .env   # en Windows: copy .env.example .env
npm install
npm run dev
```

| Servicio | URL |
|----------|-----|
| **Chat (front)** | http://localhost:5173 |
| **API** | http://localhost:3000 |

Por defecto **`LLM_PROVIDER=mock`** (sin `OPENAI_API_KEY`). Para OpenAI real: `LLM_PROVIDER=openai` y `OPENAI_API_KEY=sk-...`.

## Demo sin chat (determinista)

```bash
npm run demo
```

Procesa los 6 mensajes, confirma `msg-006`, genera `out/alertas.md`.

Reiniciar solo `out/` (buzón pendiente de nuevo):

```bash
npm run reset:out
```

En la UI: botón **Resetear buzón** (requiere `ALLOW_DEMO_RESET=true` en `.env` si usas modo producción).

## Producción local (un puerto)

```bash
npm run build
npm start
```

Abre http://localhost:3000 (API + front estático en `dist/web`).

## Docker

```bash
docker compose up --build
```

App en http://localhost:3000 con mock LLM.

## Link para evaluación (§9.3 PRD)

Guía paso a paso: **[DEPLOY.md](./DEPLOY.md)** (Render + Docker + checklist).

**Render (rápido):** repo en GitHub → New Web Service → Docker → health `/api/health`  
O usa el blueprint **`render.yaml`** en la raíz del proyecto.

**URL pública (demo en Render):**

> https://reto-02-contratos-amxv.onrender.com/

Health: https://reto-02-contratos-amxv.onrender.com/api/health

Si solo defiendes en local, indícalo en la entrega (penalización −10 según PRD).

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | `{ ok, provider, model, llmReady, mock }` |
| `POST` | `/api/chat` | `{ sessionId?, message }` → `{ reply, toolCalls[], needsConfirmation }` |
| `GET` | `/api/sessions/:id` | Historial de sesión |
| `POST` | `/api/demo/reset-out` | Reinicia `out/` (dev / `ALLOW_DEMO_RESET=true`) |

## Estructura

| Ruta | Rol |
|------|-----|
| `fixtures/` | Datos de prueba (solo lectura) |
| `out/` | Salida en ejecución (no commitear) |
| `src/tools/contratos.ts` | Herramientas P0 |
| `demo.ts` | Verificación sin LLM |
| `agent/prompt.md` | System prompt |
| `modulo/` | Bonus: agente empaquetado (PRD §9.4) |
| `SOLUCION.md` | Entrega obligatoria |

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | API + Vite en paralelo |
| `npm run demo` | Procesamiento buzón sin LLM |
| `npm run reset:out` | Limpia `out/` y copia maestro |
| `npm run build` | Build front + listo para `npm start` |
| `npm start` | Servidor producción (sirve `dist/web`) |
| `npm test` | Tests de extracción |
| `npm run typecheck` | TypeScript backend |

## Entrega

Zip o repo **sin** `node_modules/`, `out/`, `.env`. Incluir `SOLUCION.md` y este README con link de prueba actualizado.
