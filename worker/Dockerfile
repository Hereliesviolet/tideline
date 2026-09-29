# worker/Dockerfile – Multi-Stage Build

# Stage 1: Builder (alle Dependencies inkl. devDependencies für TypeScript-Build)
FROM node:20-alpine AS builder

WORKDIR /app

# Manifest + Prisma zuerst (besseres Layer-Caching)
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Alle Dependencies installieren (inkl. devDependencies für tsc)
RUN npm ci

# Restliche Projektdateien kopieren
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

# Prisma Client generieren + TypeScript Build
RUN npx prisma generate && npm run build

# Stage 2: Production (nur Runtime-Dependencies)
FROM node:20-alpine

WORKDIR /app

# Nur Manifest + Prisma-Schema kopieren
COPY package.json package-lock.json ./
COPY prisma ./prisma

# Nur Production-Dependencies installieren
RUN npm ci --omit=dev

# Generierten Prisma-Client aus Builder übernehmen (enthält schema-spezifischen Code)
COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma

# Build-Artefakte aus Builder übernehmen
COPY --from=builder /app/dist ./dist

# Production-Umgebung
ENV NODE_ENV=production

# Port des Workers
EXPOSE 9100

# Nicht als root laufen
USER node

# Startkommando
CMD ["node", "dist/index.js"]
