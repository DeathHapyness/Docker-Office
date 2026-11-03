# Docker Office — imagem do servidor (frontend estático; backend Docker entra nas próximas etapas)
# Build:  docker build -f deploy/Dockerfile -t docker-office .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY web ./web
RUN npx tsc -p web/tsconfig.json && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=8420 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=root:root /app/package.json ./
COPY --from=build --chown=root:root /app/node_modules/three ./node_modules/three
COPY --chown=root:root scripts/serve.mjs ./scripts/serve.mjs
COPY --from=build --chown=root:root /app/web ./web
# arquivos de root, processo como "node": o app não consegue alterar o próprio código
USER node
EXPOSE 8420
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8420/ || exit 1
CMD ["node", "scripts/serve.mjs"]
