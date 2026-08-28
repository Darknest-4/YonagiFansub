# syntax=docker/dockerfile:1.7

#
# Multi-stage build for the Yonagi Fansub platform.
#

# ─────────────────────────────────────────────────────────────────────────────
# 1. Dependencies
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS deps

WORKDIR /app

# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Reproducible dependency install + Prisma client generation.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts && npx prisma generate


# ─────────────────────────────────────────────────────────────────────────────
# 2. Build
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache libc6-compat openssl

COPY --from=deps /app/node_modules ./node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time values only. Real values arrive at runtime.
ARG NEXT_PUBLIC_SITE_URL=https://yonagifansub.hu
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

ENV DATABASE_URL=postgresql://build:build@127.0.0.1:1/build
ENV AUTH_SECRET=build-time-placeholder-secret-not-used-at-runtime

RUN npm run build


# ─────────────────────────────────────────────────────────────────────────────
# 3. Runtime
# ─────────────────────────────────────────────────────────────────────────────

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl curl tini

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Never run the application as root.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nextjs

# Next.js standalone output.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema and ALL node_modules.
# The full node_modules is intentional because Prisma CLI has
# transitive dependencies such as "effect".
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Database scripts.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Local upload storage.
RUN mkdir -p /app/storage/uploads \
    && chown -R nextjs:nodejs /app/storage

VOLUME ["/app/storage/uploads"]

USER nextjs

EXPOSE 3000

# Health check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# tini handles signals and zombie processes.
ENTRYPOINT ["/sbin/tini", "--"]

# Run database migrations before starting Next.js.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node server.js"]
