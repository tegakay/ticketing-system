# syntax=docker/dockerfile:1

# ---- build: install everything, generate the Prisma client, compile TS ----
FROM node:22-slim AS build
WORKDIR /app
# Prisma's query engine needs OpenSSL, which the slim image does not ship.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: compiled output + node_modules (the prisma CLI is needed for `migrate deploy`) ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl curl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
    CMD curl -fs http://localhost:${PORT:-3000}/metrics >/dev/null || exit 1
# Apply pending migrations, then start. `migrate deploy` is safe to run on every boot.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
