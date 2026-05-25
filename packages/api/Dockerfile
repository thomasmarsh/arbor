FROM node:22-alpine AS base
RUN npm install -g pnpm

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/common/package.json ./packages/common/
COPY packages/api/package.json    ./packages/api/
RUN pnpm install --frozen-lockfile

COPY packages/common ./packages/common
COPY packages/api    ./packages/api
COPY tsconfig.base.json ./

RUN pnpm --filter @arbo/common build
RUN pnpm --filter @arbo/api    build

FROM node:22-alpine AS runtime
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/common/package.json ./packages/common/
COPY packages/api/package.json    ./packages/api/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/packages/api/dist    ./packages/api/dist

ENV NODE_ENV=production

EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]
