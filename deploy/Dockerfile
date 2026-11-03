# Docker Office — imagem do servidor (frontend + API somente leitura)
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
# arquivos de root, processo como "node": o app não consegue alterar o próprio código
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules/three/build ./node_modules/three/build
COPY --from=build /app/node_modules/three/examples/jsm ./node_modules/three/examples/jsm
COPY --from=build /app/web/index.html ./web/
COPY --from=build /app/web/build ./web/build
COPY --from=build /app/web/styles ./web/styles
COPY --from=build /app/web/config ./web/config
COPY server/src ./server/src
# o servidor roda TypeScript direto (type stripping do Node ≥ 22.18), sem etapa de build
RUN node -e "const [a,b]=process.versions.node.split('.').map(Number);if(a<22||(a===22&&b<18))throw new Error('Node >= 22.18 necessário')"
USER node
EXPOSE 8420
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8420/ || exit 1
CMD ["node", "server/src/index.ts"]
