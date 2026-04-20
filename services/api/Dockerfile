FROM node:20-alpine AS builder

WORKDIR /app

# Copy monorepo root for pnpm
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY services/ ./services/

RUN npm install -g pnpm@latest
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @bet/service-api build

FROM node:20-alpine AS runner

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY --from=builder /app/services/api/dist ./services/api/dist

RUN npm install -g pnpm@latest
RUN pnpm install --frozen-lockfile --prod

EXPOSE 4000

CMD ["node", "services/api/dist/server.js"]
