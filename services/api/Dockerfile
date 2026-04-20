FROM node:20-alpine

WORKDIR /app

# Copy monorepo root files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/ ./services/

RUN npm install -g pnpm@latest
RUN pnpm install --frozen-lockfile

EXPOSE 4000

CMD ["pnpm", "--filter", "@bet/service-api", "start"]
