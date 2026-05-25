FROM node:22-alpine AS base
RUN npm install -g pnpm

# Build stage
FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/common/package.json ./packages/common/
COPY packages/bff/package.json     ./packages/bff/
COPY packages/ui/package.json      ./packages/ui/
RUN pnpm install --frozen-lockfile

COPY packages/common ./packages/common
COPY packages/bff    ./packages/bff
COPY packages/ui     ./packages/ui
COPY tsconfig.base.json ./

RUN pnpm --filter @arbor/common build
RUN pnpm --filter @arbor/ui     build
RUN pnpm --filter @arbor/bff    build

# Runtime stage
FROM node:22-alpine AS runtime
RUN npm install -g pnpm
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/common/package.json ./packages/common/
COPY packages/bff/package.json     ./packages/bff/
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/common/dist ./packages/common/dist
COPY --from=builder /app/packages/bff/dist    ./packages/bff/dist
COPY --from=builder /app/packages/ui/dist     ./packages/ui/dist

ENV NODE_ENV=production
ENV ARBOR_UI_DIST=/app/packages/ui/dist

EXPOSE 3000
CMD ["node", "packages/bff/dist/index.js"]
