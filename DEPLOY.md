# Despliegue — Reto 02

Un solo servicio expone **chat + API** en el puerto `PORT` (front estático en `/`, API en `/api/*`).

## Opción A — Render (recomendada)

1. Sube el proyecto a **GitHub** (solo carpeta `reto-02` o monorepo con root en `reto-02`).
2. En [Render](https://render.com) → **New** → **Blueprint** (si el repo incluye `render.yaml`)  
   **o** **New Web Service** → **Docker**, Dockerfile en la raíz de `reto-02`.
3. Variables (Render las inyecta vía `render.yaml` o manual):

   | Variable | Valor |
   |----------|--------|
   | `LLM_PROVIDER` | `mock` |
   | `ALLOW_DEMO_RESET` | `true` |
   | `NODE_ENV` | `production` |
   | `PORT` | `10000` (Render suele asignar; deja que Render setee `PORT`) |

4. **Health check path:** `/api/health`
5. Tras el deploy, abre la URL del servicio (ejemplo desplegado: https://reto-02-contratos-amxv.onrender.com/)
6. Copia esa URL en `README.md` (sección link de evaluación).

**Nota:** En plan free el disco es **efímero**; al reiniciar el contenedor se pierde `out/`. Para la demo: **Resetear buzón** en la UI o procesar de nuevo.

### OpenAI en producción (opcional)

```
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...   (secret en Render, nunca en el repo)
OPENAI_MODEL=gpt-4o-mini
```

---

## Opción B — Docker local / VPS

```bash
docker build -t reto-02 .
docker run --rm -p 3000:3000 -e ALLOW_DEMO_RESET=true reto-02
```

Abre http://localhost:3000

---

## Opción C — Node sin Docker (Railway, Fly, VM)

```bash
npm ci
npm run build
PORT=3000 LLM_PROVIDER=mock ALLOW_DEMO_RESET=true npm start
```

Requiere Node 20+ y que el proceso sirva `dist/web` (ya implementado en `src/server.ts`).

---

## Verificación post-deploy

```bash
curl -s https://TU-URL/api/health
```

Esperado: `"ok":true`, `"mock":true` (si usas mock).

Demo en el navegador:

1. **Resetear buzón**
2. **Ejecutar demo del buzón**
3. Confirmar **msg-006** cuando lo pida

---

## Checklist entrega PRD

- [ ] URL pública en `README.md`
- [ ] Servicio activo el día de la defensa
- [ ] Zip/repo sin `node_modules/`, `out/`, `.env`
