# HRM – image production (Next.js standalone, chạy bằng user không phải root)
# Tầng builder còn dùng cho dịch vụ "migrate" (prisma migrate deploy, seed nền, tạo admin).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && groupadd -r hrm && useradd -r -g hrm -d /app hrm \
  && mkdir -p /app/storage /app/backups && chown -R hrm:hrm /app
COPY --from=builder --chown=hrm:hrm /app/.next/standalone ./
COPY --from=builder --chown=hrm:hrm /app/.next/static ./.next/static
COPY --from=builder --chown=hrm:hrm /app/node_modules/.prisma ./node_modules/.prisma
USER hrm
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
