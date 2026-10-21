FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:web

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV LLM_PROVIDER=mock
ENV ALLOW_DEMO_RESET=true
ENV PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist/web ./dist/web
COPY agent ./agent
COPY fixtures ./fixtures
COPY src ./src
COPY tsconfig.json ./tsconfig.json

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["npx", "tsx", "src/server.ts"]
