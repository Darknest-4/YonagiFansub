# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Yonagi Fansub platform.
#
# Stages: deps → builder → runner. The runner carries only Next's standalone
# output plus the Prisma engine — roughly 180 MB rather than the ~1.2 GB a
# single-stage build with node_modules would produce, and with no build
# toolchain left in the image to be exploited.

# ─────────────────────────────────────────────────────────────────────────────
# 1. Dependencies
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Prisma's engines need OpenSSL on Alpine.
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
COPY prisma ./prisma

# `npm ci` for a reproducible install; the cache mount keeps rebuilds fast
# without baking the cache into a layer.
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

# The build never opens a database connection — every page renders per request
# (see the root layout). These values exist only to satisfy `env.ts`, which
# parses at import time and would otherwise refuse to load; the real ones arrive
# at runtime. `DATABASE_URL` deliberately points nowhere: if a future change
# reintroduces a query at build time, it fails here rather than on the deploy.
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

# Never run the app as root.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema, engine and seed are needed for `migrate deploy` on release.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# The scripts directory carries `db:sql`, which every release runs.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Upload target for MEDIA_DRIVER=local. Created and owned here so the app can
# write without running as root; mount a volume over it to keep uploads across
# deploys, or switch to MEDIA_DRIVER=s3 and leave it empty.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage
VOLUME ["/app/storage/uploads"]

USER nextjs
EXPOSE 3000

# The app's own readiness probe: it fails when the database is unreachable, so
# an instance that cannot serve traffic is taken out of rotation.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

# tini reaps zombies and forwards signals, so SIGTERM actually stops the server.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
