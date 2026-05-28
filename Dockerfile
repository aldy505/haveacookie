FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./tsconfig.json
COPY config.json ./config.json
COPY src ./src
COPY scripts ./scripts

RUN npm run build
RUN npm prune --omit=dev

FROM gcr.io/distroless/nodejs24-debian13

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/config.json ./config.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["/nodejs/bin/node", "/app/scripts/healthcheck-db.mjs"]

CMD ["/app/dist/bot.js"]
